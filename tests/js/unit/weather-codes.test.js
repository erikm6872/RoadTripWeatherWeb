import { describe, it, expect } from "vitest";
import apiModule from "../../../static/api.js";

const { describeWeather } = apiModule;

describe("describeWeather", () => {
  it("describes known WMO codes", () => {
    expect(describeWeather(0)).toEqual(["Clear sky", "☀️"]);
    expect(describeWeather(95)).toEqual(["Thunderstorm", "⛈️"]);
    expect(describeWeather(75)).toEqual(["Heavy snow", "❄️"]);
  });

  it("falls back to Unknown/❓ for an unmapped code", () => {
    expect(describeWeather(12345)).toEqual(["Unknown", "❓"]);
  });

  it("falls back to Unknown/❓ for a missing code", () => {
    expect(describeWeather(undefined)).toEqual(["Unknown", "❓"]);
    expect(describeWeather(null)).toEqual(["Unknown", "❓"]);
  });

  it("covers every code referenced by the hazard table", () => {
    // Every hazardous code must also have a human description — otherwise
    // a stop could show a hazard chip with no matching weather description.
    const hazardCodes = [45, 48, 56, 57, 65, 66, 67, 71, 73, 75, 77, 81, 82, 85, 86, 95, 96, 99];
    for (const code of hazardCodes) {
      const [desc] = describeWeather(code);
      expect(desc).not.toBe("Unknown");
    }
  });
});
