// Regression tests for the alternate-route selection algorithm documented in
// docs/Features/Weather-Aware-Routing.md: only ever offer a route that is
// (a) strictly safer than the fastest route, and (b) the closest ETA match
// among safer candidates — safety is a filter, ETA-proximity is the ranking,
// with hazard score only as a tiebreaker. If this behavior is intentionally
// changed, update that doc page in the same change (see CLAUDE.md).
import { describe, it, expect, vi } from "vitest";
import apiModule from "../../../static/api.js";
import { nominatimSearch, nominatimReverse, osrmResponse, openMeteoHourly, createFetchRouter } from "../setup/fixtures.js";

const { planTrip, summarizeHazard } = apiModule;

const ORIGIN = { lat: 33.45, lon: -112.07, display: "Phoenix, Arizona, USA" };
const DEST = { lat: 35.2, lon: -111.65, display: "Flagstaff, Arizona, USA" };

function weatherRouter(byPoint) {
  return (url) => {
    const lat = parseFloat(url.searchParams.get("latitude"));
    const lon = parseFloat(url.searchParams.get("longitude"));
    const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
    const w = byPoint[key] || { weathercode: 0 };
    const hours = 48;
    return openMeteoHourly({
      startIso: new Date(Date.now() - 24 * 3600000).toISOString(),
      hourly: {
        weathercode: Array(hours).fill(w.weathercode),
        temperature_2m: Array(hours).fill(70),
        wind_speed_10m: Array(hours).fill(w.windSpeed ?? 5),
      },
    });
  };
}

/** A 3-coordinate route (origin -> mid -> destination) with mid at t=3600s. */
function routeVia(mid, totalDuration) {
  return {
    coords: [[ORIGIN.lat, ORIGIN.lon], [mid.lat, mid.lon], [DEST.lat, DEST.lon]],
    legs: [[3600, totalDuration - 3600]],
    distance: 150000,
    duration: totalDuration,
  };
}

async function plan(routes, weatherByPoint) {
  const fetchImpl = createFetchRouter({
    nominatim: (url) =>
      url.pathname.includes("reverse")
        ? nominatimReverse({ city: "Waypoint", state: "Arizona" })
        : url.searchParams.get("q").includes("Phoenix")
          ? nominatimSearch(ORIGIN.lat, ORIGIN.lon, ORIGIN.display)
          : nominatimSearch(DEST.lat, DEST.lon, DEST.display),
    osrm: () => osrmResponse(routes),
    openMeteo: weatherRouter(weatherByPoint),
  });
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  vi.useFakeTimers();
  try {
    const promise = planTrip({
      from: "Phoenix, AZ",
      to: "Flagstaff, AZ",
      departUtc: new Date().toISOString(),
      intervalSeconds: 3600,
    });
    await vi.runAllTimersAsync();
    return await promise;
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
}

describe("summarizeHazard scoring", () => {
  it("weights extreme 3x a plain hazard and tracks the worst severity", () => {
    const waypoints = (severities) => severities.map((s) => ({ weather: { severity: s } }));

    expect(summarizeHazard(waypoints(["none", "none"]))).toEqual({
      score: 0, hazardCount: 0, extremeCount: 0, worst: "none",
    });
    expect(summarizeHazard(waypoints(["hazard", "hazard"]))).toEqual({
      score: 2, hazardCount: 2, extremeCount: 0, worst: "hazard",
    });
    expect(summarizeHazard(waypoints(["extreme"]))).toEqual({
      score: 3, hazardCount: 0, extremeCount: 1, worst: "extreme",
    });
    // One extreme (score 3) outweighs two mere hazards (score 2).
    expect(summarizeHazard(waypoints(["extreme"])).score).toBeGreaterThan(
      summarizeHazard(waypoints(["hazard", "hazard"])).score
    );
  });
});

describe("alternate route selection (regression)", () => {
  const MID_FAST = { lat: 34.3, lon: -111.9 }; // extreme
  const MID_ALT_FAR = { lat: 34.1, lon: -112.5 }; // hazard, far ETA
  const MID_ALT_CLOSE = { lat: 34.0, lon: -112.3 }; // hazard, close ETA

  it("picks the closest-ETA safer route over a farther-but-equally-safe one", async () => {
    const routes = [
      routeVia(MID_FAST, 5400), // fastest, extreme
      routeVia(MID_ALT_FAR, 6600), // safer, +1200s
      routeVia(MID_ALT_CLOSE, 5700), // safer, +300s -> should win
    ];
    const weather = {
      "34.3,-111.9": { weathercode: 75 }, // extreme
      "34.1,-112.5": { weathercode: 45 }, // hazard
      "34.0,-112.3": { weathercode: 45 }, // hazard
    };
    const data = await plan(routes, weather);
    expect(data.routes).toHaveLength(2);
    expect(data.routes[1].duration_s).toBe(5700);
    expect(data.routes[1].etaDeltaSeconds).toBe(300);
  }, 10000);

  it("prefers closest ETA even when a farther alternative has a strictly better hazard score", async () => {
    const routes = [
      routeVia(MID_FAST, 5400), // fastest, extreme (score 3)
      routeVia(MID_ALT_FAR, 6600), // clear (score 0) but +1200s
      routeVia(MID_ALT_CLOSE, 5700), // hazard (score 1) but +300s
    ];
    const weather = {
      "34.3,-111.9": { weathercode: 75 },
      "34.1,-112.5": { weathercode: 0 }, // fully clear
      "34.0,-112.3": { weathercode: 45 }, // merely hazard
    };
    const data = await plan(routes, weather);
    // The ETA-closer route wins even though the farther one is objectively safer.
    expect(data.routes[1].duration_s).toBe(5700);
  }, 10000);

  it("offers no alternate when nothing is strictly safer than the fastest route", async () => {
    const routes = [
      routeVia(MID_FAST, 5400), // fastest, extreme (score 3)
      routeVia(MID_ALT_CLOSE, 5700), // same severity tier -> not strictly safer
    ];
    const weather = {
      "34.3,-111.9": { weathercode: 75 },
      "34.0,-112.3": { weathercode: 75 }, // also extreme — not an improvement
    };
    const data = await plan(routes, weather);
    expect(data.routes).toHaveLength(1);
  }, 10000);

  it("breaks an exact ETA-delta tie by the lower hazard score", async () => {
    // Both alternatives arrive at the same delta (+300s) and are each
    // strictly safer than the fastest route, but MID_B is worse than MID_A
    // (an extra wind hazard on top of the same weather code). The tiebreak
    // (`a.hazard.score - b.hazard.score`) must pick MID_A.
    const MID_A = { lat: 34.05, lon: -112.35 }; // hazard-only midpoint
    const MID_B = { lat: 33.95, lon: -112.15 }; // hazard midpoint + high wind
    const routes = [
      routeVia(MID_FAST, 5400), // fastest: extreme midpoint + extreme destination (score 6)
      routeVia(MID_A, 5700), // +300s, mid hazard (1) + dest extreme (3) = score 4
      routeVia(MID_B, 5700), // +300s, mid hazard+wind (2) + dest extreme (3) = score 5
    ];
    const weather = {
      "34.3,-111.9": { weathercode: 75 }, // MID_FAST: extreme
      [`${MID_A.lat.toFixed(1)},${MID_A.lon.toFixed(1)}`]: { weathercode: 45 }, // hazard only
      [`${MID_B.lat.toFixed(1)},${MID_B.lon.toFixed(1)}`]: { weathercode: 45, windSpeed: 40 }, // hazard + high wind
      [`${DEST.lat.toFixed(1)},${DEST.lon.toFixed(1)}`]: { weathercode: 75 }, // destination itself is extreme for every route
    };
    const data = await plan(routes, weather);
    expect(data.routes).toHaveLength(2);
    expect(data.routes[1].duration_s).toBe(5700);
    expect(data.routes[1].hazard.score).toBe(4); // MID_A won, not MID_B (score 5)
  }, 10000);
});
