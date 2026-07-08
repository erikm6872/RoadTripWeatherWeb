---
tags: [architecture, code]
---

# Client Data Layer — `static/api.js`

510 lines. Pure data/business logic — no DOM access. Everything here is a
plain function or a small class; `static/app.js` is the only consumer.

Related: [[UI-Layer]] · [[Trip-Planning-Flow]] · [[Weather-Aware-Routing]] ·
[[Hazard-Assessment]] · [[Data-Sources-Overview]]

## Sections (in file order)

| Section | Lines | Purpose |
|---|---|---|
| WMO weather codes | 20–53 | `WMO_CODES` table + `describeWeather()` — numeric code → description + emoji |
| Hazard assessment | 57–111 | `HAZARD_WEATHER` table + `assessHazards()` — see [[Hazard-Assessment]] |
| HTTP helper | 115–145 | `getJSON()` (fetch + 429/503 retry with backoff), `mapLimit()` (bounded-concurrency map) |
| Geocoding | 147–231 | `geocode()`, `suggestPlaces()`, `reverseGeocode()` — see [[Nominatim]] / [[Photon]] |
| Routing | 233–271 | `getRoutesOSRM()` — see [[OSRM]] |
| Waypoint sampling | 273–309 | `samplePoints()` — picks weather-check points along a route |
| Weather | 311–369 | `getWeatherAt()` — see [[Open-Meteo]] |
| Trip orchestration | 371–510 | `planTrip()` and helpers — see [[Trip-Planning-Flow]] |

## Public API (what `app.js` actually calls)

- **`planTrip({ from, to, departUtc, intervalSeconds, onProgress })`** — the
  one entry point for planning a full trip. Returns
  `{ origin, destination, depart_utc, routes, selectedIndex }`.
- **`suggestPlaces(query, limit, bias)`** — autocomplete suggestions for the
  location inputs. See [[Location-Autocomplete]].
- **`reverseGeocode(lat, lon)`** — coordinates → friendly place label. Used
  both to name waypoints and to label a GPS fix. See [[GPS-Start-Location]].
- **`nameWaypoints(waypoints, onProgress)`** — mutates a waypoint array in
  place, filling in `.name` via sequential reverse-geocoding. Called lazily,
  only for the route currently being displayed (`app.js:selectRoute`), so
  routes the user never looks at don't burn Nominatim's rate limit.

## Notable internal design choices

- **`getJSON()` retries transient failures.** A 429 or 503 triggers one
  1.2s-backoff retry (default `retries = 2`, i.e. up to 2 retries). This
  exists because checking 3 routes' worth of weather concurrently can burst
  past Open-Meteo's rate limit.
- **`mapLimit(items, limit, fn)`** runs at most `limit` promises concurrently
  while preserving output order — a hand-rolled concurrency pool (no
  dependency). Used in `planTrip()` to fetch weather for every waypoint
  across every candidate route through a single shared limit of 5.
- **`resolvePlace(place)`** accepts either a plain place-name string (which
  gets geocoded) or an already-resolved `{ lat, lon, display }` object. This
  is what lets a picked autocomplete suggestion or a GPS fix skip a redundant
  Nominatim geocode call — the UI layer passes the object straight through.
- **Reverse-geocode throttling is a module-level singleton.** `lastReverseCall`
  is shared across all callers, so the ~1 req/sec Nominatim limit is honored
  even if `nameWaypoints()` is somehow called more than once concurrently
  (currently it never is, but the guard doesn't depend on that).
