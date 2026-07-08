---
tags: [architecture, code]
---

# UI Layer — `static/app.js`

676 lines. Vanilla JS, no framework. Owns the Leaflet map, the form, and all
DOM rendering. Calls into [[Client-Data-Layer|api.js]] for anything that
isn't presentation — it never talks to Nominatim/OSRM/Open-Meteo directly.

## Map setup

A single Leaflet map (`app.js:3`) centered on the continental US at load,
using OpenStreetMap raster tiles. `refreshMapSize()` (line 18) debounces
`map.invalidateSize()` on resize/orientation-change so rotating a phone
doesn't leave gray tile gaps.

## Form & input handling

- **[[Location-Autocomplete]]** (`attachAutocomplete()`, lines 44–137) is
  attached to both the "Start" and "Destination" inputs.
- **Swap button** (lines 143–154) swaps both the text values and any picked
  autocomplete coordinates stored on the inputs' `dataset`.
- **[[GPS-Start-Location]]** (lines 158–201) — the locate button, only shown
  when `navigator.geolocation` exists.
- **Departure time** defaults to "now" in the browser's local time
  (lines 30–35), converted to UTC on submit (lines 239–242).
- **Weather-stop interval** is a segmented control (30 min / 1 hr / 2 hr /
  3 hr) backed by a hidden `<input>` (lines 204–212, HTML at
  `templates/index.html:70-79`).

## Submitting a trip

The form submit handler (lines 232–266) reads both place inputs via
`placeParam()` — which returns the picked `{lat, lon, display}` object *only
if the input text still matches what was picked* (i.e., the user hasn't
edited it since), otherwise falls back to the raw string for geocoding. It
then calls `planTrip()` and hands the result to `render()`.

## Rendering a trip result

`render(data)` (lines 273–301):
1. Clears everything from the previous trip (idempotent).
2. Draws every offered route as a polyline — the selected one solid blue,
   others faint dashed gray (`routeStyle()`, lines 304–308) — each clickable
   to switch selection.
3. Fits the map bounds to all drawn routes.
4. Calls `renderRouteOptions()` to build the route-picker cards (only shown
   when there's more than one route — see [[Weather-Aware-Routing]]).
5. Calls `selectRoute(data.selectedIndex)` to show the default route's
   details.

`selectRoute(index)` (lines 366–392) restyles the polylines, updates the
picker's selected state, lazily reverse-geocodes that route's stops the
*first* time it's shown (`nameWaypoints`, guarded by `route.named`), then
calls `renderSelectedRoute()`.

`renderSelectedRoute(route)` (lines 395–462) builds, per waypoint:
- A Leaflet `divIcon` marker showing the weather emoji + rounded temperature,
  tinted by hazard severity class (`wx-hazard` / `wx-extreme`), with a popup.
- A sidebar "stop" card with name, ETA, weather description, a detail line
  (feels-like temp / precip% / wind), and hazard chips (see
  [[Hazard-Assessment]]).

It then calls `renderAlert()` for the route-level banner and
`adjustStopsPadding()` + `setActive(0)` to initialize scroll-sync (see
[[Scroll-Sync-UI]]).

## Hazard alert banner

`renderAlert(waypoints)` (lines 480–518) filters waypoints to only hazardous
ones, sorts extreme-first-then-by-arrival-order, and renders a red
("Extreme weather threat…") or amber ("Hazardous conditions…") banner
listing each flagged stop. Clicking a listed stop calls `focusStop()`, which
scrolls the corresponding card into view and marks it active.

## Scroll-driven "active stop" — see [[Scroll-Sync-UI]]

The largest and most intricate chunk of the file (lines 520–650): a
position-based (not naive scroll-event) mechanism that keeps the map marker
and sidebar card in sync as the user scrolls the stop list, on both the
mobile (page-scroll, map pinned to top) and desktop (sidebar-scroll) layouts.

## Utility functions

`fmtDuration()`, `detailLine()`, `popupHtml()`, `escapeHtml()` (used
everywhere untrusted text — place names, descriptions — is interpolated into
`innerHTML`, to avoid XSS from a malicious/odd Nominatim or Photon result).
