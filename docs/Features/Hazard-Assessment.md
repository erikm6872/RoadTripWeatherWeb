---
tags: [feature]
---

# Hazard Assessment — `assessHazards()`

Turns one Open-Meteo forecast into a severity tier (`none` / `hazard` /
`extreme`) plus a list of specific threats. `static/api.js:81-111`, mirrored
in `weather_codes.py:assess_hazards()` (kept in sync — see
[[Legacy-Flask-Backend]], this is the one piece of server code that *is*
current).

## Three independent checks, worst wins

`assessHazards({ weathercode, apparentTemperature, temperature, windSpeed })`
runs three unrelated checks and keeps the single worst tier found
(`SEVERITY_RANK = { none: 0, hazard: 1, extreme: 2 }`); each check can also
add its own hazard entry to the returned list (a stop can have multiple
simultaneous hazards, e.g. heavy snow *and* bitter cold).

### 1. Weather-code lookup — `HAZARD_WEATHER` table

| WMO code | Condition | Severity |
|---|---|---|
| 45, 48 | Fog / freezing fog | hazard |
| 56, 57 | Freezing drizzle | hazard |
| 65 | Heavy rain | hazard |
| 66 | Freezing rain (light) | hazard |
| **67** | **Heavy freezing rain** | **extreme** |
| 71, 73 | Snow | hazard |
| **75** | **Heavy snow** | **extreme** |
| 77 | Snow grains | hazard |
| 81 | Heavy rain showers | hazard |
| **82** | **Violent rain showers** | **extreme** |
| 85 | Snow showers | hazard |
| **86** | **Heavy snow showers** | **extreme** |
| 95 | Thunderstorm | hazard |
| **96, 99** | **Thunderstorm with hail** | **extreme** |

(Full WMO code table, including non-hazardous codes like "Clear sky" /
"Partly cloudy", is in [[Glossary]].)

### 2. Feels-like temperature

Uses `apparent_temperature` if present, else falls back to raw
`temperature`. Both directions checked independently:

| Feels-like | Severity | Label |
|---|---|---|
| ≥ 110°F | extreme | "Extreme heat N°F" |
| ≥ 100°F | hazard | "Dangerous heat N°F" |
| ≤ 0°F | extreme | "Extreme cold N°F" |
| ≤ 15°F | hazard | "Bitter cold N°F" |

### 3. Wind speed

| Wind speed | Severity | Label |
|---|---|---|
| ≥ 50 mph | extreme | "Violent wind N mph" |
| ≥ 35 mph | hazard | "High wind N mph" |

## Where the result is used

- **Per-stop UI**: sidebar card border tint (`.stop--hazard` /
  `.stop--extreme`, amber/red), a pulsing animation for extreme stops
  (disabled under `prefers-reduced-motion`), and a row of hazard chips
  (`hazardChips()` in `static/app.js:467-473`) listing each individual
  threat by label.
- **Map marker**: emoji + temp marker gets a `wx-hazard`/`wx-extreme` class
  and a warning emoji prefix for extreme stops.
- **Route-level alert banner**: [[UI-Layer]] `renderAlert()` — a red or
  amber banner listing every flagged stop, only shown if at least one exists.
- **Route selection**: [[Weather-Aware-Routing]] — `summarizeHazard()`
  aggregates every waypoint's severity into a single route score used to
  decide whether to offer a safer alternate.

## Design notes worth knowing before changing thresholds

- All thresholds assume **Imperial units** (°F, mph) — Open-Meteo is
  explicitly requested in Fahrenheit/mph (see [[Open-Meteo]]), so changing
  unit preference anywhere requires updating every threshold here too.
- Thresholds are hardcoded constants, not configurable per-user — there's no
  "sensitivity" setting; everyone sees the same hazard tiers.
- The rules were authored heuristically (no cited source for the exact
  cutoffs) — reasonable for a personal trip-planning aid, but worth treating
  as a UX signal rather than a safety-critical determination. There's no
  integration with official severe-weather alerts (NWS, etc.) — see
  [[Limitations-and-Risks]].
