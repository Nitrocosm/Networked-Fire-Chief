import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { DIR_UNIT, resolveWind, windFactor, type Wind, type WindKeyframe } from "../src/wind/wind.ts";

const cfg = DEFAULT_CONFIG;

// Wind blowing toward +x (East), full speed.
const eastWind: Wind = {
  dirX: 1, dirY: 0, speed: 1,
  forecastDirX: 1, forecastDirY: 0, forecastSpeed: 1, forecastEtaTick: 0,
};

describe("windFactor", () => {
  it("boosts downwind, suppresses upwind, ~neutral crosswind", () => {
    const downwind = windFactor(0, eastWind, cfg); // +q points East = downwind
    const upwind = windFactor(3, eastWind, cfg); // -q points West = upwind
    const crosswind = windFactor(1, eastWind, cfg); // +q-r is 60° off

    expect(downwind).toBeCloseTo(cfg.WIND_DOWNWIND_MULT, 5);
    expect(upwind).toBeCloseTo(cfg.WIND_UPWIND_MULT, 5);
    expect(downwind).toBeGreaterThan(crosswind);
    expect(crosswind).toBeGreaterThan(upwind);
    expect(upwind).toBeGreaterThan(0); // small but NONZERO (rare upwind spread)
  });

  it("is ~neutral (≈1) in every direction when wind is calm", () => {
    const calm: Wind = { ...eastWind, speed: 0 };
    for (let i = 0; i < DIR_UNIT.length; i++) {
      expect(windFactor(i, calm, cfg)).toBeCloseTo(1, 6);
    }
  });

  it("scales with wind speed between neutral and the anchor", () => {
    const half: Wind = { ...eastWind, speed: 0.5 };
    const full = windFactor(0, eastWind, cfg);
    const mid = windFactor(0, half, cfg);
    expect(mid).toBeGreaterThan(1);
    expect(mid).toBeLessThan(full);
    expect(mid).toBeCloseTo(1 + (full - 1) * 0.5, 5);
  });
});

describe("resolveWind", () => {
  const keyframes: WindKeyframe[] = [
    { atTick: 0, dirX: 1, dirY: 0, speed: 0.2 },
    { atTick: 100, dirX: 0, dirY: 1, speed: 0.8 },
  ];

  it("holds the first keyframe before it starts and forecasts it", () => {
    const w = resolveWind(keyframes, -10);
    expect(w.speed).toBe(0.2);
    expect(w.forecastEtaTick).toBe(0);
  });

  it("interpolates speed and points the forecast at the next keyframe", () => {
    const w = resolveWind(keyframes, 50);
    expect(w.speed).toBeCloseTo(0.5, 5); // halfway 0.2 → 0.8
    expect(w.forecastSpeed).toBe(0.8);
    expect(w.forecastEtaTick).toBe(100);
    // direction is normalized
    expect(Math.hypot(w.dirX, w.dirY)).toBeCloseTo(1, 6);
  });

  it("holds steady at/after the last keyframe", () => {
    const w = resolveWind(keyframes, 999);
    expect(w.speed).toBe(0.8);
    expect(w.dirX).toBeCloseTo(0, 6);
    expect(w.dirY).toBeCloseTo(1, 6);
  });

  it("returns calm with no keyframes", () => {
    expect(resolveWind([], 5).speed).toBe(0);
  });
});
