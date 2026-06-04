import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Deterministic-core tests run in plain Node. The cross-engine golden-hash
    // check (Node↔Chromium) is run separately via Playwright in the Phase 1 gate.
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
