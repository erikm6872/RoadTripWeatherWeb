---
tags: [reference]
---

# Glossary

## Hazard severity tiers

Used throughout [[Hazard-Assessment]], [[Weather-Aware-Routing]], and the
UI (`static/style.css` hazard classes):

- **`none`** — no detected threat; default state, no visual treatment.
- **`hazard`** — amber. A condition worth being aware of (fog, moderate
  snow, high wind, dangerous heat/cold, etc.).
- **`extreme`** — red, with a pulsing card animation (respects
  `prefers-reduced-motion`). A more severe version of the same category
  (heavy freezing rain, heavy snow, violent wind, extreme heat/cold, hail).

A route or stop's overall severity is always the **worst** of its individual
hazards (`SEVERITY_RANK: none < hazard < extreme`).

## WMO weather codes

Numeric `weathercode` values returned by [[Open-Meteo]], per the
[WMO weather interpretation code table](https://open-meteo.com/en/docs).
Mapped to description + emoji by `describeWeather()` in
[[Client-Data-Layer|api.js]] (and `describe()` in `weather_codes.py`).

| Code | Description | Hazard tier |
|---|---|---|
| 0 | Clear sky | — |
| 1 | Mainly clear | — |
| 2 | Partly cloudy | — |
| 3 | Overcast | — |
| 45 | Fog | hazard |
| 48 | Depositing rime fog | hazard |
| 51 / 53 / 55 | Light / moderate / dense drizzle | — |
| 56 / 57 | Light / dense freezing drizzle | hazard |
| 61 / 63 | Slight / moderate rain | — |
| 65 | Heavy rain | hazard |
| 66 | Light freezing rain | hazard |
| 67 | Heavy freezing rain | **extreme** |
| 71 / 73 | Slight / moderate snow | hazard |
| 75 | Heavy snow | **extreme** |
| 77 | Snow grains | hazard |
| 80 | Slight rain showers | — |
| 81 | Moderate rain showers | hazard |
| 82 | Violent rain showers | **extreme** |
| 85 | Slight snow showers | hazard |
| 86 | Heavy snow showers | **extreme** |
| 95 | Thunderstorm | hazard |
| 96 | Thunderstorm w/ slight hail | **extreme** |
| 99 | Thunderstorm w/ heavy hail | **extreme** |

Any code not in this table (or a missing/invalid value) falls back to
`("Unknown", "❓")` and contributes no weather-code-based hazard (the
temperature/wind checks still apply independently).

## Other terms used across this vault

- **Waypoint / stop** — a sampled point along a route where the app checks
  the weather, with its own arrival time and forecast. See
  [[Trip-Planning-Flow]] `samplePoints()`.
- **`cumTime` / cumulative driving time** — a running total of driving
  seconds aligned to each coordinate of an OSRM route, used to translate
  "how far along the route" into "what time will I be there." See [[OSRM]].
- **Shell (app shell)** — the fixed set of files (HTML/CSS/JS/icons)
  precached by the service worker so the app opens instantly; distinct from
  the live data (weather/routes/tiles), which is always network-only. See
  [[PWA-and-Service-Worker]].
- **`www/`** — the built, deployable bundle produced by
  [[Build-Pipeline|`build_www.py`]]; what both GitHub Pages and Capacitor
  actually serve/package.
