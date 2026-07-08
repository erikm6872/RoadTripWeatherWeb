---
tags: [architecture, backend, stale]
---

# Legacy Flask Backend — `app.py`, `services.py`, `weather_codes.py`

> **Status: stale.** Not touched since the initial commit (`dd7c2d4`). The
> client-side [[Client-Data-Layer|api.js]] has since gained two features this
> code does not have. Read this page before relying on `/api/trip` for
> anything.

## What it actually does today

`app.py` (124 lines) is a small Flask app with three roles:

1. **Static file server for local dev** — serves `templates/index.html`,
   `sw.js`, and `manifest.webmanifest` at the origin root (required so the
   service worker's scope covers the whole app). This is what
   `.claude/launch.json` runs (`python app.py`, port 5000) and what the
   README's "Run it (development)" section documents.
2. **`/api/trip` JSON endpoint** — a server-side re-implementation of trip
   planning: geocode → single route → sample waypoints → weather per
   waypoint → hazard assessment. Query params: `from`, `to`, `depart`
   (ISO 8601 UTC), `interval` (seconds).
3. Nothing else — no auth, no persistence, no other endpoints.

`services.py` (253 lines) and `weather_codes.py` (120 lines) are a
Python port of the same Nominatim/OSRM/Open-Meteo logic that lives in
`static/api.js`, written independently (not shared code — a JS file and a
Python file can't share source).

## The feature gap

Compare against [[Client-Data-Layer]] / [[Weather-Aware-Routing]]:

| Feature | `static/api.js` | `services.py` / `app.py` |
|---|---|---|
| Autocomplete (Photon) | ✅ `suggestPlaces()` | ❌ not implemented |
| Route alternatives | ✅ `getRoutesOSRM(..., maxAlternatives=3)` | ❌ `get_route()` fetches exactly one route, no `alternatives` param |
| Weather-safe alternate route suggestion | ✅ `planTrip()` picks the safest alternative with the closest ETA | ❌ impossible without alternatives — `/api/trip` always returns the fastest route regardless of hazards |
| Bounded-concurrency weather fetch w/ 429 backoff | ✅ `mapLimit()` + retry in `getJSON()` | ❌ weather lookups are fetched serially, no retry |
| Hazard assessment (WMO code + heat/cold/wind thresholds) | ✅ | ✅ — this part *is* kept in parity (compare `weather_codes.py`'s `HAZARD_WEATHER`/`assess_hazards` to `api.js`'s `HAZARD_WEATHER`/`assessHazards` — identical thresholds) |

The hazard-assessment tables are the one piece that's still duplicated
correctly in both languages. Everything added in the last three feature
commits (autocomplete, GPS start, weather-aware routing) landed in the JS
data layer only.

## Why this probably isn't urgent

The README already frames `/api/trip` as a secondary, "still available"
interface — the app's actual UI (`templates/index.html` +
`static/app.js`) never calls it; it calls `planTrip()` in `static/api.js`
directly, client-side. So the divergence doesn't affect anyone using the
installed/hosted app.

It matters only if:
- Something external depends on `/api/trip` as a stable JSON API, or
- A future contributor assumes `services.py` is a maintained mirror of
  `api.js` and edits one without the other.

## If you pick this back up

Two honest options, no code changes made yet:
1. **Bring it to parity** — port `getRoutesOSRM`'s alternatives + `planTrip`'s
   route-selection logic into `services.py`/`app.py`.
2. **Mark it explicitly legacy or remove it** — since the client-side app
   doesn't need it, delete `app.py`/`services.py`/`weather_codes.py` (and
   trim `requirements.txt`), or fence them behind a clear "unmaintained,
   dev-only" note, to stop future drift from being confusing.
