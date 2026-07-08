---
tags: [moc]
---

# Road Trip Weather — Documentation

A web + mobile app that plans a driving route between two places and overlays
the weather forecast for towns along the way, **timed to when you'll actually
be there**. This vault documents how it's built, why it's built that way, and
what its sharp edges are.

Open this `docs/` folder as an Obsidian vault (`Open folder as vault`), or add
it to an existing vault. Everything below is a wikilink — click through.

## Architecture

- [[Overview]] — big picture: fully client-side, no backend required
- [[Client-Data-Layer]] — `static/api.js`: geocoding, routing, weather, hazards
- [[UI-Layer]] — `static/app.js`: map, cards, alerts, scroll-sync
- [[PWA-and-Service-Worker]] — install-ability, offline shell caching
- [[Legacy-Flask-Backend]] — `app.py` / `services.py`: what it is and why it's stale

## Data sources

- [[Data-Sources-Overview]] — the five external services this app depends on
- [[Nominatim]] · [[Photon]] · [[OSRM]] · [[Open-Meteo]] · [[Leaflet-and-OSM-Tiles]]

## Features

- [[Trip-Planning-Flow]] — end-to-end walkthrough of `planTrip()`
- [[Weather-Aware-Routing]] — how the safer-alternate-route suggestion works
- [[Hazard-Assessment]] — the rules that turn a forecast into a threat level
- [[Location-Autocomplete]] — the Photon-backed suggestion dropdown
- [[GPS-Start-Location]] — geolocation for the start point
- [[Scroll-Sync-UI]] — the position-based "active stop" mechanism

## Build & deploy

- [[Build-Pipeline]] — `build_www.py` and the `www/` bundle
- [[Mobile-Packaging]] — Capacitor (Android/iOS) and PWA install paths
- [[GitHub-Pages-Deploy]] — the CI workflow

## Reference

- [[Limitations-and-Risks]] — rate limits, demo-server caveats, what's not tested
- [[Glossary]] — WMO weather codes, hazard severity tiers, terms used throughout
