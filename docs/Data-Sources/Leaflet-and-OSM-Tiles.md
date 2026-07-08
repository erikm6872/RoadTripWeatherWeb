---
tags: [data-source]
---

# Leaflet & OSM Tiles

The map itself: [Leaflet](https://leafletjs.com/) 1.9.4, loaded from the
`unpkg.com` CDN with a Subresource Integrity (SRI) hash
(`templates/index.html:16-19, 93-95`), rendering standard OpenStreetMap
raster tiles (`{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`,
`static/app.js:4-7`, `maxZoom: 19`).

## Role in the app

- Base map, route polylines (see [[UI-Layer]] `routeStyle()`), weather
  marker `divIcon`s, and popups.
- Leaflet's CSS/JS are the two CDN entries cached by the
  [[PWA-and-Service-Worker|service worker]]'s app shell — everything else
  network-only is a data API.

## Known limitations

- OSM's tile server is also a shared free resource with a
  [usage policy](https://operations.osmfoundation.org/policies/tiles/) —
  fine at personal-app scale, but not meant for high-traffic production use
  without a dedicated tile provider (MapTiler, Mapbox, etc.).
- Requires network connectivity to fetch new tiles; only whatever tiles were
  already fetched during the session are visible offline (the service worker
  doesn't precache tiles — see [[PWA-and-Service-Worker]]).
- Leaflet is loaded via CDN `<script>` tag, not bundled — there's no local
  fallback if `unpkg.com` is unreachable and the shell cache hasn't warmed
  yet (first-ever load with no connectivity would fail to render the map).
