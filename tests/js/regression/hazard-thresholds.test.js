// Locks the exact numeric cutoffs documented in
// docs/Features/Hazard-Assessment.md and docs/Glossary.md. If one of these
// fails after an intentional threshold change, update both docs pages in
// the same change (see CLAUDE.md).
import { describe, it, expect } from "vitest";
import apiModule from "../../../static/api.js";

const { assessHazards } = apiModule;

describe("hazard threshold boundaries (regression)", () => {
  it.each([
    [99.9, "none"],
    [100, "hazard"], // dangerous heat starts at exactly 100
    [109.9, "hazard"],
    [110, "extreme"], // extreme heat starts at exactly 110
  ])("feels-like %s°F -> %s (heat)", (temp, expected) => {
    const r = assessHazards({ apparentTemperature: temp });
    expect(r.severity).toBe(expected);
  });

  it.each([
    [15.1, "none"],
    [15, "hazard"], // bitter cold starts at exactly 15
    [0.1, "hazard"],
    [0, "extreme"], // extreme cold starts at exactly 0
  ])("feels-like %s°F -> %s (cold)", (temp, expected) => {
    const r = assessHazards({ apparentTemperature: temp });
    expect(r.severity).toBe(expected);
  });

  it.each([
    [34.9, "none"],
    [35, "hazard"], // high wind starts at exactly 35 mph
    [49.9, "hazard"],
    [50, "extreme"], // violent wind starts at exactly 50 mph
  ])("wind %s mph -> %s", (wind, expected) => {
    const r = assessHazards({ windSpeed: wind });
    expect(r.severity).toBe(expected);
  });

  // The full documented WMO hazard-code table (docs/Glossary.md). A change
  // to any of these severities should be a deliberate, documented decision.
  const EXPECTED_WEATHER_HAZARDS = {
    45: "hazard", 48: "hazard",
    56: "hazard", 57: "hazard",
    65: "hazard", 66: "hazard", 67: "extreme",
    71: "hazard", 73: "hazard", 75: "extreme", 77: "hazard",
    81: "hazard", 82: "extreme",
    85: "hazard", 86: "extreme",
    95: "hazard", 96: "extreme", 99: "extreme",
  };

  it.each(Object.entries(EXPECTED_WEATHER_HAZARDS))(
    "WMO code %s -> severity %s",
    (code, expected) => {
      const r = assessHazards({ weathercode: Number(code), temperature: 70, windSpeed: 5 });
      expect(r.severity).toBe(expected);
    }
  );

  it("codes not in the hazard table produce no hazard", () => {
    const benign = [0, 1, 2, 3, 51, 53, 55, 61, 63, 80];
    for (const code of benign) {
      const r = assessHazards({ weathercode: code, temperature: 70, windSpeed: 5 });
      expect(r.severity).toBe("none");
    }
  });
});
