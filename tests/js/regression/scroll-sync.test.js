// @vitest-environment jsdom
//
// Regression tests for the scroll-driven "active stop" mechanism documented
// in docs/Features/Scroll-Sync-UI.md — the trickiest piece of app.js. jsdom
// doesn't compute real layout, so every geometry value used here is stubbed
// explicitly (see tests/js/setup/geometry-stub.js) rather than relying on
// jsdom's layout engine, which doesn't exist.
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "../setup/load-app.js";
import { stubRect, stubMetric } from "../setup/geometry-stub.js";

function makeTrip(n) {
  const waypoints = Array.from({ length: n }, (_, i) => ({
    name: `Stop ${i}`,
    lat: 30 + i,
    lon: -100 - i,
    drive_seconds: i * 600,
    arrival_utc: new Date(Date.now() + i * 600000).toISOString(),
    weather: { severity: "none", hazards: [], emoji: "☀️", description: "Clear sky", temperature: 70 },
  }));
  return {
    origin: { display: "A", lat: 0, lon: 0 },
    destination: { display: "B", lat: 1, lon: 1 },
    depart_utc: new Date().toISOString(),
    routes: [
      {
        distance_m: 100000,
        duration_s: 3600,
        geometry: waypoints.map((w) => [w.lat, w.lon]),
        waypoints,
        hazard: { score: 0, hazardCount: 0, extremeCount: 0, worst: "none" },
        named: true,
        kind: "fastest",
        id: 0,
        etaDeltaSeconds: 0,
      },
    ],
    selectedIndex: 0,
  };
}

let app;
let sidebar, cards;

beforeEach(async () => {
  app = await loadApp();
  app.render(makeTrip(4));
  sidebar = document.getElementById("sidebar");
  cards = [...document.querySelectorAll("#stops .stop")];
  expect(cards).toHaveLength(4); // sanity: render() actually populated the list

  // Desktop layout: #sidebar is the scroller, positioned at viewport top.
  stubRect(sidebar, { top: 0 });
  stubMetric(sidebar, "clientHeight", 600);
  stubMetric(sidebar, "scrollTop", 0);
  stubMetric(sidebar, "scrollHeight", 2000);
});

describe("zoneLineY / listTopY (desktop)", () => {
  it("places the highlight line 30% down the visible list area", () => {
    // listTopY() = sidebar top (0); zoneLineY() = 0 + (600 - 0) * 0.3 = 180
    expect(app.listTopY()).toBe(0);
    expect(app.zoneLineY()).toBe(180);
  });
});

describe("updateActiveFromScroll (desktop)", () => {
  it("activates the last card whose top has crossed the highlight line", () => {
    // line = 180. Cards 0 and 1 have scrolled past it; 2 and 3 haven't.
    stubRect(cards[0], { top: -100 });
    stubRect(cards[1], { top: 150 });
    stubRect(cards[2], { top: 400 });
    stubRect(cards[3], { top: 650 });

    app.updateActiveFromScroll();
    expect(app._internal.activeIndex).toBe(1);
  });

  it("moves the active stop forward as the list scrolls further", () => {
    stubRect(cards[0], { top: -400 });
    stubRect(cards[1], { top: -100 });
    stubRect(cards[2], { top: 180 }); // exactly on the line (180 - 180 = 0 <= 4)
    stubRect(cards[3], { top: 500 });

    app.updateActiveFromScroll();
    expect(app._internal.activeIndex).toBe(2);
  });

  it("stays on the first card when nothing has scrolled yet", () => {
    stubRect(cards[0], { top: 50 });
    stubRect(cards[1], { top: 350 });
    stubRect(cards[2], { top: 650 });
    stubRect(cards[3], { top: 950 });

    app.updateActiveFromScroll();
    expect(app._internal.activeIndex).toBe(0);
  });

  it("forces the last stop active once scrolled within 4px of the bottom, regardless of card positions", () => {
    stubMetric(sidebar, "scrollTop", 1396); // 1396 + 600 = 1996 >= 2000 - 4
    // Card positions would otherwise say index 0 is active — the
    // near-bottom override must take precedence so the destination is
    // reachable even if its card is short.
    stubRect(cards[0], { top: 50 });
    stubRect(cards[1], { top: 350 });
    stubRect(cards[2], { top: 650 });
    stubRect(cards[3], { top: 950 });

    app.updateActiveFromScroll();
    expect(app._internal.activeIndex).toBe(3);
  });

  it("does not force the last stop active when just short of the bottom threshold", () => {
    stubMetric(sidebar, "scrollTop", 1390); // 1390 + 600 = 1990 < 1996 threshold
    stubRect(cards[0], { top: 50 });
    stubRect(cards[1], { top: 350 });
    stubRect(cards[2], { top: 650 });
    stubRect(cards[3], { top: 950 });

    app.updateActiveFromScroll();
    expect(app._internal.activeIndex).toBe(0);
  });
});

describe("setActive", () => {
  it("moves the 'active' class between cards and 'wx-active' between marker icons", () => {
    app.setActive(0, { pan: false });
    expect(cards[0].classList.contains("active")).toBe(true);
    const marker0 = app._internal.markersByIndex[0];
    expect(marker0._icon.classList.contains("wx-active")).toBe(true);

    app.setActive(2, { pan: false });
    expect(cards[0].classList.contains("active")).toBe(false);
    expect(marker0._icon.classList.contains("wx-active")).toBe(false);
    expect(cards[2].classList.contains("active")).toBe(true);
    expect(app._internal.markersByIndex[2]._icon.classList.contains("wx-active")).toBe(true);
  });

  it("raises the active marker's z-index and resets the previous one's", () => {
    app.setActive(1, { pan: false });
    expect(app._internal.markersByIndex[1].zIndexOffset).toBe(1000);
    app.setActive(2, { pan: false });
    expect(app._internal.markersByIndex[1].zIndexOffset).toBe(0);
    expect(app._internal.markersByIndex[2].zIndexOffset).toBe(1000);
  });

  it("is a no-op when re-activating the already-active stop", () => {
    app.setActive(1, { pan: false });
    cards[1].classList.add("marker-of-this-test"); // sentinel
    app.setActive(1, { pan: false });
    // Still just one active card, no errors, sentinel class untouched.
    expect(document.querySelectorAll("#stops .stop.active")).toHaveLength(1);
    expect(cards[1].classList.contains("marker-of-this-test")).toBe(true);
  });
});

describe("adjustStopsPadding", () => {
  it("adds bottom padding sized so the last card can reach the highlight line", () => {
    stubMetric(cards[3], "offsetHeight", 120);
    app.adjustStopsPadding();
    // pad = clientHeight(600) - (zoneLineY(180) - listTopY(0)) - lastCardHeight(120) = 300
    expect(document.getElementById("stops").style.paddingBottom).toBe("300px");
  });

  it("never applies negative padding", () => {
    stubMetric(cards[3], "offsetHeight", 10000); // absurdly tall last card
    app.adjustStopsPadding();
    expect(document.getElementById("stops").style.paddingBottom).toBe("0px");
  });
});
