import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { vi } from "vitest";
import { createLeafletStub } from "./leaflet-stub.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = path.resolve(__dirname, "../../../templates/index.html");

/**
 * Load static/app.js into the current jsdom `document`, after wiring up the
 * same DOM structure as templates/index.html and a fake Leaflet (`L`).
 * Must be called from a test file with `// @vitest-environment jsdom`.
 *
 * Returns the module's test-only export shim (see the bottom of app.js).
 */
export async function loadApp({ geolocation = false } = {}) {
  const html = readFileSync(INDEX_HTML, "utf8");
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = body;

  globalThis.L = createLeafletStub();
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: window.innerWidth <= 768,
      addEventListener() {},
      removeEventListener() {},
    });
  }
  if (geolocation && !("geolocation" in navigator)) {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: vi.fn() },
    });
  }

  vi.resetModules();
  const mod = await import("../../../static/app.js");
  return mod.default;
}
