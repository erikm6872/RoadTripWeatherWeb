---
tags: [data-source]
---

# Open-Meteo

Free, no-key hourly weather API: `https://api.open-meteo.com/v1/forecast`.
This is the core service the whole app exists to use well — matching a
forecast hour to a *future* arrival time rather than showing "now."

## Where it's called

`getWeatherAt(lat, lon, whenUtc)` — `static/api.js:314-369`.

- Requests `forecast_days` sized to cover `whenUtc`: computed as
  `daysAhead = round((targetDate - today) / 1 day) + 2`, clamped to
  Open-Meteo's **16-day hourly forecast limit**. The `+2` pads for timezone
  rounding at day boundaries so the target hour is never just outside the
  requested window.
- Requested fields: `temperature_2m`, `apparent_temperature`,
  `precipitation`, `precipitation_probability`, `weathercode`,
  `wind_speed_10m` — all in **Imperial units** (`fahrenheit`, `mph`, `inch`),
  timezone forced to `GMT` so array indices line up with UTC math elsewhere
  in the app.
- Finds the single hourly entry whose timestamp is closest to `whenUtc`
  (linear scan over `hourly.time`, `static/api.js:339-342` — the array is
  short enough, ~16×24 entries max, that this is fine unoptimized).
- Runs the WMO `weathercode` through `describeWeather()` for a label+emoji,
  and the full result through [[Hazard-Assessment|`assessHazards()`]] to
  attach `severity` + `hazards` before returning.

## Where it's called *from*

Every waypoint of every candidate route, via `mapLimit(tasks, 5, ...)` in
`planTrip()` (`static/api.js:462-465`) — up to 5 concurrent requests across
all routes being evaluated, which is also why `getJSON()`'s 429/503 retry
exists: bursting several routes' worth of lookups at once is exactly the
scenario that can trip Open-Meteo's rate limiting.

## Known limitations

- **16-day hourly forecast horizon.** Planning a trip further out than that
  will silently clamp to the 16-day-ahead forecast rather than erroring —
  worth knowing if you ever add trip-planning further in advance.
- Forecast, not observation — a fast-moving storm cell can still surprise a
  driver even with a "correct" hourly match.
- No severe-weather-alert feed (e.g. NWS warnings) — hazard detection is
  entirely derived from the numeric forecast fields via
  [[Hazard-Assessment]], not from any official alert system.
