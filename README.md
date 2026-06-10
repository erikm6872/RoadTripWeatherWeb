# 🚗 Road Trip Weather

A web + mobile app that plans a driving route between two places and overlays
the weather forecast for towns along the way — **timed to when you'll actually
be there**. Driving through Tucson in an hour? You see Tucson's forecast for an
hour from now, not for right now. Stops with dangerous conditions are
highlighted, and an alert banner flags extreme weather threats on the route.

## How it works

For each leg of the route the app estimates your arrival time, then looks up
the hourly forecast for the nearest town at that exact hour.

The app is **fully client-side** — all data comes from free, no-API-key public
services called directly from the browser, so there is no backend to run or
host. That's also what makes it installable on Android and iOS.

| Concern        | Service                                   |
|----------------|-------------------------------------------|
| Geocoding      | [Nominatim](https://nominatim.org/) (OpenStreetMap) |
| Autocomplete   | [Photon](https://photon.komoot.io/) (OSM, built for search-as-you-type) |
| Routing        | [OSRM](http://project-osrm.org/) public demo server |
| Weather        | [Open-Meteo](https://open-meteo.com/) hourly forecast |
| Map / tiles    | [Leaflet](https://leafletjs.com/) + OpenStreetMap tiles |

## Run it (development)

```bash
pip install -r requirements.txt
python app.py
```

Then open <http://127.0.0.1:5000>, enter a start and destination (e.g.
`Phoenix, AZ` → `Tucson, AZ`), pick a departure time, and click **Plan trip**.

(The Flask server is just a convenient static file server for development —
the app logic runs in the browser. `/api/trip` is also still available as a
standalone JSON API.)

## Install on Android & iOS

See **[MOBILE.md](MOBILE.md)**. Two options per platform:

1. **PWA** — host the `www/` bundle on any HTTPS static host, then *Install
   app* in Chrome (Android) or Share → *Add to Home Screen* in Safari (iOS).
   No build tools needed.
2. **Capacitor** — `npm install`, then `npm run android:add` (build the APK in
   Android Studio, any OS) or `npm run ios:add` (build in Xcode, requires a
   Mac).

Build the static bundle with:

```bash
python build_www.py    # outputs www/
```

## Project layout

```
templates/index.html    App shell (PWA-enabled)
static/api.js           Client-side data layer: geocoding, routing, weather, hazards
static/app.js           UI logic (Leaflet map, cards, alerts, scroll-sync)
static/style.css        Styles (responsive: desktop sidebar / mobile stacked)
static/icons/           Launcher icons (regenerate with make_icons.py)
manifest.webmanifest    PWA manifest
sw.js                   Service worker (caches the app shell)
build_www.py            Assembles the static www/ bundle for packaging
capacitor.config.json   Capacitor (Android / iOS) configuration
MOBILE.md               Android & iOS install / build instructions
app.py                  Flask dev server + optional /api/trip JSON API
services.py             Server-side copy of the data layer (used by /api/trip)
weather_codes.py        WMO weather-code tables + hazard assessment (server)
```

## Notes & limits

- Nominatim allows ~1 request/second, so reverse-geocoding the waypoints is
  rate-limited; a long trip with many stops takes a few seconds to plan.
- The OSRM demo server is for light/development use. For production or wide
  distribution, host your own OSRM instance or use a routing provider with an
  SLA.
- Open-Meteo provides hourly forecasts up to ~16 days out.
- The installed app caches its shell for instant startup, but live forecasts,
  routing and map tiles need a network connection.
