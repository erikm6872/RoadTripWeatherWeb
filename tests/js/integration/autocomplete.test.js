import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import apiModule from "../../../static/api.js";
import { photonResponse, createFetchRouter } from "../setup/fixtures.js";

const { suggestPlaces } = apiModule;

describe("suggestPlaces", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("maps Photon features to {label, sublabel, lat, lon}", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        photon: () =>
          photonResponse([{ name: "Tucson", city: "Tucson", state: "Arizona", country: "USA", lat: 32.22, lon: -110.97 }]),
      })
    );
    const results = await suggestPlaces("Tucson");
    // "Tucson" appears as both the label (from `name`) and `city`, so the
    // sublabel drops the duplicate city and keeps state + country.
    expect(results).toEqual([
      { label: "Tucson", sublabel: "Arizona, USA", lat: 32.22, lon: -110.97 },
    ]);
  });

  it("de-duplicates entries with the same label+sublabel", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        photon: () =>
          photonResponse([
            { name: "Tucson", city: "Tucson", state: "Arizona", country: "USA", lat: 32.22, lon: -110.97 },
            { name: "Tucson", city: "Tucson", state: "Arizona", country: "USA", lat: 32.2201, lon: -110.9701 },
          ]),
      })
    );
    const results = await suggestPlaces("Tucson");
    expect(results).toHaveLength(1);
  });

  it("respects the limit parameter", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        photon: () =>
          photonResponse(
            Array.from({ length: 10 }, (_, i) => ({
              name: `Place ${i}`,
              city: "City",
              state: "State",
              country: "USA",
              lat: i,
              lon: i,
            }))
          ),
      })
    );
    const results = await suggestPlaces("Place", 3);
    expect(results).toHaveLength(3);
  });

  it("skips a sublabel field that duplicates the label", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        photon: () =>
          photonResponse([{ name: "Arizona", city: "Arizona", state: "Arizona", country: "USA", lat: 34, lon: -111 }]),
      })
    );
    const [result] = await suggestPlaces("Arizona");
    expect(result.sublabel).toBe("USA"); // "Arizona" (city/state) deduped against the label
  });

  it("sends lat/lon bias params when both are present ({lat, lon})", async () => {
    fetch.mockImplementation(createFetchRouter({ photon: () => photonResponse([]) }));
    await suggestPlaces("Tucson", 5, { lat: 32.2, lon: -110.9 });
    const calledUrl = new URL(fetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get("lat")).toBe("32.2");
    expect(calledUrl.searchParams.get("lon")).toBe("-110.9");
  });

  it("accepts Leaflet's {lat, lng} bias shape", async () => {
    fetch.mockImplementation(createFetchRouter({ photon: () => photonResponse([]) }));
    await suggestPlaces("Tucson", 5, { lat: 32.2, lng: -110.9 });
    const calledUrl = new URL(fetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get("lon")).toBe("-110.9");
  });

  it("omits bias params entirely when lon/lng is missing (avoids a Photon 400)", async () => {
    fetch.mockImplementation(createFetchRouter({ photon: () => photonResponse([]) }));
    await suggestPlaces("Tucson", 5, { lat: 32.2 });
    const calledUrl = new URL(fetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.has("lat")).toBe(false);
    expect(calledUrl.searchParams.has("lon")).toBe(false);
  });

  it("skips a feature with no usable label", async () => {
    fetch.mockImplementation(
      createFetchRouter({
        photon: () =>
          photonResponse([{ name: "", city: "", state: "", country: "", lat: 1, lon: 1 }]),
      })
    );
    const results = await suggestPlaces("x");
    expect(results).toHaveLength(0);
  });
});
