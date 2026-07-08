// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "../setup/load-app.js";

let app;
beforeEach(async () => {
  app = await loadApp();
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(app.escapeHtml(`<a href="x">O'Brien & Sons</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;O&#39;Brien &amp; Sons&lt;/a&gt;"
    );
  });

  it("coerces non-string input", () => {
    expect(app.escapeHtml(42)).toBe("42");
  });

  it("leaves plain text untouched", () => {
    expect(app.escapeHtml("Phoenix, AZ")).toBe("Phoenix, AZ");
  });
});

describe("fmtDuration", () => {
  it("formats sub-hour durations as minutes only", () => {
    expect(app.fmtDuration(25 * 60)).toBe("25m");
  });

  it("formats hour+ durations as 'Xh Ym'", () => {
    expect(app.fmtDuration(2 * 3600 + 15 * 60)).toBe("2h 15m");
  });

  it("rounds minutes", () => {
    expect(app.fmtDuration(3600 + 90)).toBe("1h 2m"); // 90s -> 1.5min -> rounds to 2
  });

  it("formats exactly zero as 0m", () => {
    expect(app.fmtDuration(0)).toBe("0m");
  });
});

describe("hazardBadge", () => {
  it("shows a clear badge with no hazards", () => {
    const html = app.hazardBadge({ score: 0, hazardCount: 0, extremeCount: 0, worst: "none" });
    expect(html).toContain("Clear");
    expect(html).toContain("route-badge--clear");
  });

  it("shows a hazard badge, pluralized", () => {
    const html = app.hazardBadge({ score: 2, hazardCount: 2, extremeCount: 0, worst: "hazard" });
    expect(html).toContain("2 hazards");
    expect(html).toContain("route-badge--hazard");
  });

  it("uses singular wording for exactly one hazard", () => {
    const html = app.hazardBadge({ score: 1, hazardCount: 1, extremeCount: 0, worst: "hazard" });
    expect(html).toContain("1 hazard");
    expect(html).not.toContain("1 hazards");
  });

  it("prioritizes the extreme badge, combining extreme+hazard counts", () => {
    const html = app.hazardBadge({ score: 4, hazardCount: 1, extremeCount: 1, worst: "extreme" });
    expect(html).toContain("route-badge--extreme");
    expect(html).toContain("2 hazards");
  });
});

describe("routeStyle", () => {
  it("styles the selected route as solid blue", () => {
    const style = app.routeStyle(0, 0);
    expect(style.color).toBe("#38bdf8");
    expect(style.dashArray).toBeUndefined();
  });

  it("styles a non-selected route as faint dashed gray", () => {
    const style = app.routeStyle(1, 0);
    expect(style.color).toBe("#64748b");
    expect(style.dashArray).toBe("6 8");
  });
});

describe("detailLine", () => {
  it("joins available fields with a middle dot", () => {
    const line = app.detailLine({
      apparent_temperature: 68,
      precipitation_probability: 40,
      wind_speed: 12,
    });
    expect(line).toBe("Feels 68°F · 40% precip · 12 mph wind");
  });

  it("omits null fields", () => {
    const line = app.detailLine({
      apparent_temperature: null,
      precipitation_probability: 40,
      wind_speed: null,
    });
    expect(line).toBe("40% precip");
  });

  it("returns an empty string when nothing is available", () => {
    expect(app.detailLine({})).toBe("");
  });
});

describe("hazardChips", () => {
  it("returns an empty string when there are no hazards", () => {
    expect(app.hazardChips({ hazards: [] })).toBe("");
  });

  it("renders one chip per hazard with the correct severity class", () => {
    const html = app.hazardChips({
      hazards: [
        { label: "Fog", level: "hazard" },
        { label: "Extreme cold 0°F", level: "extreme" },
      ],
    });
    expect(html).toContain('class="hz hz--hazard"');
    expect(html).toContain(">Fog<");
    expect(html).toContain('class="hz hz--extreme"');
  });

  it("escapes hazard labels", () => {
    const html = app.hazardChips({ hazards: [{ label: "<script>", level: "hazard" }] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
