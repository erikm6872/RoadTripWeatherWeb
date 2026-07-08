---
tags: [data-sources]
---

# Data Sources — Overview

The app has **zero API keys and zero paid dependencies**. Every external
call is to a free public service, made directly from the browser
(`static/api.js`). That's a deliberate tradeoff: it's what makes the app
free to run and easy to install, at the cost of relying on shared,
best-effort infrastructure with modest rate limits. See
[[Limitations-and-Risks]] for the consequences.

| Concern | Service | Used for |
|---|---|---|
| Geocoding | [[Nominatim]] | Turning a typed place name into coordinates; reverse-geocoding a waypoint into a display name |
| Autocomplete | [[Photon]] | Search-as-you-type suggestions in the Start/Destination fields |
| Routing | [[OSRM]] | Driving route geometry, duration, and alternative routes |
| Weather | [[Open-Meteo]] | Hourly forecast at each waypoint, matched to arrival time |
| Map tiles | [[Leaflet-and-OSM-Tiles]] | Rendering the base map |

## Why two different geocoders (Nominatim *and* Photon)?

Nominatim's own usage policy explicitly forbids using it for
search-as-you-type / autocomplete (too many requests per keystroke). Photon
is built by the same OSM ecosystem specifically for that use case, so the
app uses Nominatim only for one-shot forward/reverse geocoding and Photon
only for the live suggestion dropdown. See [[Location-Autocomplete]].

## Request path for a single planned trip

```
geocode(from)         → Nominatim  (skipped if the user picked an autocomplete suggestion)
geocode(to)           → Nominatim  (same)
getRoutesOSRM(...)     → OSRM       (fastest route + up to 3 alternatives)
getWeatherAt(...) × N  → Open-Meteo (one call per waypoint per candidate route,
                                      up to 5 concurrent — see mapLimit in
                                      Client-Data-Layer)
nameWaypoints(...)     → Nominatim  (reverse-geocode, sequential, ~1/sec,
                                      only for the route actually shown)
```
