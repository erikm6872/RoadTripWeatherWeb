import { defineConfig } from "vitest/config";

// Default environment is plain Node — static/api.js has no DOM dependency.
// Files that need a DOM (app.js's UI-layer tests) opt in per-file with a
// `// @vitest-environment jsdom` docblock at the top of the test file.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/js/**/*.test.js"],
  },
});
