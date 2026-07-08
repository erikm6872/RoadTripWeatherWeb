---
tags: [data-source]
---

# OSRM

The Open Source Routing Machine's **public demo server**:
`https://router.project-osrm.org`. Provides driving route geometry, total
distance/duration, and (used here) alternative routes.

## Where it's called

`getRoutesOSRM(start, end, maxAlternatives = 3)` — `static/api.js:241-271`.

- Calls `/route/v1/driving/{lon,lat};{lon,lat}` with
  `overview=full&geometries=geojson&annotations=duration&alternatives=3`.
- OSRM's coordinates are `lon,lat`; the app flips every coordinate pair to
  `[lat, lon]` immediately on receipt since that's what Leaflet expects.
- Builds a **cumulative driving-time array** (`cumTime`) aligned 1:1 with the
  route's coordinate list, by summing each leg's per-segment
  `annotation.duration` values. This is the array
  [[Trip-Planning-Flow|`samplePoints()`]] walks to find "the point ~1 hour
  into the drive," etc. — it's how the app knows *when* you'll be at any
  given point on the polyline, not just *where* it is.
- Returns an array of route objects, fastest first — OSRM's own ordering.
  `maxAlternatives` is a request for *up to* that many extra routes; OSRM
  may return fewer, or none, depending on the road network between the two
  points.

The server-side `services.py:get_route()` fetches only the single fastest
route (no `alternatives` param) — see [[Legacy-Flask-Backend]] for why that
matters ([[Weather-Aware-Routing]] is impossible without alternatives).

## Known limitations

- **This is explicitly a demo/testing server**, not a production routing
  endpoint. Both the README and `MOBILE.md` flag it: fine for personal use,
  but self-host OSRM or use a commercial router before distributing the app
  widely. No documented SLA or rate limit — it can simply be slow or
  degraded at times.
- No walking/cycling profiles are used (driving-only), and no traffic data —
  durations are free-flow estimates, not live ETAs.
- Alternative-route quality varies by region: sparse road networks (rural
  interstates) may only ever return one route, which silently disables
  [[Weather-Aware-Routing]] for that trip (the picker UI just doesn't
  appear).
