import { defineConfig, devices } from "@playwright/test";

// Cross-engine determinism harness only. Runs the sim's golden scenario inside a
// real Chromium and asserts the hashes match Node's committed fixture — catching
// any cross-engine float / typed-array / BigInt drift.
export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
