"""Road Trip Weather - Flask web app.

Generates a driving route between two places using free OpenStreetMap-based
services, then overlays the hourly weather forecast for towns along the way,
timed to *when you'll actually be there*.

Run:
    pip install -r requirements.txt
    python app.py
Then open http://127.0.0.1:5000
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, render_template, request, send_from_directory

import services
from services import ServiceError

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


# The service worker must be served from the origin root so its scope covers
# the whole app; same for the manifest, which sits beside it.
@app.route("/sw.js")
def service_worker():
    return send_from_directory(app.root_path, "sw.js",
                               mimetype="text/javascript")


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(app.root_path, "manifest.webmanifest",
                               mimetype="application/manifest+json")


@app.route("/api/trip")
def trip():
    """Plan a trip and return route geometry + timed weather waypoints.

    Query params:
        from    - origin place name (required)
        to      - destination place name (required)
        depart  - ISO 8601 departure time in UTC (optional, default: now)
        interval- seconds of driving between weather stops (optional)
    """
    origin = (request.args.get("from") or "").strip()
    dest = (request.args.get("to") or "").strip()
    if not origin or not dest:
        return jsonify({"error": "Please provide both a start and destination."}), 400

    # Parse departure time (UTC). Accept a trailing 'Z'.
    depart_raw = request.args.get("depart")
    if depart_raw:
        try:
            depart = datetime.fromisoformat(depart_raw.replace("Z", "+00:00"))
            if depart.tzinfo is None:
                depart = depart.replace(tzinfo=timezone.utc)
            depart = depart.astimezone(timezone.utc)
        except ValueError:
            return jsonify({"error": "Invalid departure time."}), 400
    else:
        depart = datetime.now(timezone.utc)

    try:
        interval = int(request.args.get("interval", 3600))
    except ValueError:
        interval = 3600
    interval = max(900, interval)  # at least 15 minutes between stops

    try:
        start = services.geocode(origin)
        end = services.geocode(dest)
        route = services.get_route((start[0], start[1]), (end[0], end[1]))
        samples = services.sample_points(route, interval)

        waypoints = []
        for s in samples:
            arrival = depart + _seconds(s["drive_seconds"])
            place = services.reverse_geocode(s["lat"], s["lon"])
            weather = services.get_weather_at(s["lat"], s["lon"], arrival)
            waypoints.append({
                "name": place,
                "lat": s["lat"],
                "lon": s["lon"],
                "drive_seconds": s["drive_seconds"],
                "arrival_utc": arrival.isoformat(),
                "weather": weather,
            })
    except ServiceError as exc:
        return jsonify({"error": str(exc)}), 502
    except requests.RequestException as exc:
        return jsonify({"error": f"Upstream service error: {exc}"}), 502

    return jsonify({
        "origin": {"query": origin, "display": start[2],
                   "lat": start[0], "lon": start[1]},
        "destination": {"query": dest, "display": end[2],
                        "lat": end[0], "lon": end[1]},
        "depart_utc": depart.isoformat(),
        "distance_m": route["distance"],
        "duration_s": route["duration"],
        "geometry": route["coords"],
        "waypoints": waypoints,
    })


def _seconds(s):
    from datetime import timedelta
    return timedelta(seconds=s)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', debug=True, port=port)
