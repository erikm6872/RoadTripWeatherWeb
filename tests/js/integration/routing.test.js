import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiModule from "../../../static/api.js";
import { osrmResponse, osrmNoRoute, createFetchRouter } from "../setup/fixtures.js";

const { getRoutesOSRM, ServiceError } = apiModule;

const START = { lat: 33.45, lon: -112.07 }; // Phoenix
const END = { lat: 32.22, lon: -110.97 }; // Tucson

describe("getRoutesOSRM", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("flips OSRM's [lon,lat] geometry to Leaflet's [lat,lon]", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        osrm: () =>
          osrmResponse([
            {
              coords: [
                [START.lat, START.lon],
                [END.lat, END.lon],
              ],
              legs: [[3600]],
              distance: 180000,
              duration: 3600,
            },
          ]),
      })
    );
    const [route] = await getRoutesOSRM(START, END, 0);
    expect(route.coords[0]).toEqual([START.lat, START.lon]);
    expect(route.coords[1]).toEqual([END.lat, END.lon]);
  });

  it("builds a cumulative-time array aligned to the coordinates", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        osrm: () =>
          osrmResponse([
            {
              coords: [
                [START.lat, START.lon],
                [33.0, -111.5],
                [END.lat, END.lon],
              ],
              legs: [[600, 600]], // one leg, two segments
              distance: 180000,
              duration: 1200,
            },
          ]),
      })
    );
    const [route] = await getRoutesOSRM(START, END, 0);
    expect(route.cumTime).toEqual([0, 600, 1200]);
  });

  it("returns multiple routes when alternatives are available, fastest first", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        osrm: () =>
          osrmResponse([
            { coords: [[START.lat, START.lon], [END.lat, END.lon]], legs: [[3000]], distance: 170000, duration: 3000 },
            { coords: [[START.lat, START.lon], [END.lat, END.lon]], legs: [[3600]], distance: 190000, duration: 3600 },
          ]),
      })
    );
    const routes = await getRoutesOSRM(START, END, 3);
    expect(routes).toHaveLength(2);
    expect(routes[0].duration).toBe(3000);
    expect(routes[1].duration).toBe(3600);
  });

  it("throws a ServiceError when OSRM finds no route", async () => {
    fetch.mockImplementation(createFetchRouter({ osrm: () => osrmNoRoute() }));
    await expect(getRoutesOSRM(START, END)).rejects.toThrow(ServiceError);
  });

  it("truncates coords/cumTime to the shorter length on a mismatch", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        osrm: () =>
          osrmResponse([
            {
              // 3 coordinates but only 1 duration segment (2 needed) -> mismatch
              coords: [[START.lat, START.lon], [33.0, -111.5], [END.lat, END.lon]],
              legs: [[600]],
              distance: 100000,
              duration: 600,
            },
          ]),
      })
    );
    const [route] = await getRoutesOSRM(START, END, 0);
    expect(route.coords.length).toBe(route.cumTime.length);
    expect(route.coords.length).toBe(2);
  });
});
