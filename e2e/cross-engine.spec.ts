import { test, expect } from "@playwright/test";
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.resolve(here, "../packages/sim/test/golden/phase1.json");
const scenarioPath = path.resolve(here, "../packages/sim/test/golden/scenario.ts");

/**
 * THE cross-engine determinism gate. The sim avoids engine-unstable transcendentals
 * (wind via dot-product, FNV via BigInt, floats via DataView), so the SAME scenario
 * must hash identically in Chromium and in Node. If this ever fails, some platform
 * float/encoding difference has crept in — multiplayer desync waiting to happen.
 */
test("sim golden hashes are bit-identical in Chromium and Node", async ({ page }) => {
  const golden = JSON.parse(readFileSync(goldenPath, "utf8")) as Record<string, string>;

  // Bundle the deterministic scenario into a browser IIFE.
  const built = await esbuild.build({
    entryPoints: [scenarioPath],
    bundle: true,
    format: "iife",
    globalName: "Golden",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  const js = built.outputFiles[0]!.text;

  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: js });
  const browserHashes = await page.evaluate(() => {
    return (globalThis as unknown as { Golden: { runCheckpoints(): Record<string, string> } }).Golden.runCheckpoints();
  });

  expect(browserHashes).toEqual(golden);
});
