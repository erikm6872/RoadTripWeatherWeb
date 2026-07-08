---
tags: [architecture]
---

# Architecture Overview

Road Trip Weather is **fully client-side**. Everything — geocoding, routing,
weather lookups, hazard assessment, and trip orchestration — runs in the
browser as plain JavaScript with no build step and no app server. There is a
Flask app in the repo, but it's a leftover dev convenience, not something the
production app depends on; see [[Legacy-Flask-Backend]].

This single decision shapes almost everything else about the project:

- **No hosting cost / no backend to operate.** The static bundle (`www/`) can
  be dropped on any static host (GitHub Pages, Netlify, S3, …).
- **Installable as a PWA and as a native app.** Because there's no server,
  the same `www/` bundle is both the website and the input to
  [[Mobile-Packaging|Capacitor]] for Android/iOS.
- **All rate limits and quotas are the user's browser's problem.** Every API
  call — Nominatim, Photon, OSRM, Open-Meteo — is made directly from the
  client. See [[Limitations-and-Risks]].

## Layers

```
templates/index.html   App shell (loaded once; PWA meta tags, script tags)
        │
        ▼
static/api.js           Data layer — no DOM access, pure fetch + business logic
        │  exports: planTrip(), suggestPlaces(), reverseGeocode(), nameWaypoints()
        ▼
static/app.js           UI layer — Leaflet map, form handling, rendering, DOM events
        │
        ▼
static/style.css        Presentation (dark theme, responsive desktop/mobile layout)

sw.js                    Service worker — caches the shell above for offline/instant startup
build_www.py             Assembles templates/ + static/ + manifest + sw.js → www/
```

See [[Client-Data-Layer]] and [[UI-Layer]] for what's in each of the two main
JS files, and [[PWA-and-Service-Worker]] for how installability works.

## Request flow for one trip

1. User submits the form (`static/app.js` submit handler) →
2. `planTrip()` in `static/api.js` runs the full orchestration — geocode →
   route (+ alternatives) → sample waypoints → fetch weather for each → assess
   hazards → optionally pick a safer alternate route. See
   [[Trip-Planning-Flow]].
3. `app.js` receives the result and renders the map, route picker, stop
   cards, and any hazard alert banner.

No part of this touches a server the app author runs — every fetch in step 2
goes straight from the user's browser to Nominatim / OSRM / Open-Meteo.
