import { describe, it, expect } from "vitest";
import { cloneWorld, hashWorld } from "../src/index.ts";
import { tick } from "../src/index.ts";
import { buildScenario, buildScenario2, runCheckpoints, runCheckpoints2 } from "./golden/scenario.ts";
import golden from "./golden/phase1.json" with { type: "json" };
import golden2 from "./golden/phase2.json" with { type: "json" };

/**
 * PHASE 1 DETERMINISM GATES. These block progression to Phase 2.
 * (The Node↔Chromium cross-engine match runs separately under Playwright and
 * asserts the SAME golden fixture — see test/golden/.)
 */
describe("determinism gates", () => {
  it("tick is pure — it does not mutate its input", () => {
    const s = buildScenario();
    const before = hashWorld(s);
    Object.freeze(s); // top-level reassignment would throw
    const next = tick(s);
    expect(next).not.toBe(s);
    expect(hashWorld(s)).toBe(before); // input untouched
  });

  it("same seed + same steps ⇒ identical checkpoint hashes (run twice)", () => {
    expect(runCheckpoints()).toEqual(runCheckpoints());
  });

  it("matches the committed, locked golden fixture (fire only)", () => {
    // If this fails after an intentional behavior change, regenerate the fixture
    // explicitly (see scenario.ts) — never let it drift silently.
    expect(runCheckpoints()).toEqual(golden);
  });

  it("matches the locked golden fixture with units (extinguish/firebreak/refill/move)", () => {
    expect(runCheckpoints2()).toEqual(golden2);
  });

  it("the units scenario is reproducible run-to-run", () => {
    expect(runCheckpoints2()).toEqual(runCheckpoints2());
  });

  it("the units scenario survives a snapshot round-trip", () => {
    let s = buildScenario2();
    for (let i = 0; i < 60; i++) s = tick(s);
    let original = s;
    let resumed = cloneWorld(s);
    for (let i = 0; i < 60; i++) {
      original = tick(original);
      resumed = tick(resumed);
    }
    expect(hashWorld(resumed)).toBe(hashWorld(original));
  });

  it("survives a snapshot round-trip — a clone continues identically", () => {
    let s = buildScenario();
    for (let i = 0; i < 123; i++) s = tick(s);

    let original = s;
    let resumed = cloneWorld(s);
    for (let i = 0; i < 80; i++) {
      original = tick(original);
      resumed = tick(resumed);
    }
    expect(hashWorld(resumed)).toBe(hashWorld(original));
  });
});
