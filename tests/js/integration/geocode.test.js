import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiModule from "../../../static/api.js";
import { nominatimSearch, nominatimSearchEmpty, nominatimReverse, createFetchRouter } from "../setup/fixtures.js";

const { geocode, reverseGeocode, ServiceError } = apiModule;

describe("geocode", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a place name to coordinates + display name", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        nominatim: () => nominatimSearch(33.4484, -112.074, "Phoenix, Maricopa County, Arizona, USA"),
      })
    );
    const result = await geocode("Phoenix, AZ");
    expect(result).toEqual({ lat: 33.4484, lon: -112.074, display: "Phoenix, Maricopa County, Arizona, USA" });
  });

  it("throws a ServiceError when no results are found", async () => {
    fetch.mockImplementation(createFetchRouter({ nominatim: () => nominatimSearchEmpty() }));
    await expect(geocode("Nowhereville")).rejects.toThrow(ServiceError);
    await expect(geocode("Nowhereville")).rejects.toThrow(/Nowhereville/);
  });
});

describe("reverseGeocode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function runThrottled(promiseFactory) {
    const p = promiseFactory();
    await vi.runAllTimersAsync();
    return p;
  }

  it("prefers city, falling back through town/village/hamlet/suburb/municipality/county", async () => {
    fetch.mockImplementation(
      createFetchRouter({ nominatim: () => nominatimReverse({ town: "Winslow", state: "Arizona" }) })
    );
    const label = await runThrottled(() => reverseGeocode(35.02, -110.7));
    expect(label).toBe("Winslow, Arizona");
  });

  it("falls back to just the state when no place-level field is present", async () => {
    fetch.mockImplementation(
      createFetchRouter({ nominatim: () => nominatimReverse({ state: "Arizona" }) })
    );
    const label = await runThrottled(() => reverseGeocode(35.02, -110.7));
    expect(label).toBe("Arizona");
  });

  it("falls back to raw coordinates when nothing is available", async () => {
    fetch.mockImplementation(createFetchRouter({ nominatim: () => nominatimReverse({}) }));
    const label = await runThrottled(() => reverseGeocode(35.021, -110.699));
    expect(label).toBe("35.02, -110.70");
  });

  it("falls back to raw coordinates when the request fails, without throwing", async () => {
    fetch.mockRejectedValue(new Error("network down"));
    const label = await runThrottled(() => reverseGeocode(35.021, -110.699));
    expect(label).toBe("35.02, -110.70");
  });

  it("throttles consecutive calls to roughly one per second", async () => {
    // Use a freshly-loaded module instance: reverseGeocode's throttle state
    // (lastReverseCall) is a module-level singleton, so reusing the module
    // other tests already called it on would make this timing-sensitive
    // test depend on execution order.
    vi.resetModules();
    const fresh = (await import("../../../static/api.js")).default;

    fetch.mockImplementation(
      createFetchRouter({ nominatim: () => nominatimReverse({ city: "Flagstaff", state: "Arizona" }) })
    );
    const first = fresh.reverseGeocode(35.2, -111.65);
    await vi.advanceTimersByTimeAsync(0);
    const second = fresh.reverseGeocode(34.8, -111.7);

    // The second call shouldn't have hit the network yet at t=0 or t=1000ms —
    // it must wait out the ~1100ms throttle window from the first call.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
