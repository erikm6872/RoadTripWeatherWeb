---
tags: [feature]
---

# Trip Planning Flow — `planTrip()`

The single orchestration function that turns a start, destination, and
departure time into everything the UI renders. `static/api.js:443-510`.

## Step by step

```
onProgress("Finding locations…")
  resolvePlace(from) → geocode via Nominatim, unless already {lat,lon,display}
  resolvePlace(to)   → same

onProgress("Calculating routes…")
  getRoutesOSRM(start, end, maxAlternatives=3)  → OSRM, fastest + up to 3 alternatives

onProgress("Checking weather along each route…")
  samplePoints() on every candidate route         → waypoints per route
  mapLimit(all waypoints across all routes, 5, getWeatherAt)
                                                    → Open-Meteo, 5 concurrent max
  buildRoute() per route                           → attaches weather + hazard summary

fastest = routes[0]; routes = [fastest]
  if fastest.hazard.score > 0 and alternatives exist:
    pick the alternative with hazard.score < fastest's, closest ETA to fastest
    → routes.push(that one, marked recommended)

nameWaypoints(routes[selectedIndex].waypoints)     → Nominatim, sequential ~1/sec
  (only the default-selected route's stops are named up front;
   any other route is named lazily if the user switches to it — see UI-Layer)

return { origin, destination, depart_utc, routes, selectedIndex }
```

## Inputs

- `from` / `to`: a place-name string, **or** a `{lat, lon, display}` object
  (from a picked autocomplete suggestion or a GPS fix) — see
  [[Client-Data-Layer]] `resolvePlace()`.
- `departUtc`: ISO string, defaults to now.
- `intervalSeconds`: desired spacing between weather stops, clamped to a
  15-minute minimum (`Math.max(900, ...)`).
- `onProgress(message)`: called repeatedly with human-readable status text —
  this is what powers the "Finding locations… / Calculating routes… /
  Checking weather along each route… / Naming stops… (n/m)" status line in
  the UI.

## Waypoint sampling — `samplePoints()`

`static/api.js:280-309`. Given a route's `cumTime` array (cumulative driving
seconds per coordinate, from OSRM's per-segment durations — see [[OSRM]]),
picks points roughly every `intervalSeconds`:

- Always includes the origin (t=0) and destination (t=total) — **with one
  edge case**: if the drive is much shorter than half the interval (e.g. a
  5-minute trip with the default 1-hour interval), the origin sample gets
  popped and replaced by the destination sample (see below), so a very short
  trip can end up with only *one* weather stop, not an origin+destination
  pair. Locked in by a regression test — see [[Testing]].
- If the naive interval would produce more than `maxPoints` (default 12)
  stops, the interval is **widened** so the point count stays ≤ 12 — this
  caps how many Open-Meteo calls one trip can trigger, regardless of how
  long the drive is or how short an interval the user picked.
- Drops a stop that lands closer than half the (possibly widened) interval
  to the previous one — except the destination, which always **replaces** a
  too-close predecessor rather than being dropped, so the trip always ends
  on the actual destination's forecast. When the predecessor being replaced
  is the origin itself, this is the edge case above.

## Why routes are built in parallel, not one at a time

All candidate routes' waypoints are flattened into one task list and run
through a single `mapLimit(tasks, 5, ...)` call, rather than fetching one
route's weather fully before starting the next. This means checking 3
candidate routes doesn't take 3× as long — the 5-concurrent budget is shared
across all of them.

See also [[Weather-Aware-Routing]] for the alternate-route selection logic,
and [[Hazard-Assessment]] for how a forecast becomes a hazard score.
