import { test, expect } from "@playwright/test";
import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.resolve(here, "../packages/sim/test/golden");
const scenarioPath = path.resolve(goldenDir, "scenario.ts");

/**
 * THE cross-engine determinism gate. The sim avoids engine-unstable transcendentals
 * (wind via dot-product, FNV via BigInt, floats via DataView), so the SAME scenario
 * must hash identically in Chromium and in Node. If this ever fails, some platform
 * float/encoding difference has crept in — multiplayer desync waiting to happen.
 */
test("sim golden hashes are bit-identical in Chromium and Node", async ({ page }) => {
  const golden1 = JSON.parse(readFileSync(path.join(goldenDir, "phase1.json"), "utf8")) as Record<string, string>;
  const golden2 = JSON.parse(readFileSync(path.join(goldenDir, "phase2.json"), "utf8")) as Record<string, string>;
  const golden3 = JSON.parse(readFileSync(path.join(goldenDir, "phase3.json"), "utf8")) as Record<string, string>;

  // Bundle the deterministic scenarios into a browser IIFE.
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
  const result = await page.evaluate(() => {
    const g = globalThis as unknown as {
      Golden: {
        runCheckpoints(): Record<string, string>;
        runCheckpoints2(): Record<string, string>;
        runCheckpoints3(): Record<string, string>;
      };
    };
    return { one: g.Golden.runCheckpoints(), two: g.Golden.runCheckpoints2(), three: g.Golden.runCheckpoints3() };
  });

  expect(result.one).toEqual(golden1); // fire-only
  expect(result.two).toEqual(golden2); // units: extinguish/firebreak/refill/move
  expect(result.three).toEqual(golden3); // procgen + warnings + units
});
