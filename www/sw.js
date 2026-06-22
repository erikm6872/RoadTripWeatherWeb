/* Road Trip Weather - service worker.
 *
 * Caches the app shell (HTML/CSS/JS/icons + Leaflet from the CDN) so the app
 * opens instantly and works as an installed app. Map tiles and the weather /
 * geocoding / routing APIs are network-only: tiles would blow the cache, and
 * forecasts must be fresh to be useful.
 */

const CACHE = "rtw-shell-v6";

const SHELL = [
  ".",
  "manifest.webmanifest",
  "static/style.css",
  "static/api.js",
  "static/app.js",
  "static/icons/icon-180.png",
  "static/icons/icon-192.png",
  "static/icons/icon-512.png",
  "static/icons/icon-maskable-512.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Data APIs and map tiles: always go to the network.
  const networkOnly = [
    "nominatim.openstreetmap.org",
    "photon.komoot.io",
    "router.project-osrm.org",
    "api.open-meteo.com",
    "tile.openstreetmap.org",
  ].some((h) => url.hostname.endsWith(h));
  if (networkOnly || e.request.method !== "GET") return;

  // App shell: cache-first, falling back to network (and caching the result).
  e.respondWith(
    caches.match(e.request, { ignoreSearch: url.origin === location.origin }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((resp) => {
          if (resp.ok && (url.origin === location.origin || url.hostname === "unpkg.com")) {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
    )
  );
});
