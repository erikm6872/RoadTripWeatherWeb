import { describe, it, expect } from "vitest";
import apiModule from "../../../static/api.js";

const { samplePoints } = apiModule;

/** A route with `numPoints` coordinates evenly spaced over `totalSeconds`. */
function makeRoute(totalSeconds, numPoints) {
  const coords = [];
  const cumTime = [];
  for (let i = 0; i < numPoints; i++) {
    coords.push([i, i]);
    cumTime.push((totalSeconds * i) / (numPoints - 1));
  }
  return { coords, cumTime };
}

describe("samplePoints", () => {
  it("samples at the requested interval when it evenly divides the trip", () => {
    const route = makeRoute(7200, 73); // 2h trip, one coord every 100s
    const samples = samplePoints(route, 1800); // every 30 min
    expect(samples.map((s) => s.driveSeconds)).toEqual([0, 1800, 3600, 5400, 7200]);
  });

  it("always includes the origin (t=0) when the trip is long relative to the interval", () => {
    const route = makeRoute(7200, 73);
    const samples = samplePoints(route, 1800);
    expect(samples[0].driveSeconds).toBe(0);
  });

  it("always includes the destination (t=total)", () => {
    const route = makeRoute(7200, 73);
    const samples = samplePoints(route, 1800);
    expect(samples[samples.length - 1].driveSeconds).toBe(7200);
  });

  it("widens the interval so the sample count stays within maxPoints", () => {
    const route = makeRoute(36000, 361); // 10h trip, one coord every 100s
    const samples = samplePoints(route, 1800, 12); // naive count would be 20+
    expect(samples.length).toBeLessThanOrEqual(12);
    expect(samples[0].driveSeconds).toBe(0);
    expect(samples[samples.length - 1].driveSeconds).toBe(36000);
  });

  it("drops the destination sample's predecessor when it lands within half the interval", () => {
    // interval=300 -> minGap=150. Destination (t=1000) lands only 100s after
    // the t=900 sample, so 900 should be replaced by the destination rather
    // than both being kept.
    const route = makeRoute(1000, 11); // one coord every 100s
    const samples = samplePoints(route, 300);
    const times = samples.map((s) => s.driveSeconds);
    expect(times).toEqual([0, 300, 600, 1000]);
    expect(times).not.toContain(900);
  });

  it("never returns duplicate coordinate indices", () => {
    const route = makeRoute(5000, 51);
    const samples = samplePoints(route, 900);
    const seen = new Set();
    for (const s of samples) {
      const key = `${s.lat},${s.lon}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("handles a single-leg route (2 coordinates)", () => {
    const route = makeRoute(600, 2);
    const samples = samplePoints(route, 3600);
    expect(samples[samples.length - 1].driveSeconds).toBe(600);
  });

  it("returns just the destination for a trip much shorter than half the interval", () => {
    // Documents current behavior: a very short drive time relative to the
    // interval can cause the origin sample to be popped and replaced by the
    // destination sample (see docs/Features/Trip-Planning-Flow.md).
    const route = makeRoute(500, 2);
    const samples = samplePoints(route, 3600);
    expect(samples).toHaveLength(1);
    expect(samples[0].driveSeconds).toBe(500);
  });
});
