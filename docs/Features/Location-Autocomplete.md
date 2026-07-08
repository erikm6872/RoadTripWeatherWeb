---
tags: [feature]
---

# Location Autocomplete

A Google-Maps-style suggestion dropdown on the Start and Destination fields.
Added in commit `b113b65`, fixed in `1ffa18f` ("Fix location autocomplete
dropdown never appearing"). `attachAutocomplete(input)` —
`static/app.js:44-137`, backed by `suggestPlaces()` in
[[Client-Data-Layer|api.js]] → [[Photon]].

## Behavior

- Fires on `input`, debounced 250ms, and only once the query is **3+
  characters** — avoids a request per keystroke for short/junk input.
- An incrementing `seq` counter discards any response that resolves after a
  newer query has already been fired, so a slow response for "Pho" can't
  clobber the list built for "Phoenix" that arrived first.
- Suggestions are biased toward the current map center
  (`map.getCenter()`), so results near where the user is already looking
  rank higher — mirrors how Google Maps' own autocomplete behaves.
- **Keyboard support**: Arrow Up/Down move a `highlighted` index and
  re-render; Enter selects the highlighted item; Escape closes the list.
- Selection uses `mousedown`, not `click`, specifically so the selection
  fires *before* the input's `blur` event closes the dropdown — using
  `click` here would race against blur and could silently drop the
  selection.
- Blur closes the list after a 120ms delay, giving a pending `mousedown` on
  a suggestion time to land first.

## What picking a suggestion does

`select(i)` (`static/app.js:64-73`) writes the suggestion's coordinates onto
the input element's `dataset` (`data-lat`, `data-lon`, `data-display`) in
addition to setting the visible text. On form submit, `placeParam()`
(`static/app.js:224-230`) checks whether the input's current text still
exactly matches `dataset.display` — if so, it passes the
`{lat, lon, display}` object straight to `planTrip()`, **skipping a redundant
Nominatim geocode call**. If the user edited the text after picking (so it
no longer matches), it falls back to sending the raw string, which
`resolvePlace()` in api.js will geocode normally.

Typing anything after a pick calls `clearPick()` (removes the dataset keys)
immediately, so a stale pick can never silently survive an edit.

## Swap button interaction

The swap button (`static/app.js:143-154`) swaps both fields' visible text
*and* their `dataset` keys (`lat`/`lon`/`display`) together, so swapping
start and destination preserves each one's picked-coordinate status rather
than forcing a re-geocode.

## Not present server-side

`services.py` has no Photon integration — see [[Legacy-Flask-Backend]].
