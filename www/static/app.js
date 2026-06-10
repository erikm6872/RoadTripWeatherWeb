/* Road Trip Weather - frontend logic (Leaflet + fetch). */

const map = L.map("map").setView([39.5, -98.35], 4); // continental US
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let routeLayer = null;
let markerLayer = L.layerGroup().addTo(map);
const markersByIndex = {};

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

const form = document.getElementById("trip-form");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const alertEl = document.getElementById("alert");
const stopsEl = document.getElementById("stops");
const goBtn = document.getElementById("go");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const from = document.getElementById("from").value.trim();
  const to = document.getElementById("to").value.trim();
  const interval = document.getElementById("interval").value;

  // Convert the local datetime-local value to a UTC ISO string.
  let departUtc = "";
  if (departInput.value) {
    departUtc = new Date(departInput.value).toISOString();
  }

  setStatus("Planning your trip… this can take a few seconds.");
  goBtn.disabled = true;
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
  // Clear previous trip (idempotent: safe to call repeatedly).
  if (routeLayer) map.removeLayer(routeLayer);
  markerLayer.clearLayers();
  for (const k in markersByIndex) delete markersByIndex[k];
  stopsEl.innerHTML = "";
  alertEl.innerHTML = "";

  // Draw the route line.
  routeLayer = L.polyline(data.geometry, {
    color: "#38bdf8", weight: 5, opacity: 0.85,
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });

  // Summary.
  const miles = (data.distance_m / 1609.34).toFixed(0);
  const hrs = Math.floor(data.duration_s / 3600);
  const mins = Math.round((data.duration_s % 3600) / 60);
  summaryEl.innerHTML =
    `<strong>${miles} mi</strong> · ${hrs}h ${mins}m driving · ` +
    `${data.waypoints.length} weather stops`;

  // Weather markers + sidebar cards.
  data.waypoints.forEach((wp, i) => {
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
  renderAlert(data.waypoints);

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
  if (!flagged.length) { alertEl.innerHTML = ""; return; }

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
