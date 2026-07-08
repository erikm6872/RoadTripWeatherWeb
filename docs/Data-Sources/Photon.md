---
tags: [data-source]
---

# Photon

OSM-data search-as-you-type API: `https://photon.komoot.io/api/`. Used
exclusively for the [[Location-Autocomplete|autocomplete dropdown]] on the
Start/Destination fields — Nominatim's own policy forbids using it this way.

## Where it's called

`suggestPlaces(query, limit, bias)` — `static/api.js:164-205`, called from
`attachAutocomplete()` in `static/app.js:44-137` on a 250ms debounce, only
once the query is 3+ characters.

- Requests `limit * 2` results and de-duplicates on `label|sublabel` down to
  `limit` (default 5), since Photon can return near-duplicate entries.
- Optionally biases ranking toward a `{lat, lon}` point — the app passes
  `map.getCenter()`, so suggestions favor places near the current map view,
  Google-Maps-style. The bias code defensively accepts either `{lat, lon}`
  or Leaflet's `{lat, lng}` shape and skips sending the param entirely if
  either coordinate is missing, since Photon returns a 400 on
  `lat`/`lon=undefined`.
- Builds `{label, sublabel, lat, lon}` from each GeoJSON feature: `label` is
  the place name (or street + house number if unnamed), `sublabel` joins
  city/state/country, skipping any that duplicate the label.

Not present in the server-side `services.py` at all — see
[[Legacy-Flask-Backend]].

## Known limitations

- Public instance run by Komoot, no documented hard rate limit but no SLA
  either — a shared best-effort service.
- Suggestion failures are swallowed silently (`catch { /* best-effort */ }`
  in `app.js`) — the text input still works for manual entry, but a Photon
  outage means no dropdown and no error message, which could read as "the
  feature is just broken" to a user who doesn't know to keep typing and
  submit.
- Out-of-order network responses are handled (a `seq` counter discards stale
  responses that resolve after a newer query), but there's no retry — a
  single failed request just produces an empty dropdown for that keystroke.
