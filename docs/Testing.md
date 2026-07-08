---
tags: [testing]
---

# Testing

There was no test suite before this page existed. It now covers the client
data layer ([[Client-Data-Layer]]), the parts of the UI layer
([[UI-Layer]]) that can be meaningfully tested, and the
[[Legacy-Flask-Backend|legacy Flask backend]] — 203 tests total (129 JS +
74 Python) as of this writing.

## Running the suite

```bash
npm install          # once, installs vitest + jsdom as devDependencies
npm test              # JS: unit + integration + regression, single run
npm run test:watch    # JS: watch mode

python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest      # Python: unit + integration + regression
```

`requirements-dev.txt` includes `requirements.txt` plus `pytest`. `.venv/`
and `node_modules/` are gitignored — each machine sets these up locally.

## Layout

```
tests/
  js/
    unit/          pure-logic tests: hazard assessment, WMO codes, waypoint
                    sampling, mapLimit/getJSON concurrency & retry, and the
                    pure formatting helpers pulled out of app.js
    integration/    planTrip() end-to-end (mocked fetch), geocoding,
                    autocomplete, OSRM routing — exercising real
                    cross-function orchestration, not just one function
    regression/     locks in specific documented behaviors: exact hazard
                    thresholds, the weather-aware alternate-route
                    selection algorithm's ETA-tiebreak rule, and the
                    scroll-sync "active stop" algorithm
    setup/          test harness: Leaflet stub, jsdom app-loader, fetch-mock
                    fixtures, geometry stubs
  python/
    test_weather_codes.py   mirrors the JS hazard/WMO-code tests
    test_services.py        unit + integration (mocked requests.get)
    test_app.py              Flask test-client integration tests for /api/trip
    test_regression.py       address-fallback precedence, short-trip edge case
```

## Why `static/api.js` and `static/app.js` needed a small addition

Neither file used ES module `export` — they're loaded as plain classic
`<script>` tags (see [[UI-Layer]], [[Overview]]).
Both files now end with:

```js
if (typeof module !== "undefined" && module.exports) {
  module.exports = { /* the functions tests need */ };
}
```

`module` is undefined in a browser classic script, so this is inert there —
**zero behavior change for the shipped app**, verified by loading the app in
a live preview and planning a real trip after adding it. Under Node (test
runners), it exposes the internals so tests can call them directly instead
of only indirectly through the DOM.

`static/app.js`'s shim exposes more than pure formatters — it also exposes
the DOM-bound scroll-sync internals (`setActive`, `updateActiveFromScroll`,
`zoneLineY`, etc.) and `render`/`selectRoute`, plus a `_internal` getter
object for reading `activeIndex`/`markersByIndex`/`currentTrip` in
assertions. See [[Scroll-Sync-UI]] for what that code does.

## Testing a DOM/Leaflet-coupled file without a real browser

`static/app.js` calls `document`, `window`, and the global `L` (Leaflet) at
**module load time**, not just inside functions — it builds the map and
wires up event listeners as soon as the file runs. To load it under Vitest:

1. `tests/js/setup/leaflet-stub.js` — a minimal fake `L` covering only the
   Leaflet calls app.js actually makes (`map`, `tileLayer`, `layerGroup`,
   `polyline`, `marker`, `divIcon`, `featureGroup`), not a general-purpose
   mock. Fake markers get a real `document.createElement("div")` as their
   `_icon`, so `classList` operations in app.js run against real jsdom nodes.
2. `tests/js/setup/load-app.js` — copies `templates/index.html`'s body into
   the jsdom `document`, installs the Leaflet stub and a `matchMedia` stub,
   calls `vi.resetModules()`, and dynamically imports `app.js` fresh. Test
   files needing this call `loadApp()` from a `beforeEach` and must have
   `// @vitest-environment jsdom` at the top of the file (Vitest defaults to
   a plain Node environment — see `vitest.config.js` — since
   [[Client-Data-Layer|api.js]] needs no DOM at all).

jsdom doesn't compute real layout — `offsetHeight`, `clientHeight`, and
`getBoundingClientRect()` are always zero. [[Scroll-Sync-UI]]'s regression
tests (`tests/js/regression/scroll-sync.test.js`) work around this with
`tests/js/setup/geometry-stub.js`, which overrides those properties on
specific elements to controlled values, making the scroll-position math
testable without a real browser.

## Mocking the external services

`tests/js/setup/fixtures.js` builds realistic-shaped mock responses for each
provider in [[Data-Sources-Overview]] (Nominatim, Photon, OSRM, Open-Meteo)
and a `createFetchRouter()` that dispatches a mocked `fetch` call to the
right builder by hostname — this is what makes the
`planTrip()` integration tests exercise the real multi-service orchestration
logic (geocode → route + alternatives → weather per waypoint → hazard
scoring → alternate-route selection) without hitting the network.

Weather-by-location scenarios (needed to make one waypoint hazardous and
another clear, for [[Weather-Aware-Routing]] tests) are built by keying a
small lookup table off `(lat, lon)` rounded to one decimal and returning a
constant weather code across a wide time window — see `weatherRouter()` in
`tests/js/integration/plan-trip.test.js` — which sidesteps needing exact
timestamp alignment with Open-Meteo's hourly array.

`reverseGeocode()`'s ~1 req/sec throttle (module-level state, see
[[Nominatim]]) is real code under test, not stubbed out — tests that
exercise it use `vi.useFakeTimers()` + `vi.runAllTimersAsync()` so the
throttle logic runs for real without the test actually waiting in real time.
One test (`geocode.test.js`'s throttle test) loads a fresh module instance
via `vi.resetModules()` specifically because the throttle state is a
module-level singleton that would otherwise leak between tests.

## A behavior this test suite caught while being written

Writing `samplePoints()`'s tests surfaced an edge case not obvious from
reading the code casually: for a trip much shorter than half the requested
interval, the origin sample can be **popped and replaced** by the
destination sample, leaving only one waypoint instead of the origin+
destination pair the code looks like it always guarantees. This is now
documented in [[Trip-Planning-Flow]] and locked in by a regression test in
both languages (`waypoint-sampling.test.js` and `test_regression.py`).

## Known gaps

- No true end-to-end browser tests (Playwright/Cypress) — the DOM tests here
  use jsdom + stubbed Leaflet/geometry, which verifies logic but not real
  rendering, CSS, or actual browser scroll behavior.
- `attachAutocomplete()`'s keyboard navigation and blur/mousedown timing
  (documented in [[Location-Autocomplete]]) aren't covered — they're wired
  up via `addEventListener` inside a function that also does DOM
  construction, and weren't pulled into the test-only export shim.
- [[GPS-Start-Location]]'s success/failure flow isn't covered — it depends
  on `navigator.geolocation.getCurrentPosition`'s callback-based API, which
  needs its own mock; `load-app.js` has a `geolocation` option to enable a
  stub for this but no tests use it yet.
- [[Mobile-Packaging]] (Capacitor) and the service worker
  ([[PWA-and-Service-Worker]]) aren't tested — both require a real
  browser/device or a service-worker test harness neither of which is set
  up here.
