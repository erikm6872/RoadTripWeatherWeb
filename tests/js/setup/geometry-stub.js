// jsdom doesn't compute real layout (offsetHeight/clientHeight/scrollHeight
// are always 0, getBoundingClientRect() is always zeros). These helpers
// override those on a specific element so the scroll-sync math in app.js
// (which is otherwise untestable without a real browser) can be exercised
// with controlled, deterministic geometry.

export function stubRect(el, rect) {
  el.getBoundingClientRect = () => ({
    top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
    toJSON() {},
    ...rect,
  });
}

export function stubMetric(el, prop, value) {
  Object.defineProperty(el, prop, { value, configurable: true });
}
