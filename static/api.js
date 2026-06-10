/* Road Trip Weather - client-side data layer.
 *
 * Direct port of the former Flask backend (services.py / weather_codes.py).
 * All three providers are free, no-API-key services that allow CORS, so the
 * whole app runs in the browser — which is what makes it packageable as an
 * installable Android app (PWA / Capacitor) with no server component.
 *
 *  - Nominatim (OpenStreetMap): forward & reverse geocoding
 *  - OSRM public demo server:   driving route + per-segment durations
 *  - Open-Meteo:                hourly weather forecast
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";
const PHOTON = "https://photon.komoot.io/api/";
const OSRM = "https://router.project-osrm.org";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";

// ---- WMO weather interpretation codes (Open-Meteo `weathercode`) ----

const WMO_CODES = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"],
  48: ["Depositing rime fog", "🌫️"],
  51: ["Light drizzle", "🌧️"],
  53: ["Moderate drizzle", "🌧️"],
  55: ["Dense drizzle", "🌧️"],
  56: ["Light freezing drizzle", "🌨️"],
  57: ["Dense freezing drizzle", "🌨️"],
  61: ["Slight rain", "🌧️"],
  63: ["Moderate rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Light freezing rain", "🌨️"],
  67: ["Heavy freezing rain", "🌨️"],
  71: ["Slight snow", "🌨️"],
  73: ["Moderate snow", "🌨️"],
  75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "❄️"],
  80: ["Slight rain showers", "🌦️"],
  81: ["Moderate rain showers", "🌦️"],
  82: ["Violent rain showers", "⛈️"],
  85: ["Slight snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm w/ slight hail", "⛈️"],
  99: ["Thunderstorm w/ heavy hail", "⛈️"],
};

function describeWeather(code) {
  return WMO_CODES[code] || ["Unknown", "❓"];
}

// ---- Hazard assessment ----

// WMO codes that represent a driving hazard: severity tier + short label.
const HAZARD_WEATHER = {
  45: ["hazard", "Fog"],
  48: ["hazard", "Freezing fog"],
  56: ["hazard", "Freezing drizzle"],
  57: ["hazard", "Freezing drizzle"],
  65: ["hazard", "Heavy rain"],
  66: ["hazard", "Freezing rain"],
  67: ["extreme", "Heavy freezing rain"],
  71: ["hazard", "Snow"],
  73: ["hazard", "Snow"],
  75: ["extreme", "Heavy snow"],
  77: ["hazard", "Snow grains"],
  81: ["hazard", "Heavy rain showers"],
  82: ["extreme", "Violent rain showers"],
  85: ["hazard", "Snow showers"],
  86: ["extreme", "Heavy snow showers"],
  95: ["hazard", "Thunderstorm"],
  96: ["extreme", "Thunderstorm with hail"],
  99: ["extreme", "Thunderstorm with heavy hail"],
};

const SEVERITY_RANK = { none: 0, hazard: 1, extreme: 2 };

/**
 * Evaluate driving-weather hazards for one forecast (Imperial units).
 * Returns { severity, hazards: [{label, level}] } — severity is the worst tier.
 */
function assessHazards({ weathercode, apparentTemperature, temperature, windSpeed }) {
  let level = "none";
  const hazards = [];
  const add = (lvl, label) => {
    hazards.push({ label, level: lvl });
    if (SEVERITY_RANK[lvl] > SEVERITY_RANK[level]) level = lvl;
  };

  const wx = HAZARD_WEATHER[weathercode];
  if (wx) add(wx[0], wx[1]);

  // Feels-like temperature captures heat-index / wind-chill danger.
  const feels = apparentTemperature != null ? apparentTemperature : temperature;
  if (feels != null) {
    if (feels >= 110) add("extreme", `Extreme heat ${Math.round(feels)}°F`);
    else if (feels >= 100) add("hazard", `Dangerous heat ${Math.round(feels)}°F`);
    if (feels <= 0) add("extreme", `Extreme cold ${Math.round(feels)}°F`);
    else if (feels <= 15) add("hazard", `Bitter cold ${Math.round(feels)}°F`);
  }

  if (windSpeed != null) {
    if (windSpeed >= 50) add("extreme", `Violent wind ${Math.round(windSpeed)} mph`);
    else if (windSpeed >= 35) add("hazard", `High wind ${Math.round(windSpeed)} mph`);
  }

  return { severity: level, hazards };
}

// ---- HTTP helper ----

class ServiceError extends Error {}

async function getJSON(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new ServiceError(`Service error (${resp.status}) from ${new URL(url).host}.`);
  return resp.json();
}

// ---- Geocoding (Nominatim) ----

async function geocode(query) {
  const u = `${NOMINATIM}/search?` + new URLSearchParams({
    q: query, format: "json", limit: "1",
  });
  const data = await getJSON(u);
  if (!data.length) throw new ServiceError(`Could not find a location for '${query}'.`);
  const top = data[0];
  return { lat: +top.lat, lon: +top.lon, display: top.display_name || query };
}

/**
 * Search-as-you-type place suggestions via Photon (OSM data, built for
 * autocomplete — Nominatim's policy forbids using it for this). Returns
 * [{ label, sublabel, lat, lon }], deduplicated, at most `limit` entries.
 */
async function suggestPlaces(query, limit = 5, bias = null) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit * 2), // fetch extra; duplicates get filtered out
  });
  if (bias) {
    // Rank results near this point higher (e.g. the current map view).
    params.set("lat", bias.lat);
    params.set("lon", bias.lon);
  }
  const data = await getJSON(PHOTON + "?" + params);

  const out = [];
  const seen = new Set();
  for (const f of data.features || []) {
    const p = f.properties || {};
    const label = p.name ||
      [p.street, p.housenumber].filter(Boolean).join(" ");
    if (!label || !f.geometry) continue;
    const sublabel = [p.city, p.state, p.country]
      .filter((v) => v && v !== label)
      .join(", ");
    const key = `${label}|${sublabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label,
      sublabel,
      lat: f.geometry.coordinates[1],
      lon: f.geometry.coordinates[0],
    });
    if (out.length >= limit) break;
  }
  return out;
}

// Be polite to Nominatim: at most ~1 reverse-geocode request per second.
const REVERSE_MIN_INTERVAL_MS = 1100;
let lastReverseCall = 0;

async function reverseGeocode(lat, lon) {
  const wait = REVERSE_MIN_INTERVAL_MS - (Date.now() - lastReverseCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReverseCall = Date.now();

  try {
    const u = `${NOMINATIM}/reverse?` + new URLSearchParams({
      lat, lon, format: "json", zoom: "10",
    });
    const addr = (await getJSON(u)).address || {};
    for (const key of ["city", "town", "village", "hamlet", "suburb",
                       "municipality", "county"]) {
      if (addr[key]) {
        return addr.state ? `${addr[key]}, ${addr.state}` : addr[key];
      }
    }
    return addr.state || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

// ---- Routing (OSRM) ----

/**
 * Fetch a driving route. Returns { coords: [[lat,lon]…], cumTime: [s…],
 * distance: m, duration: s } with cumTime aligned to coords.
 */
async function getRouteOSRM(start, end) {
  // OSRM expects lon,lat ordering.
  const coordStr = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const u = `${OSRM}/route/v1/driving/${coordStr}?` + new URLSearchParams({
    overview: "full", geometries: "geojson", annotations: "duration",
  });
  const data = await getJSON(u);
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new ServiceError("No driving route could be found between those points.");
  }

  const route = data.routes[0];
  // geometry coordinates are [lon, lat]; flip to [lat, lon] for Leaflet.
  let coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);

  const cumTime = [0];
  for (const leg of route.legs) {
    for (const seg of leg.annotation.duration) {
      cumTime.push(cumTime[cumTime.length - 1] + seg);
    }
  }
  if (cumTime.length !== coords.length) {
    const n = Math.min(cumTime.length, coords.length);
    coords = coords.slice(0, n);
    cumTime.length = n;
  }

  return { coords, cumTime, distance: route.distance, duration: route.duration };
}

// ---- Waypoint sampling ----

/**
 * Pick waypoints roughly every `intervalSeconds` of driving. Always includes
 * origin and destination; widens the interval so lookups stay ≤ maxPoints;
 * drops stops bunched closer than half the interval.
 */
function samplePoints(route, intervalSeconds, maxPoints = 12) {
  const { coords, cumTime } = route;
  const total = cumTime.length ? cumTime[cumTime.length - 1] : 0;

  if (total > 0 && total / intervalSeconds > maxPoints - 1) {
    intervalSeconds = total / (maxPoints - 1);
  }

  const targets = [];
  for (let t = 0; t < total; t += intervalSeconds) targets.push(t);
  targets.push(total); // always include destination

  const samples = [];
  const used = new Set();
  const minGap = intervalSeconds * 0.5;
  let j = 0;
  targets.forEach((target, k) => {
    while (j < cumTime.length - 1 && cumTime[j] < target) j++;
    if (used.has(j)) return;
    const isDestination = k === targets.length - 1;
    const last = samples[samples.length - 1];
    if (last && !isDestination && cumTime[j] - last.driveSeconds < minGap) return;
    if (last && isDestination && cumTime[j] - last.driveSeconds < minGap) {
      samples.pop();
    }
    used.add(j);
    samples.push({ lat: coords[j][0], lon: coords[j][1], driveSeconds: cumTime[j] });
  });
  return samples;
}

// ---- Weather (Open-Meteo) ----

/** Forecast for (lat, lon) nearest to `whenUtc` (a Date). */
async function getWeatherAt(lat, lon, whenUtc) {
  const msPerDay = 86400000;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const target = new Date(whenUtc); target.setUTCHours(0, 0, 0, 0);
  let daysAhead = Math.max(1, Math.round((target - today) / msPerDay) + 2);
  daysAhead = Math.min(daysAhead, 16); // Open-Meteo hourly limit

  const u = `${OPEN_METEO}?` + new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: "temperature_2m,apparent_temperature,precipitation," +
            "precipitation_probability,weathercode,wind_speed_10m",
    timezone: "GMT",
    forecast_days: daysAhead,
    wind_speed_unit: "mph",
    temperature_unit: "fahrenheit",
    precipitation_unit: "inch",
  });
  const hourly = (await getJSON(u)).hourly || {};
  const times = hourly.time || [];
  if (!times.length) throw new ServiceError("Weather data unavailable for this location.");

  // Find the hour closest to the arrival time.
  const targetTs = whenUtc.getTime();
  let bestI = 0, bestDiff = Infinity;
  times.forEach((ts, i) => {
    const diff = Math.abs(Date.parse(ts + "Z") - targetTs);
    if (diff < bestDiff) { bestI = i; bestDiff = diff; }
  });

  const code = hourly.weathercode[bestI];
  const [desc, emoji] = describeWeather(code);
  const at = (f) => (hourly[f] && bestI < hourly[f].length ? hourly[f][bestI] : null);

  const result = {
    temperature: at("temperature_2m"),
    apparent_temperature: at("apparent_temperature"),
    precipitation: at("precipitation"),
    precipitation_probability: at("precipitation_probability"),
    wind_speed: at("wind_speed_10m"),
    weathercode: code,
    description: desc,
    emoji,
    forecast_time_utc: times[bestI],
  };

  const { severity, hazards } = assessHazards({
    weathercode: code,
    apparentTemperature: result.apparent_temperature,
    temperature: result.temperature,
    windSpeed: result.wind_speed,
  });
  result.severity = severity;
  result.hazards = hazards;
  return result;
}

// ---- Trip orchestration (same response shape as the old /api/trip) ----

/**
 * Resolve a trip endpoint to coordinates. Accepts a place-name string (which
 * is geocoded) or an already-resolved { lat, lon, display } object — e.g.
 * from a picked autocomplete suggestion, which skips the geocoding call.
 */
async function resolvePlace(place) {
  if (place && typeof place === "object" && place.lat != null) {
    return {
      lat: +place.lat,
      lon: +place.lon,
      display: place.display || `${place.lat}, ${place.lon}`,
    };
  }
  return geocode(place);
}

/**
 * Plan a trip: geocode endpoints, route, sample stops, fetch timed forecasts.
 * `from`/`to` are place names or { lat, lon, display } objects.
 * `onProgress(message)` is called with status updates along the way.
 */
async function planTrip({ from, to, departUtc, intervalSeconds, onProgress = () => {} }) {
  const depart = departUtc ? new Date(departUtc) : new Date();
  const interval = Math.max(900, intervalSeconds || 3600);

  onProgress("Finding locations…");
  const start = await resolvePlace(from);
  const end = await resolvePlace(to);

  onProgress("Calculating route…");
  const route = await getRouteOSRM(start, end);
  const samples = samplePoints(route, interval);

  const waypoints = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    onProgress(`Fetching forecasts… (${i + 1}/${samples.length})`);
    const arrival = new Date(depart.getTime() + s.driveSeconds * 1000);
    const name = await reverseGeocode(s.lat, s.lon);
    const weather = await getWeatherAt(s.lat, s.lon, arrival);
    waypoints.push({
      name,
      lat: s.lat,
      lon: s.lon,
      drive_seconds: s.driveSeconds,
      arrival_utc: arrival.toISOString(),
      weather,
    });
  }

  return {
    origin: { display: start.display, lat: start.lat, lon: start.lon },
    destination: { display: end.display, lat: end.lat, lon: end.lon },
    depart_utc: depart.toISOString(),
    distance_m: route.distance,
    duration_s: route.duration,
    geometry: route.coords,
    waypoints,
  };
}
