---
tags: [feature]
---

# Weather-Aware Routing

Added in commit `1a80a65` ("Suggest a weather-safe alternate route,
user-selectable"). When the fastest route runs through hazardous weather,
the app looks for a safer alternative and offers it as a user-selectable
option — it never silently reroutes.

## Selection algorithm

Inside [[Trip-Planning-Flow|`planTrip()`]], `static/api.js:470-490`:

```js
fastest.kind = "fastest";
routes = [fastest];

if (fastest.hazard.score > 0 && built.length > 1) {
  safer = built.slice(1)
    .filter(r => r.hazard.score < fastest.hazard.score)   // strictly safer
    .sort((a, b) =>
      Math.abs(a.duration_s - fastest.duration_s) -        // closest ETA first
        Math.abs(b.duration_s - fastest.duration_s) ||
      a.hazard.score - b.hazard.score)                     // tiebreak: safest
    [0];
  if (safer) {
    safer.kind = "alternate";
    safer.recommended = true;
    routes.push(safer);
  }
}
```

In words: **only ever offer a route that is both strictly safer *and* the
closest available match on drive time** to the fastest one. A route that's
dramatically slower isn't preferred over one that's only slightly slower,
even if the slower one is marginally safer — the tiebreak is ETA proximity,
not maximum safety. If no alternative is strictly safer, no suggestion is
made and the picker UI doesn't appear at all.

## Hazard score — `summarizeHazard()`

`static/api.js:390-398`. A route's `hazard` object is computed by walking
its waypoints:

- Each `extreme` waypoint: **+3** to `score`, increments `extremeCount`.
- Each `hazard` waypoint: **+1** to `score`, increments `hazardCount`.
- `worst` tracks the single worst severity seen (`none` / `hazard` /
  `extreme`).

Extreme weather is weighted 3× a plain hazard, so a route with one extreme
stop (score 3) is still considered worse than a route with two merely
hazardous stops (score 2) — the algorithm won't trade one severe threat for
two milder ones. See [[Hazard-Assessment]] for what turns a forecast into
`hazard` vs `extreme` in the first place.

## What the user sees

`renderRouteOptions()` in `static/app.js:330-360` — only rendered when
`data.routes.length >= 2` (i.e., a suggestion was actually found):

- A one-line banner: "⚠️ Hazardous weather on the fastest route — a safer
  route with a similar arrival time is suggested."
- Two cards, "Fastest" and "Safer route" (badged "Recommended"), each
  showing duration, a hazard badge (✓ Clear / ⚠️ N hazards), and the ETA
  delta vs. the fastest route.
- Clicking either card calls `selectRoute(index)` — see [[UI-Layer]] — which
  restyles the map polylines and swaps the sidebar detail view. **The user
  always makes the final call**; the app defaults to showing the fastest
  route's details (`selectedIndex = 0` in `planTrip()`) even when a safer
  alternative exists.

## Constraints of the current implementation

- Only ever evaluates **up to 3 alternative routes** (`maxAlternatives = 3`
  passed to `getRoutesOSRM`) — OSRM may return fewer depending on the road
  network (see [[OSRM]]), which silently disables this feature for routes
  with no real alternative path.
- Only the **single best** alternative is ever offered, never a full ranked
  list — this was a deliberate simplicity choice, not a technical limit.
- Not implemented server-side — see [[Legacy-Flask-Backend]].
