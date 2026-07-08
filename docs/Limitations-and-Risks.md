---
tags: [reference]
---

# Limitations & Risks

A consolidated list of the app's known sharp edges — things to keep in mind
before extending it or pointing more traffic at it. Nothing here is broken;
it's the set of tradeoffs that come from
[[Overview|being fully client-side]] against free public APIs.

## Third-party service dependence

All five external services ([[Data-Sources-Overview]]) are free, shared,
best-effort infrastructure with **no SLA**:

- **[[OSRM]]** — explicitly a *demo* server. Both the README and
  `MOBILE.md` say to self-host OSRM or use a commercial router before
  distributing the app widely.
- **[[Nominatim]]** — ~1 request/second policy, enforced client-side by
  throttling reverse-geocode calls. A long trip with many stops takes
  several seconds just to *name* them, sequentially, after routing and
  weather are already done.
- **[[Photon]]** — no documented rate limit, but also no SLA; failures are
  swallowed silently, so an outage degrades autocomplete to "the dropdown
  just doesn't appear" with no visible error.
- **[[Open-Meteo]]** — 16-day hourly forecast horizon; trips planned further
  out silently clamp to the 16-day-ahead forecast rather than the actual
  target date.
- **[[Leaflet-and-OSM-Tiles|OSM tile server]]** — also a shared free
  resource with its own usage policy; not meant for high-traffic production
  use without a dedicated tile provider.

If this app ever needs to support meaningfully more traffic, self-hosting
OSRM (and possibly Nominatim/Photon) is the first thing to budget for.

## No offline trip planning

The [[PWA-and-Service-Worker|service worker]] caches only the app *shell*
(HTML/CSS/JS/icons + Leaflet). Every trip-planning call — geocoding,
routing, weather — is network-only. An installed app opens instantly
offline but can't plan or show a new trip without connectivity.

## Server-side code has drifted — see [[Legacy-Flask-Backend]]

`app.py`/`services.py`/`weather_codes.py` haven't been updated since the
first commit. `/api/trip` lacks autocomplete and can never suggest a
weather-safe alternate route (no route-alternatives support). Not urgent
since the live app doesn't call it, but a trap for anyone who assumes it's a
maintained mirror of `static/api.js`.

## Hazard thresholds are heuristic, not authoritative

[[Hazard-Assessment]]'s severity tiers (fog = hazard, heavy snow = extreme,
110°F+ = extreme heat, etc.) were authored as reasonable UX cutoffs, not
sourced from an official standard, and there's no integration with real
severe-weather alert feeds (e.g. NWS warnings). Treat the hazard banner as a
helpful heads-up, not a safety guarantee — nothing in the app currently
communicates that distinction to the end user, which is worth considering if
this is ever used for real trip decisions rather than as a demo/personal
tool.

## No automated tests

There is no test suite anywhere in the repo (frontend or backend). Any
refactor of `static/api.js`'s trip-planning logic, the hazard tables, or the
scroll-sync math in `static/app.js` currently has no regression safety net
beyond manual testing in a browser.

## Nominatim `User-Agent` header

Nominatim's usage policy asks for a descriptive `User-Agent`. The server
side (`services.py`) sets one explicitly. The client side (`static/api.js`)
can't — browsers block scripts from overriding the `User-Agent` header on
`fetch()` requests — so client-side calls go out with whatever `User-Agent`
the visitor's browser sends. This currently works in practice but is a
policy-compliance gap worth knowing about if Nominatim ever tightens
enforcement for the hosted app's traffic pattern.

## Security posture (informational, not a known vulnerability)

User-facing text interpolated into the DOM (place names, weather
descriptions from Nominatim/Photon/Open-Meteo) is consistently passed
through `escapeHtml()` before being placed via `innerHTML` — see
[[UI-Layer]]. This is the right pattern and appears to be applied
consistently; flagging it here just so it stays consistent as the code
grows rather than because anything is currently missing it.
