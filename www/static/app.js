/* Road Trip Weather - frontend logic (Leaflet + fetch). */

const map = L.map("map").setView([39.5, -98.35], 4); // continental US
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let routeLayers = [];            // one Leaflet polyline per offered route
let markerLayer = L.layerGroup().addTo(map);
const markersByIndex = {};
let currentTrip = null;          // the planTrip() result currently displayed
let selectedRouteIndex = 0;      // which route's details are shown

// Keep the map sized correctly when the viewport changes (e.g. rotating a
// phone, or the address bar showing/hiding), which avoids gray tile gaps.
let resizeTimer;
function refreshMapSize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    map.invalidateSize();
    adjustStopsPadding();
    updateActiveFromScroll();
  }, 150);
}
window.addEventListener("resize", refreshMapSize);
window.addEventListener("orientationchange", refreshMapSize);

// Default the departure input to "now" in the browser's local time.
const departInput = document.getElementById("depart");
(function setNow() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  departInput.value = now.toISOString().slice(0, 16);
})();

// ---- Location autocomplete (Photon search-as-you-type) ----

/**
 * Attach a Google-Maps-style suggestion dropdown to a place input. Picking a
 * suggestion stores its coordinates on the input (dataset), letting planTrip
 * skip the geocoding round-trip for that endpoint.
 */
function attachAutocomplete(input) {
  const field = input.closest(".field");
  const list = document.createElement("div");
  list.className = "suggestions";
  list.hidden = true;
  field.appendChild(list);

  let items = [];
  let highlighted = -1;
  let debounceTimer = null;
  let seq = 0; // discards out-of-order responses

  const close = () => { list.hidden = true; highlighted = -1; };

  const clearPick = () => {
    delete input.dataset.lat;
    delete input.dataset.lon;
    delete input.dataset.display;
  };

  const select = (i) => {
    const it = items[i];
    if (!it) return;
    const display = it.sublabel ? `${it.label}, ${it.sublabel}` : it.label;
    input.value = display;
    input.dataset.lat = it.lat;
    input.dataset.lon = it.lon;
    input.dataset.display = display;
    close();
  };

  const renderList = () => {
    list.innerHTML = "";
    items.forEach((it, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "suggestion" + (i === highlighted ? " highlighted" : "");
      el.innerHTML =
        `<svg viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round"
              stroke-linejoin="round" aria-hidden="true">
           <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
           <circle cx="12" cy="10" r="3"/>
         </svg>
         <span class="s-text">
           <span class="s-main">${escapeHtml(it.label)}</span>
           ${it.sublabel ? `<span class="s-sub">${escapeHtml(it.sublabel)}</span>` : ""}
         </span>`;
      // mousedown (not click) so selection wins over the input's blur.
      el.addEventListener("mousedown", (e) => { e.preventDefault(); select(i); });
      list.appendChild(el);
    });
    list.hidden = !items.length;
  };

  input.addEventListener("input", () => {
    clearPick(); // typing invalidates a previously picked suggestion
    const q = input.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 3) { items = []; close(); return; }
    debounceTimer = setTimeout(async () => {
      const mySeq = ++seq;
      try {
        // Bias ranking toward the current map view, like Google Maps.
        const res = await suggestPlaces(q, 5, map.getCenter());
        if (mySeq !== seq) return; // a newer query is in flight
        items = res;
        highlighted = -1;
        renderList();
      } catch { /* suggestions are best-effort; typing still works */ }
    }, 250);
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, items.length - 1);
      renderList();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      renderList();
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      select(highlighted);
    } else if (e.key === "Escape") {
      close();
    }
  });

  // Delay so a mousedown on a suggestion can land first.
  input.addEventListener("blur", () => setTimeout(close, 120));
}

attachAutocomplete(document.getElementById("from"));
attachAutocomplete(document.getElementById("to"));

// Swap start and destination (values and any picked coordinates).
document.getElementById("swap").addEventListener("click", () => {
  const fromEl = document.getElementById("from");
  const toEl = document.getElementById("to");
  [fromEl.value, toEl.value] = [toEl.value, fromEl.value];
  for (const key of ["lat", "lon", "display"]) {
    const tmp = fromEl.dataset[key];
    if (toEl.dataset[key] !== undefined) fromEl.dataset[key] = toEl.dataset[key];
    else delete fromEl.dataset[key];
    if (tmp !== undefined) toEl.dataset[key] = tmp;
    else delete toEl.dataset[key];
  }
});

// ---- GPS auto-locate for the start point ----

const locateBtn = document.getElementById("locate");

// Remove the button entirely if geolocation isn't available (e.g. an insecure
// context), so it never offers something that can't work.
if (!("geolocation" in navigator)) {
  locateBtn.remove();
} else {
  locateBtn.addEventListener("click", () => {
    const fromEl = document.getElementById("from");
    locateBtn.classList.add("locating");
    locateBtn.disabled = true;
    setStatus("Getting your location…");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Use the precise GPS coordinates as the start; label them with the
        // nearest place name so the field reads sensibly.
        let label = "My location";
        try {
          label = await reverseGeocode(latitude, longitude);
        } catch { /* keep the generic label if reverse geocoding fails */ }
        fromEl.value = label;
        fromEl.dataset.lat = latitude;
        fromEl.dataset.lon = longitude;
        fromEl.dataset.display = label;
        locateBtn.classList.remove("locating");
        locateBtn.disabled = false;
        setStatus("");
      },
      (err) => {
        locateBtn.classList.remove("locating");
        locateBtn.disabled = false;
        const messages = {
          1: "Location permission denied — enter a start manually.",
          2: "Your location is unavailable right now.",
          3: "Getting your location timed out — try again.",
        };
        setStatus(messages[err.code] || "Couldn't get your location.", true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

// Segmented control for the weather-stop interval (backed by #interval).
document.querySelectorAll("#interval-seg button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#interval-seg button").forEach((b) => {
      b.classList.toggle("selected", b === btn);
      b.setAttribute("aria-pressed", b === btn);
    });
    document.getElementById("interval").value = btn.dataset.value;
  });
});

const form = document.getElementById("trip-form");
const statusEl = document.getElementById("status");
const routesEl = document.getElementById("routes");
const summaryEl = document.getElementById("summary");
const alertEl = document.getElementById("alert");
const stopsEl = document.getElementById("stops");
const goBtn = document.getElementById("go");

// A picked suggestion carries coordinates; use them as long as the user
// hasn't edited the text since picking. Otherwise fall back to geocoding.
function placeParam(input) {
  const v = input.value.trim();
  if (input.dataset.lat && input.dataset.display === v) {
    return { lat: +input.dataset.lat, lon: +input.dataset.lon, display: v };
  }
  return v;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const from = placeParam(document.getElementById("from"));
  const to = placeParam(document.getElementById("to"));
  const interval = document.getElementById("interval").value;

  // Convert the local datetime-local value to a UTC ISO string.
  let departUtc = "";
  if (departInput.value) {
    departUtc = new Date(departInput.value).toISOString();
  }

  setStatus("Planning your trip… this can take a few seconds.");
  goBtn.disabled = true;
  routesEl.innerHTML = "";
  summaryEl.innerHTML = "";
  alertEl.innerHTML = "";
  stopsEl.innerHTML = "";

  try {
    // Trip planning runs entirely client-side (see api.js) — no app server.
    const data = await planTrip({
      from, to,
      departUtc,
      intervalSeconds: Number(interval),
      onProgress: setStatus,
    });
    render(data);
    setStatus("");
  } catch (err) {
    setStatus(err.message || "Trip planning failed.", true);
  } finally {
    goBtn.disabled = false;
  }
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

function render(data) {
  currentTrip = data;

  // Clear previous trip (idempotent: safe to call repeatedly).
  routeLayers.forEach((l) => map.removeLayer(l));
  routeLayers = [];
  markerLayer.clearLayers();
  for (const k in markersByIndex) delete markersByIndex[k];
  routesEl.innerHTML = "";
  summaryEl.innerHTML = "";
  alertEl.innerHTML = "";
  stopsEl.innerHTML = "";

  // Draw every offered route; the selected one is highlighted, others are
  // faint and clickable to switch.
  data.routes.forEach((route, i) => {
    const layer = L.polyline(route.geometry, routeStyle(i, data.selectedIndex))
      .addTo(map);
    layer.on("click", () => selectRoute(i));
    routeLayers.push(layer);
  });
  map.fitBounds(L.featureGroup(routeLayers).getBounds(), { padding: [40, 40] });

  // Route picker (only when there's more than one option to choose from).
  renderRouteOptions(data);

  // Show the default-selected route's details.
  selectRoute(data.selectedIndex);
}

/** Leaflet style for a route polyline given the current selection. */
function routeStyle(index, selectedIndex) {
  return index === selectedIndex
    ? { color: "#38bdf8", weight: 6, opacity: 0.95 }
    : { color: "#64748b", weight: 5, opacity: 0.5, dashArray: "6 8" };
}

/** Human-readable hours/minutes for a duration in seconds. */
function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** A coloured hazard badge summarising a route's weather. */
function hazardBadge(hazard) {
  if (hazard.extremeCount > 0) {
    const n = hazard.extremeCount + hazard.hazardCount;
    return `<span class="route-badge route-badge--extreme">⚠️ ${n} hazard${n > 1 ? "s" : ""}</span>`;
  }
  if (hazard.hazardCount > 0) {
    return `<span class="route-badge route-badge--hazard">⚠️ ${hazard.hazardCount} hazard${hazard.hazardCount > 1 ? "s" : ""}</span>`;
  }
  return `<span class="route-badge route-badge--clear">✓ Clear</span>`;
}

/** Render the route-picker cards + a one-line suggestion, when applicable. */
function renderRouteOptions(data) {
  if (data.routes.length < 2) { routesEl.innerHTML = ""; return; }

  const suggestion =
    `<div class="route-suggest">⚠️ Hazardous weather on the fastest route — ` +
    `a safer route with a similar arrival time is suggested.</div>`;

  const cards = data.routes.map((r, i) => {
    const miles = (r.distance_m / 1609.34).toFixed(0);
    const delta = Math.round(r.etaDeltaSeconds / 60);
    const deltaStr = i === 0
      ? "fastest"
      : delta > 0 ? `+${delta} min` : delta < 0 ? `${delta} min` : "same ETA";
    const name = r.kind === "fastest" ? "Fastest" : "Safer route";
    const rec = r.recommended ? ` <span class="route-rec">Recommended</span>` : "";
    return `<button class="route-opt${i === data.selectedIndex ? " selected" : ""}" data-index="${i}">
        <div class="route-opt-top">
          <span class="route-opt-name">${name}${rec}</span>
          <span class="route-opt-dur">${fmtDuration(r.duration_s)}</span>
        </div>
        <div class="route-opt-bot">
          ${hazardBadge(r.hazard)}
          <span class="route-opt-delta">${deltaStr} · ${miles} mi</span>
        </div>
      </button>`;
  }).join("");

  routesEl.innerHTML = suggestion + `<div class="route-options">${cards}</div>`;
  routesEl.querySelectorAll(".route-opt").forEach((btn) =>
    btn.addEventListener("click", () => selectRoute(Number(btn.dataset.index))));
}

/**
 * Switch to route `index`: restyle the map lines, update the picker, name the
 * route's stops if needed (lazily), then render its details.
 */
async function selectRoute(index) {
  if (!currentTrip) return;
  selectedRouteIndex = index;

  routeLayers.forEach((layer, i) => {
    layer.setStyle(routeStyle(i, index));
    if (i === index) layer.bringToFront();
  });
  routesEl.querySelectorAll(".route-opt").forEach((b) =>
    b.classList.toggle("selected", Number(b.dataset.index) === index));

  const route = currentTrip.routes[index];

  // Reverse-geocode this route's stops the first time it's shown.
  if (!route.named) {
    setStatus("Naming stops on this route…");
    try {
      await nameWaypoints(route.waypoints, setStatus);
      route.named = true;
    } catch { /* fall back to coordinate labels already set by nameWaypoints */ }
    setStatus("");
    // The user may have switched routes while we were naming this one.
    if (selectedRouteIndex !== index) return;
  }

  renderSelectedRoute(route);
}

/** Render the markers, summary, stop cards, alert and scroll-sync for a route. */
function renderSelectedRoute(route) {
  markerLayer.clearLayers();
  for (const k in markersByIndex) delete markersByIndex[k];
  stopsEl.innerHTML = "";
  alertEl.innerHTML = "";

  // Summary.
  const miles = (route.distance_m / 1609.34).toFixed(0);
  const hrs = Math.floor(route.duration_s / 3600);
  const mins = Math.round((route.duration_s % 3600) / 60);
  summaryEl.innerHTML =
    `<strong>${miles} mi</strong> · ${hrs}h ${mins}m driving · ` +
    `${route.waypoints.length} weather stops`;

  // Weather markers + sidebar cards.
  route.waypoints.forEach((wp, i) => {
    const w = wp.weather;
    const eta = new Date(wp.arrival_utc);
    const etaStr = eta.toLocaleString([], {
      weekday: "short", hour: "numeric", minute: "2-digit",
    });
    const temp = w.temperature != null ? Math.round(w.temperature) + "°F" : "—";

    // Map marker with emoji + temp, tinted by hazard severity.
    const sevClass = w.severity && w.severity !== "none" ? ` wx-${w.severity}` : "";
    const warn = w.severity === "extreme" ? "⚠️ " : "";
    const icon = L.divIcon({
      className: "",
      html: `<div class="wx-marker${sevClass}">${warn}${w.emoji} ${temp}</div>`,
      iconSize: null,
    });
    const marker = L.marker([wp.lat, wp.lon], { icon }).addTo(markerLayer);
    marker.bindPopup(popupHtml(wp, etaStr));
    markersByIndex[i] = marker;

    // Sidebar card (tinted + chip-flagged when hazardous).
    const card = document.createElement("div");
    card.className = "stop" +
      (w.severity && w.severity !== "none" ? ` stop--${w.severity}` : "");
    card.dataset.index = i;
    card.innerHTML = `
      <div class="stop-head">
        <span class="stop-name">${escapeHtml(wp.name)}</span>
        <span class="stop-eta">${etaStr}</span>
      </div>
      <div class="stop-weather">
        <span class="stop-emoji">${w.emoji}</span>
        <span class="stop-temp">${temp}</span>
        <span class="stop-desc">${escapeHtml(w.description)}</span>
      </div>
      <div class="stop-detail">${detailLine(w)}</div>
      ${hazardChips(w)}`;
    card.addEventListener("click", () => {
      setActive(i, { pan: false });
      map.setView([wp.lat, wp.lon], 9);
      marker.openPopup();
    });
    stopsEl.appendChild(card);
  });

  // Surface any hazardous / extreme-weather threats along the route.
  renderAlert(route.waypoints);

  // Highlight the first stop; scrolling updates which one is active.
  adjustStopsPadding();
  activeIndex = -1;
  setActive(0);
}

// ---- Hazard highlighting & extreme-weather alert ----

/** Render the hazard chip row for a card (empty string when no hazards). */
function hazardChips(w) {
  if (!w.hazards || !w.hazards.length) return "";
  const chips = w.hazards
    .map((h) => `<span class="hz hz--${h.level}">${escapeHtml(h.label)}</span>`)
    .join("");
  return `<div class="stop-hazards">${chips}</div>`;
}

/**
 * Build the route-level alert banner. Shows a red "extreme threat" banner if
 * any stop is extreme, otherwise an amber "hazardous conditions" notice if any
 * stop is merely hazardous. Each listed stop is clickable to jump to it.
 */
function renderAlert(waypoints) {
  const flagged = waypoints
    .map((wp, i) => ({ wp, i }))
    .filter((x) => x.wp.weather.severity !== "none");
  if (!flagged.length) { alertEl.className = ""; alertEl.innerHTML = ""; return; }

  const hasExtreme = flagged.some((x) => x.wp.weather.severity === "extreme");
  const level = hasExtreme ? "extreme" : "hazard";
  const title = hasExtreme
    ? "Extreme weather threat on your route"
    : "Hazardous conditions on your route";

  // Extreme stops first, then by arrival order.
  flagged.sort((a, b) => {
    const r = { extreme: 0, hazard: 1 };
    return r[a.wp.weather.severity] - r[b.wp.weather.severity] || a.i - b.i;
  });

  const items = flagged.map(({ wp, i }) => {
    const w = wp.weather;
    const eta = new Date(wp.arrival_utc).toLocaleString([], {
      weekday: "short", hour: "numeric", minute: "2-digit",
    });
    const labels = w.hazards.map((h) => escapeHtml(h.label)).join(", ");
    return `<button class="alert-item" data-index="${i}">
        <span class="alert-emoji">${w.severity === "extreme" ? "⚠️" : w.emoji}</span>
        <span class="alert-text"><strong>${escapeHtml(wp.name)}</strong>
          — ${labels}<br><span class="alert-eta">around ${eta}</span></span>
      </button>`;
  }).join("");

  alertEl.className = `alert alert--${level}`;
  alertEl.innerHTML =
    `<div class="alert-title">⚠️ ${title}</div><div class="alert-list">${items}</div>`;

  alertEl.querySelectorAll(".alert-item").forEach((btn) => {
    btn.addEventListener("click", () => focusStop(Number(btn.dataset.index)));
  });
}

/**
 * Scroll a stop into view and make it the active (highlighted) stop. The card
 * is aligned to the top of the visible list area — below the sticky map on
 * mobile — so it becomes the dominant card and the observer agrees once the
 * scroll settles. The observer is locked out for the duration of the animation.
 */
function focusStop(i) {
  setActive(i);

  const card = stopsEl.querySelector(`.stop[data-index="${i}"]`);
  if (!card) return;

  // Scroll so the card's top lands on the zone line; the scroll handler then
  // keeps it active. Works for both the page (mobile) and sidebar (desktop).
  const line = zoneLineY();
  if (window.matchMedia("(max-width: 768px)").matches) {
    const y = card.getBoundingClientRect().top + window.scrollY - line;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  } else {
    const sb = document.getElementById("sidebar");
    const delta = card.getBoundingClientRect().top - line;
    sb.scrollTo({ top: sb.scrollTop + delta, behavior: "smooth" });
  }
}

// ---- Scroll-driven highlighting of the active stop ----

let activeIndex = -1;

/**
 * Mark stop `i` as active: emphasise its card, highlight its map marker and
 * (optionally) pan the map so the location is centred.
 */
function setActive(i, { pan = true } = {}) {
  if (i === activeIndex || markersByIndex[i] === undefined) return;

  // Clear the previously active card + marker.
  const prevCard = stopsEl.querySelector(".stop.active");
  if (prevCard) prevCard.classList.remove("active");
  const prevMarker = markersByIndex[activeIndex];
  if (prevMarker) {
    if (prevMarker._icon) prevMarker._icon.classList.remove("wx-active");
    prevMarker.setZIndexOffset(0);
  }

  activeIndex = i;

  const card = stopsEl.querySelector(`.stop[data-index="${i}"]`);
  if (card) card.classList.add("active");

  const marker = markersByIndex[i];
  if (marker._icon) marker._icon.classList.add("wx-active");
  marker.setZIndexOffset(1000); // keep the active marker on top
  if (pan) map.panTo(marker.getLatLng(), { animate: true, duration: 0.4 });
}

// The highlight line sits this fraction down the visible list area.
const ACTIVE_LINE_FRACTION = 0.3;

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

/** The element that scrolls the stop list: the page on mobile, sidebar on desktop. */
function getScroller() {
  return isMobile() ? document.scrollingElement : document.getElementById("sidebar");
}

/** Viewport Y of the top of the visible list area (below the pinned map on mobile). */
function listTopY() {
  return isMobile()
    ? document.getElementById("map").offsetHeight
    : document.getElementById("sidebar").getBoundingClientRect().top;
}

/** Viewport Y of the highlight line — the stop crossing it is the active one. */
function zoneLineY() {
  const top = listTopY();
  return top + (getScroller().clientHeight - top) * ACTIVE_LINE_FRACTION;
}

/**
 * Add just enough trailing space below the list so the final stop can scroll up
 * to the highlight line (otherwise the last cards are unreachable). Sized to the
 * current layout, so it's recomputed after rendering and on resize.
 */
function adjustStopsPadding() {
  const cards = stopsEl.querySelectorAll(".stop");
  if (!cards.length) { stopsEl.style.paddingBottom = ""; return; }
  const lastH = cards[cards.length - 1].offsetHeight;
  const pad = getScroller().clientHeight - (zoneLineY() - listTopY()) - lastH;
  stopsEl.style.paddingBottom = `${Math.max(0, Math.round(pad))}px`;
}

/**
 * Make the last stop whose card has scrolled up past the highlight line the
 * active one. Position-based and monotonic, so it's deterministic and agrees
 * with the explicit scrolling done by focusStop().
 */
function updateActiveFromScroll() {
  const cards = [...stopsEl.querySelectorAll(".stop")];
  if (!cards.length) return;

  const scroller = getScroller();
  if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
    setActive(Number(cards[cards.length - 1].dataset.index)); // bottom → last stop
    return;
  }

  const line = zoneLineY();
  let chosen = cards[0];
  for (const c of cards) {
    if (c.getBoundingClientRect().top - line <= 4) chosen = c;
    else break;
  }
  setActive(Number(chosen.dataset.index));
}

// Throttle scroll-driven updates to one per animation frame. Both the page
// (mobile layout) and the sidebar (desktop layout) can be the scroll container.
let activeRaf = null;
function onScrollUpdate() {
  if (activeRaf) return;
  activeRaf = requestAnimationFrame(() => {
    activeRaf = null;
    updateActiveFromScroll();
  });
}
window.addEventListener("scroll", onScrollUpdate, { passive: true });
document.getElementById("sidebar")
  .addEventListener("scroll", onScrollUpdate, { passive: true });

function detailLine(w) {
  const bits = [];
  if (w.apparent_temperature != null)
    bits.push(`Feels ${Math.round(w.apparent_temperature)}°F`);
  if (w.precipitation_probability != null)
    bits.push(`${w.precipitation_probability}% precip`);
  if (w.wind_speed != null)
    bits.push(`${Math.round(w.wind_speed)} mph wind`);
  return bits.join(" · ");
}

function popupHtml(wp, etaStr) {
  const w = wp.weather;
  const temp = w.temperature != null ? Math.round(w.temperature) + "°F" : "—";
  return `<strong>${escapeHtml(wp.name)}</strong><br>` +
    `Arriving ~${etaStr}<br>` +
    `${w.emoji} ${escapeHtml(w.description)}, ${temp}<br>` +
    `<small>${detailLine(w)}</small>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
