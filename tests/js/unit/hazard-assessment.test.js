import { describe, it, expect } from "vitest";
import apiModule from "../../../static/api.js";

const { assessHazards } = apiModule;

describe("assessHazards", () => {
  it("returns severity 'none' with no hazards for benign conditions", () => {
    const result = assessHazards({
      weathercode: 0, // clear sky
      apparentTemperature: 70,
      temperature: 70,
      windSpeed: 10,
    });
    expect(result.severity).toBe("none");
    expect(result.hazards).toEqual([]);
  });

  describe("weather-code table", () => {
    it("flags fog (45) as a hazard", () => {
      const r = assessHazards({ weathercode: 45, temperature: 70, windSpeed: 5 });
      expect(r.severity).toBe("hazard");
      expect(r.hazards).toEqual([{ label: "Fog", level: "hazard" }]);
    });

    it("flags heavy snow (75) as extreme", () => {
      const r = assessHazards({ weathercode: 75, temperature: 20, windSpeed: 5 });
      expect(r.severity).toBe("extreme");
      expect(r.hazards).toEqual([{ label: "Heavy snow", level: "extreme" }]);
    });

    it("flags thunderstorm with heavy hail (99) as extreme", () => {
      const r = assessHazards({ weathercode: 99, temperature: 70, windSpeed: 5 });
      expect(r.severity).toBe("extreme");
    });

    it("does not flag an unmapped code (e.g. 3 - overcast)", () => {
      const r = assessHazards({ weathercode: 3, temperature: 70, windSpeed: 5 });
      expect(r.severity).toBe("none");
    });
  });

  describe("feels-like temperature thresholds", () => {
    it("flags 100-109.9F as dangerous heat (hazard)", () => {
      const r = assessHazards({ apparentTemperature: 105, windSpeed: 5 });
      expect(r.hazards).toContainEqual({ label: "Dangerous heat 105°F", level: "hazard" });
      expect(r.severity).toBe("hazard");
    });

    it("flags >=110F as extreme heat", () => {
      const r = assessHazards({ apparentTemperature: 110, windSpeed: 5 });
      expect(r.hazards).toContainEqual({ label: "Extreme heat 110°F", level: "extreme" });
      expect(r.severity).toBe("extreme");
    });

    it("flags 15.1F down to 0.1F as bitter cold (hazard)", () => {
      const r = assessHazards({ apparentTemperature: 10, windSpeed: 5 });
      expect(r.hazards).toContainEqual({ label: "Bitter cold 10°F", level: "hazard" });
      expect(r.severity).toBe("hazard");
    });

    it("flags <=0F as extreme cold", () => {
      const r = assessHazards({ apparentTemperature: 0, windSpeed: 5 });
      expect(r.hazards).toContainEqual({ label: "Extreme cold 0°F", level: "extreme" });
      expect(r.severity).toBe("extreme");
    });

    it("does not flag a comfortable feels-like temperature", () => {
      const r = assessHazards({ apparentTemperature: 72, windSpeed: 5 });
      expect(r.hazards).toEqual([]);
    });

    it("falls back to `temperature` when apparentTemperature is null", () => {
      const r = assessHazards({ apparentTemperature: null, temperature: 0, windSpeed: 5 });
      expect(r.hazards).toContainEqual({ label: "Extreme cold 0°F", level: "extreme" });
    });
  });

  describe("wind speed thresholds", () => {
    it("flags 35-49.9 mph as high wind (hazard)", () => {
      const r = assessHazards({ temperature: 70, windSpeed: 40 });
      expect(r.hazards).toContainEqual({ label: "High wind 40 mph", level: "hazard" });
    });

    it("flags >=50 mph as violent wind (extreme)", () => {
      const r = assessHazards({ temperature: 70, windSpeed: 50 });
      expect(r.hazards).toContainEqual({ label: "Violent wind 50 mph", level: "extreme" });
    });

    it("does not flag calm wind", () => {
      const r = assessHazards({ temperature: 70, windSpeed: 10 });
      expect(r.hazards).toEqual([]);
    });
  });

  describe("severity is the worst of multiple simultaneous hazards", () => {
    it("combines a weather-code hazard with an extreme-cold hazard into overall extreme", () => {
      const r = assessHazards({
        weathercode: 71, // slight snow -> hazard
        apparentTemperature: -5, // extreme cold
        windSpeed: 10,
      });
      expect(r.severity).toBe("extreme");
      expect(r.hazards).toHaveLength(2);
    });

    it("a merely-hazard weather code plus merely-hazard wind stays at hazard, not extreme", () => {
      const r = assessHazards({
        weathercode: 45, // fog -> hazard
        temperature: 70,
        windSpeed: 40, // high wind -> hazard
      });
      expect(r.severity).toBe("hazard");
      expect(r.hazards).toHaveLength(2);
    });
  });

  it("tolerates all-null/undefined input without throwing", () => {
    expect(() => assessHazards({})).not.toThrow();
    const r = assessHazards({});
    expect(r.severity).toBe("none");
    expect(r.hazards).toEqual([]);
  });
});
