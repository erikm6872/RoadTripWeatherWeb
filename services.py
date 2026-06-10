"""External-data services for the Road Trip Weather app.

All three providers are free and require no API key:

* **Nominatim** (OpenStreetMap) - forward & reverse geocoding.
* **OSRM** public demo server - driving route + per-segment durations.
* **Open-Meteo** - hourly weather forecast.

Please respect each provider's usage policy. Nominatim in particular asks for
a descriptive ``User-Agent`` and at most ~1 request/second, which is why
reverse geocoding the sampled points is rate-limited below.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import requests

from weather_codes import assess_hazards, describe

# A descriptive User-Agent is required by the Nominatim usage policy.
USER_AGENT = "RoadTripWeatherWeb/1.0 (educational demo app)"
HTTP_TIMEOUT = 20

NOMINATIM = "https://nominatim.openstreetmap.org"
OSRM = "https://router.project-osrm.org"
OPEN_METEO = "https://api.open-meteo.com/v1/forecast"

# Be polite to Nominatim: minimum seconds between reverse-geocode calls.
_REVERSE_MIN_INTERVAL = 1.1
_last_reverse_call = 0.0


class ServiceError(Exception):
    """Raised when an upstream service fails or returns no usable result."""


def geocode(query: str):
    """Forward-geocode a place name to ``(lat, lon, display_name)``."""
    resp = requests.get(
        f"{NOMINATIM}/search",
        params={"q": query, "format": "json", "limit": 1},
        headers={"User-Agent": USER_AGENT},
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ServiceError(f"Could not find a location for '{query}'.")
    top = data[0]
    return float(top["lat"]), float(top["lon"]), top.get("display_name", query)


def reverse_geocode(lat: float, lon: float) -> str:
    """Reverse-geocode coordinates to a friendly place label (city/town).

    Rate-limited to honour the Nominatim usage policy.
    """
    global _last_reverse_call
    wait = _REVERSE_MIN_INTERVAL - (time.monotonic() - _last_reverse_call)
    if wait > 0:
        time.sleep(wait)
    _last_reverse_call = time.monotonic()

    try:
        resp = requests.get(
            f"{NOMINATIM}/reverse",
            params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
            headers={"User-Agent": USER_AGENT},
            timeout=HTTP_TIMEOUT,
        )
        resp.raise_for_status()
        addr = resp.json().get("address", {})
    except (requests.RequestException, ValueError):
        return f"{lat:.2f}, {lon:.2f}"

    for key in ("city", "town", "village", "hamlet", "suburb",
                "municipality", "county"):
        if addr.get(key):
            label = addr[key]
            state = addr.get("state")
            return f"{label}, {state}" if state else label
    return addr.get("state") or f"{lat:.2f}, {lon:.2f}"


def get_route(start, end):
    """Fetch a driving route from OSRM.

    ``start`` / ``end`` are ``(lat, lon)`` tuples. Returns a dict with:

    * ``coords``  - list of ``[lat, lon]`` along the route.
    * ``cum_time``- cumulative driving seconds aligned to ``coords``.
    * ``distance``- total metres.
    * ``duration``- total seconds.
    """
    # OSRM expects lon,lat ordering.
    coord_str = f"{start[1]},{start[0]};{end[1]},{end[0]}"
    resp = requests.get(
        f"{OSRM}/route/v1/driving/{coord_str}",
        params={
            "overview": "full",
            "geometries": "geojson",
            "annotations": "duration",
        },
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ServiceError("No driving route could be found between those points.")

    route = data["routes"][0]
    # geometry coordinates are [lon, lat]; flip to [lat, lon] for Leaflet.
    coords = [[c[1], c[0]] for c in route["geometry"]["coordinates"]]

    # Build cumulative driving time aligned to each coordinate.
    cum_time = [0.0]
    for leg in route["legs"]:
        for seg in leg["annotation"]["duration"]:
            cum_time.append(cum_time[-1] + seg)
    # Guard against any length mismatch between coords and durations.
    if len(cum_time) != len(coords):
        n = min(len(cum_time), len(coords))
        coords, cum_time = coords[:n], cum_time[:n]

    return {
        "coords": coords,
        "cum_time": cum_time,
        "distance": route["distance"],
        "duration": route["duration"],
    }


def sample_points(route, interval_seconds, max_points=12):
    """Pick waypoints along ``route`` roughly every ``interval_seconds``.

    Always includes the origin and destination. Auto-widens the interval so the
    number of weather lookups stays at or below ``max_points``.
    """
    coords = route["coords"]
    cum_time = route["cum_time"]
    total = cum_time[-1] if cum_time else 0.0

    # Widen interval if the trip would produce too many sample points.
    if total > 0 and total / interval_seconds > max_points - 1:
        interval_seconds = total / (max_points - 1)

    targets = []
    t = 0.0
    while t < total:
        targets.append(t)
        t += interval_seconds
    targets.append(total)  # always include destination

    samples = []
    used_indices = set()
    min_gap = interval_seconds * 0.5  # drop stops bunched too close together
    j = 0
    for k, target in enumerate(targets):
        # Advance to the first coordinate at/after the target driving time.
        while j < len(cum_time) - 1 and cum_time[j] < target:
            j += 1
        if j in used_indices:
            continue
        is_destination = k == len(targets) - 1
        # Skip a stop that lands too close to the previous one, unless it's
        # the destination (always keep the final stop).
        if samples and not is_destination and \
                cum_time[j] - samples[-1]["drive_seconds"] < min_gap:
            continue
        # If the destination is nearly on top of the last kept stop, replace it.
        if samples and is_destination and \
                cum_time[j] - samples[-1]["drive_seconds"] < min_gap:
            samples.pop()
        used_indices.add(j)
        samples.append({
            "lat": coords[j][0],
            "lon": coords[j][1],
            "drive_seconds": cum_time[j],
        })
    return samples


def get_weather_at(lat, lon, when_utc: datetime):
    """Return the forecast for ``(lat, lon)`` nearest to ``when_utc``.

    Uses Open-Meteo hourly data in UTC and matches the closest hour.
    """
    # Request a window spanning the arrival time (forecast_days from today).
    days_ahead = max(1, (when_utc.date() - datetime.now(timezone.utc).date()).days + 2)
    days_ahead = min(days_ahead, 16)  # Open-Meteo hourly limit.

    resp = requests.get(
        OPEN_METEO,
        params={
            "latitude": lat,
            "longitude": lon,
            "hourly": "temperature_2m,apparent_temperature,precipitation,"
                      "precipitation_probability,weathercode,wind_speed_10m",
            "timezone": "GMT",
            "forecast_days": days_ahead,
            "wind_speed_unit": "mph",
            "temperature_unit": "fahrenheit",
            "precipitation_unit": "inch",
        },
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    hourly = resp.json().get("hourly", {})
    times = hourly.get("time", [])
    if not times:
        raise ServiceError("Weather data unavailable for this location.")

    # Find the hour closest to the arrival time.
    target_ts = when_utc.timestamp()
    best_i, best_diff = 0, float("inf")
    for i, ts in enumerate(times):
        dt = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        diff = abs(dt.timestamp() - target_ts)
        if diff < best_diff:
            best_i, best_diff = i, diff

    code = hourly["weathercode"][best_i]
    desc, emoji = describe(code)

    def at(field):
        vals = hourly.get(field)
        return vals[best_i] if vals and best_i < len(vals) else None

    result = {
        "temperature": at("temperature_2m"),
        "apparent_temperature": at("apparent_temperature"),
        "precipitation": at("precipitation"),
        "precipitation_probability": at("precipitation_probability"),
        "wind_speed": at("wind_speed_10m"),
        "weathercode": code,
        "description": desc,
        "emoji": emoji,
        "forecast_time_utc": times[best_i],
    }

    # Flag driving hazards / extreme-weather threats for this stop.
    severity, hazards = assess_hazards(
        weathercode=code,
        apparent_temperature=result["apparent_temperature"],
        temperature=result["temperature"],
        wind_speed=result["wind_speed"],
    )
    result["severity"] = severity
    result["hazards"] = hazards
    return result
