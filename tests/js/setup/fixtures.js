// Builders for realistic-shaped mock responses from each external service,
// plus a fetch router that dispatches a mocked `fetch` call to the right
// builder based on the request's hostname. Shapes mirror what
// docs/Data-Sources/*.md documents for each provider.

export function nominatimSearch(lat, lon, display) {
  return [{ lat: String(lat), lon: String(lon), display_name: display }];
}

export function nominatimSearchEmpty() {
  return [];
}

export function nominatimReverse(address) {
  return { address };
}

export function photonResponse(places) {
  return {
    features: places.map((p) => ({
      properties: {
        name: p.name,
        city: p.city,
        state: p.state,
        country: p.country,
      },
      geometry: { coordinates: [p.lon, p.lat] },
    })),
  };
}

/**
 * Each route is `{ coords, legs, distance, duration }`:
 *  - `coords`: [[lat, lon], ...] in natural display order — flipped to
 *    OSRM's real-world [lon, lat] GeoJSON wire order here, mirroring what
 *    getRoutesOSRM() expects to flip back.
 *  - `legs`: an array of per-segment-duration arrays (seconds), one per
 *    OSRM "leg" — there's one leg between each pair of *requested*
 *    waypoints (just start/end here, so always a single leg), containing
 *    one duration per segment of the full geometry.
 */
export function osrmResponse(routes) {
  return {
    code: "Ok",
    routes: routes.map((r) => ({
      geometry: { coordinates: r.coords.map(([lat, lon]) => [lon, lat]) },
      legs: r.legs.map((duration) => ({ annotation: { duration } })),
      distance: r.distance,
      duration: r.duration,
    })),
  };
}

export function osrmNoRoute() {
  return { code: "NoRoute", routes: [] };
}

/** One hourly Open-Meteo response, `hours` entries starting at `startIso`. */
export function openMeteoHourly({ startIso, hourly }) {
  const times = [];
  const start = new Date(startIso);
  for (let i = 0; i < hourly.weathercode.length; i++) {
    times.push(new Date(start.getTime() + i * 3600000).toISOString().slice(0, 16));
  }
  return {
    hourly: {
      time: times,
      temperature_2m: hourly.temperature_2m,
      apparent_temperature: hourly.apparent_temperature || hourly.temperature_2m,
      precipitation: hourly.precipitation || times.map(() => 0),
      precipitation_probability: hourly.precipitation_probability || times.map(() => 0),
      weathercode: hourly.weathercode,
      wind_speed_10m: hourly.wind_speed_10m || times.map(() => 5),
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/**
 * Build a `fetch` mock that dispatches by hostname to the given handlers.
 * Each handler is `(url: URL) => responseBody`.
 */
export function createFetchRouter({ nominatim, photon, osrm, openMeteo }) {
  return async (rawUrl) => {
    const url = new URL(rawUrl);
    if (url.hostname === "nominatim.openstreetmap.org") {
      return jsonResponse(nominatim(url));
    }
    if (url.hostname === "photon.komoot.io") {
      return jsonResponse(photon(url));
    }
    if (url.hostname === "router.project-osrm.org") {
      return jsonResponse(osrm(url));
    }
    if (url.hostname === "api.open-meteo.com") {
      return jsonResponse(openMeteo(url));
    }
    throw new Error(`Unhandled fetch host in test: ${url.hostname}`);
  };
}
