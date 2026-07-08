---
tags: [feature]
---

# GPS Start Location

Lets the user auto-fill the "Start" field with their current location
instead of typing it. Added in commit `a1ea9c2`. `static/app.js:158-201`,
HTML at `templates/index.html:38-47`.

## Availability check

```js
if (!("geolocation" in navigator)) {
  locateBtn.remove();
}
```

The button is **removed from the DOM entirely**, not just disabled, if the
Geolocation API isn't available — e.g. an insecure (non-HTTPS, non-localhost)
context, or a browser without support. This avoids offering a control that
can't possibly work rather than showing a disabled button with no
explanation.

## Flow

1. Click sets a `.locating` CSS class (spinner state) and disables the
   button, and posts a "Getting your location…" status.
2. `navigator.geolocation.getCurrentPosition()` is called with
   `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }` — high
   accuracy preferred, gives up after 10s, accepts a cached fix up to 60s
   old.
3. **On success**: reverse-geocodes the coordinates via
   [[Client-Data-Layer|`reverseGeocode()`]] → [[Nominatim]] to get a
   human-readable label (falls back to the generic label "My location" if
   reverse geocoding itself fails — the GPS fix is still used even if
   labeling it fails). Sets the field's text *and* its `dataset.lat/lon/display`
   directly, exactly like picking an [[Location-Autocomplete|autocomplete]]
   suggestion — so `placeParam()` on submit uses the precise GPS coordinates
   rather than re-geocoding the display label (which would lose precision).
4. **On failure**: maps the standard `GeolocationPositionError.code` values
   to specific user-facing messages:
   - `1` (PERMISSION_DENIED): "Location permission denied — enter a start
     manually."
   - `2` (POSITION_UNAVAILABLE): "Your location is unavailable right now."
   - `3` (TIMEOUT): "Getting your location timed out — try again."

## Interaction with autocomplete

Locating overwrites whatever was in the Start field, including any
previously picked autocomplete suggestion — it doesn't merge or ask first.
Because it sets `dataset.lat/lon/display` the same way autocomplete does, the
two features are interchangeable from `placeParam()`'s point of view: both
produce a precise coordinate pair that skips geocoding, they just differ in
how that pair was obtained.
