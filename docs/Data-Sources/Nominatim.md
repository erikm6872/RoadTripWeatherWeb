---
tags: [data-source]
---

# Nominatim

OpenStreetMap's free geocoding service: `https://nominatim.openstreetmap.org`.
Used for **one-shot** forward and reverse geocoding only — not autocomplete
(see [[Photon]] for why).

## Where it's called

- `geocode(query)` — `static/api.js:149-157` — forward geocode a typed place
  name (`/search?q=...&format=json&limit=1`), used when the user types a
  place and doesn't pick an autocomplete suggestion.
- `reverseGeocode(lat, lon)` — `static/api.js:211-231` —
  `/reverse?lat=...&lon=...&format=json&zoom=10`, walks the returned address
  fields (`city`, `town`, `village`, `hamlet`, `suburb`, `municipality`,
  `county`, in that order) to build a friendly "City, State" label. Falls
  back to raw coordinates if the request fails.

Both are duplicated server-side in `services.py` (`geocode()` /
`reverse_geocode()`) — see [[Legacy-Flask-Backend]].

## Rate limit

Nominatim's usage policy caps requests at **~1/second** per client. The
client-side implementation enforces this with a module-level timestamp
(`lastReverseCall`, `static/api.js:209`) that makes every `reverseGeocode`
call wait out the remainder of a 1100ms window before firing. This is why
naming a route's stops (`nameWaypoints()`) takes a few seconds for a long
trip with many waypoints — it's deliberately sequential, not parallelized.

Forward geocoding (`geocode()`) isn't throttled the same way because it's
only called twice per trip (origin + destination), and only when the user
didn't pick an autocomplete suggestion.

## Known limitations

- Public demo instance — no SLA, can be slow or rate-limit harder under
  load than the documented policy suggests.
- Requires a descriptive `User-Agent` per policy (enforced server-side in
  `services.py`; the browser's own `User-Agent` is used client-side, which
  Nominatim currently tolerates for the hosted app but is worth watching).
- Reverse geocoding at `zoom=10` picks a fairly coarse admin level — it will
  sometimes label a rural waypoint by its county rather than the nearest
  named place.
