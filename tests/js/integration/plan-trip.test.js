import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiModule from "../../../static/api.js";
import {
  nominatimSearch,
  nominatimReverse,
  osrmResponse,
  openMeteoHourly,
  createFetchRouter,
} from "../setup/fixtures.js";

const { planTrip } = apiModule;

const PHOENIX = { lat: 33.45, lon: -112.07, display: "Phoenix, Arizona, USA" };
const FLAGSTAFF = { lat: 35.2, lon: -111.65, display: "Flagstaff, Arizona, USA" };
const HAZARD_MID = { lat: 34.3, lon: -111.9 };
const CLEAR_MID = { lat: 34.0, lon: -112.3 };

/** Constant-weather Open-Meteo mock keyed by (lat, lon) rounded to 1 decimal. */
function weatherRouter(byPoint, fallback = { weathercode: 0, temperature_2m: 70, wind_speed_10m: 5 }) {
  return (url) => {
    const lat = parseFloat(url.searchParams.get("latitude"));
    const lon = parseFloat(url.searchParams.get("longitude"));
    const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    const w = byPoint[key] || fallback;
    const hours = 48;
    return openMeteoHourly({
      startIso: new Date(Date.now() - 24 * 3600000).toISOString(),
      hourly: {
        weathercode: Array(hours).fill(w.weathercode),
        temperature_2m: Array(hours).fill(w.temperature_2m ?? 70),
        wind_speed_10m: Array(hours).fill(w.wind_speed_10m ?? 5),
      },
    });
  };
}

/** Two candidate routes: a hazardous "fastest" and a clear, slightly slower alternative. */
function twoRouteOsrm() {
  return osrmResponse([
    {
      // fastest: origin -> hazardous midpoint -> destination, 1h30m
      coords: [[PHOENIX.lat, PHOENIX.lon], [HAZARD_MID.lat, HAZARD_MID.lon], [FLAGSTAFF.lat, FLAGSTAFF.lon]],
      legs: [[3600, 1800]],
      distance: 150000,
      duration: 5400,
    },
    {
      // alternate: origin -> clear midpoint -> destination, 1h35m (close ETA)
      coords: [[PHOENIX.lat, PHOENIX.lon], [CLEAR_MID.lat, CLEAR_MID.lon], [FLAGSTAFF.lat, FLAGSTAFF.lon]],
      legs: [[3600, 2100]],
      distance: 155000,
      duration: 5700,
    },
  ]);
}

async function runPlanTrip(fetchImpl, opts = {}) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  vi.useFakeTimers();
  try {
    const promise = planTrip({
      from: "Phoenix, AZ",
      to: "Flagstaff, AZ",
      departUtc: new Date().toISOString(),
      intervalSeconds: 3600,
      onProgress: opts.onProgress,
    });
    await vi.runAllTimersAsync();
    return await promise;
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}

describe("planTrip", () => {
  it("offers a safer alternate route when the fastest route is hazardous", async () => {
    const fetchImpl = createFetchRouter({
      nominatim: (url) =>
        url.pathname.includes("reverse")
          ? nominatimReverse({ city: "Waypoint", state: "Arizona" })
          : url.searchParams.get("q").includes("Phoenix")
            ? nominatimSearch(PHOENIX.lat, PHOENIX.lon, PHOENIX.display)
            : nominatimSearch(FLAGSTAFF.lat, FLAGSTAFF.lon, FLAGSTAFF.display),
      osrm: () => twoRouteOsrm(),
      openMeteo: weatherRouter({
        [`${HAZARD_MID.lat.toFixed(1)},${HAZARD_MID.lon.toFixed(1)}`]: { weathercode: 75, temperature_2m: 20, wind_speed_10m: 5 },
      }),
    });

    const progress = [];
    const data = await runPlanTrip(fetchImpl, { onProgress: (m) => progress.push(m) });

    expect(data.origin.display).toBe(PHOENIX.display);
    expect(data.destination.display).toBe(FLAGSTAFF.display);
    expect(data.selectedIndex).toBe(0);
    expect(data.routes).toHaveLength(2);

    const [fastest, alternate] = data.routes;
    expect(fastest.kind).toBe("fastest");
    expect(fastest.hazard.worst).toBe("extreme");
    expect(alternate.kind).toBe("alternate");
    expect(alternate.recommended).toBe(true);
    expect(alternate.hazard.worst).toBe("none");
    expect(alternate.etaDeltaSeconds).toBe(300); // 5700 - 5400

    expect(progress.some((m) => /location/i.test(m))).toBe(true);
    expect(progress.some((m) => /route/i.test(m))).toBe(true);
    expect(progress.some((m) => /weather/i.test(m))).toBe(true);
  }, 10000);

  it("only names the default-selected route's waypoints, not the alternate's", async () => {
    const fetchImpl = createFetchRouter({
      nominatim: (url) =>
        url.pathname.includes("reverse")
          ? nominatimReverse({ city: "Waypoint", state: "Arizona" })
          : url.searchParams.get("q").includes("Phoenix")
            ? nominatimSearch(PHOENIX.lat, PHOENIX.lon, PHOENIX.display)
            : nominatimSearch(FLAGSTAFF.lat, FLAGSTAFF.lon, FLAGSTAFF.display),
      osrm: () => twoRouteOsrm(),
      openMeteo: weatherRouter({
        [`${HAZARD_MID.lat.toFixed(1)},${HAZARD_MID.lon.toFixed(1)}`]: { weathercode: 75, temperature_2m: 20 },
      }),
    });

    const data = await runPlanTrip(fetchImpl);
    expect(data.routes[0].named).toBe(true);
    expect(data.routes[0].waypoints.every((w) => w.name)).toBe(true);
    expect(data.routes[1].named).toBe(false);
    expect(data.routes[1].waypoints.every((w) => w.name === null)).toBe(true);
  }, 10000);

  it("returns only the fastest route when no hazard is present", async () => {
    const fetchImpl = createFetchRouter({
      nominatim: (url) =>
        url.pathname.includes("reverse")
          ? nominatimReverse({ city: "Waypoint", state: "Arizona" })
          : url.searchParams.get("q").includes("Phoenix")
            ? nominatimSearch(PHOENIX.lat, PHOENIX.lon, PHOENIX.display)
            : nominatimSearch(FLAGSTAFF.lat, FLAGSTAFF.lon, FLAGSTAFF.display),
      osrm: () => twoRouteOsrm(),
      openMeteo: weatherRouter({}), // every point comes back clear
    });

    const data = await runPlanTrip(fetchImpl);
    expect(data.routes).toHaveLength(1);
    expect(data.routes[0].kind).toBe("fastest");
  }, 10000);

  it("skips re-geocoding an endpoint that's already a resolved {lat, lon, display} object", async () => {
    const fetchImpl = createFetchRouter({
      nominatim: (url) =>
        url.pathname.includes("reverse")
          ? nominatimReverse({ city: "Waypoint", state: "Arizona" })
          : nominatimSearch(FLAGSTAFF.lat, FLAGSTAFF.lon, FLAGSTAFF.display), // only "to" should ever hit /search
      osrm: () => twoRouteOsrm(),
      openMeteo: weatherRouter({}),
    });
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    vi.useFakeTimers();
    try {
      const promise = planTrip({
        from: { lat: PHOENIX.lat, lon: PHOENIX.lon, display: PHOENIX.display },
        to: "Flagstaff, AZ",
        departUtc: new Date().toISOString(),
        intervalSeconds: 3600,
      });
      await vi.runAllTimersAsync();
      const data = await promise;
      expect(data.origin.display).toBe(PHOENIX.display);

      const searchCalls = fetch.mock.calls
        .map(([u]) => new URL(u))
        .filter((u) => u.hostname === "nominatim.openstreetmap.org" && u.pathname.includes("search"));
      expect(searchCalls).toHaveLength(1); // only "to" was forward-geocoded
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  }, 10000);
});
