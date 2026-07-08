---
tags: [feature]
---

# Scroll-Sync UI — the "active stop" mechanism

The most intricate piece of `static/app.js` (lines 520–650). Keeps exactly
one stop card and its map marker highlighted as "active," staying in sync as
the user scrolls the stop list — on **both** the mobile layout (map pinned
to the top, page scrolls) and the desktop layout (sidebar scrolls
independently of the map).

## Why it's position-based, not scroll-event-based

A naive approach (`IntersectionObserver` or "which card is nearest the
top") tends to fight with programmatic scrolling — e.g. clicking a card or
an alert item to jump to it, then having the scroll handler immediately
re-decide a different card is "active" mid-animation. This app instead
defines a single deterministic rule and applies it identically whether the
scroll was user-driven or code-driven:

> **The active stop is the last card whose top has scrolled up past a fixed
> horizontal "highlight line."**

That line sits at a fixed fraction down the *visible list area* — below the
pinned map on mobile, or the sidebar's own top on desktop.

## The pieces

- **`ACTIVE_LINE_FRACTION = 0.3`** (`app.js:577`) — the line sits 30% of the
  way down the visible list area. Tunable in one place.
- **`isMobile()`** — `window.matchMedia("(max-width: 768px)")`, the same
  breakpoint used in `style.css`.
- **`getScroller()`** — returns `document.scrollingElement` (the page) on
  mobile, or the `#sidebar` element on desktop. Every other function in this
  system calls this rather than hardcoding which element scrolls.
- **`listTopY()`** — viewport Y of the top of the *stop list itself*: the
  map's height on mobile (since the map is pinned above the list), or the
  sidebar's own bounding-rect top on desktop.
- **`zoneLineY()`** — `listTopY() + (scroller.clientHeight - listTopY()) *
  ACTIVE_LINE_FRACTION` — the actual highlight line's viewport Y.
- **`updateActiveFromScroll()`** — walks the stop cards top-to-bottom;
  `chosen` becomes the last card whose top is at or above the line (with a
  4px tolerance), i.e. the line has "crossed into" that card. Special-cased:
  if the scroller is within 4px of its max scroll, the **last** stop is
  forced active — this guarantees the final destination becomes active once
  the user reaches the bottom, even if its card is short enough that the
  line technically never crosses it.
- **`onScrollUpdate()`** — throttles `updateActiveFromScroll()` to at most
  once per animation frame (`requestAnimationFrame`) via a `activeRaf` guard,
  attached to both `window`'s and `#sidebar`'s `scroll` events (`passive:
  true`).

## `adjustStopsPadding()` — why the list needs trailing padding

Without extra space at the bottom, the *last* stop's card can never be
scrolled up far enough to reach the highlight line (the browser simply runs
out of room to scroll). `adjustStopsPadding()` (`app.js:606-612`) computes
exactly how much bottom padding is needed — `scroller height − (distance
from list-top to highlight line) − last card's height` — and applies it as
`stopsEl.style.paddingBottom`. Recomputed after every render and on
`resize`/`orientationchange` (via `refreshMapSize()`), since it depends on
viewport size and the last card's actual rendered height.

## `focusStop(i)` — programmatic jump

Used when clicking a sidebar card or an alert-banner item
(`static/app.js:526-543`). Rather than calling a "scroll to element" API
naively, it computes the exact scroll offset needed to put the target
card's top *exactly on the highlight line* — same coordinate system
`updateActiveFromScroll()` uses — then smooth-scrolls there. Because both
functions agree on where the line is, the scroll-driven observer settles on
the same card the click intended, instead of the two mechanisms disagreeing
by a few pixels.

## `setActive(i, { pan })`

The actual state-change function (`app.js:553-574`): removes `.active` from
the previous card, un-highlights the previous marker (resets z-index), adds
`.active` to the new card, highlights the new marker (raises z-index so it
renders above others), and — unless `pan: false` was passed (used when a
card is clicked directly, since the user's click already implies they're
looking at that spot) — pans the map to center on it.
