import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, makeConfig, secondsToTicks } from "../src/index.ts";

describe("config (Phase 0 smoke test)", () => {
  it("exposes the loss-only baseline", () => {
    expect(DEFAULT_CONFIG.BASELINE_SCORE).toBe(100_000);
  });

  it("converts seconds to whole ticks deterministically", () => {
    expect(secondsToTicks(3, 15)).toBe(45);
    expect(secondsToTicks(1.5, 15)).toBe(23); // round(22.5) -> 23
    expect(secondsToTicks(0.001, 15)).toBe(1); // never below 1 tick
  });

  it("merges overrides without mutating defaults", () => {
    const original = DEFAULT_CONFIG.FIRE_P0;
    const cfg = makeConfig({ FIRE_P0: 0.12 });
    expect(cfg.FIRE_P0).toBe(0.12);
    expect(DEFAULT_CONFIG.FIRE_P0).toBe(original); // defaults object untouched
  });
});
