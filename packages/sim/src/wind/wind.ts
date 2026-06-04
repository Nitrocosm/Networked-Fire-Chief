/**
 * Wind model — the dominant strategic variable.
 *
 * Wind is a UNIT VECTOR (the direction it blows TOWARD) plus a 0..1 speed. The
 * spread multiplier is derived from the DOT PRODUCT of the wind vector and the
 * spread direction — this IS the cosine falloff (DECISIONS §2.1) but computed
 * with `+ - *` only, so it is bit-identical across JS engines. No `Math.cos`.
 *
 * Wind is recomputed from keyframes each tick (stateless) rather than drifted in
 * place, avoiding accumulated float drift.
 */
import type { Config } from "../config.ts";

/** Spatial unit vectors for the 6 AXIAL_DIRECTIONS, SAME order (pointy-top hexes). */
const SIN60 = 0.8660254037844386; // sqrt(3)/2 as a compile-time literal — not a runtime transcendental
export const DIR_UNIT: readonly { x: number; y: number }[] = [
  { x: 1, y: 0 }, // +q
  { x: 0.5, y: -SIN60 }, // +q -r
  { x: -0.5, y: -SIN60 }, // -r
  { x: -1, y: 0 }, // -q
  { x: -0.5, y: SIN60 }, // -q +r
  { x: 0.5, y: SIN60 }, // +r
] as const;

export interface Wind {
  /** Unit vector the wind blows TOWARD. */
  dirX: number;
  dirY: number;
  /** Normalized speed 0..1. */
  speed: number;
  forecastDirX: number;
  forecastDirY: number;
  forecastSpeed: number;
  /** Tick at which the forecast becomes the active wind (the "forecast clock"). */
  forecastEtaTick: number;
}

export interface WindKeyframe {
  atTick: number;
  /** Direction stored as a vector (need not be unit; it is normalized on use). */
  dirX: number;
  dirY: number;
  speed: number;
}

/**
 * Spread multiplier for fire travelling along `spreadDirIndex` (0..5, indexing
 * AXIAL_DIRECTIONS) under `wind`. Anchors: downwind→DOWNWIND_MULT,
 * crosswind→CROSSWIND_MULT, upwind→UPWIND_MULT, all scaled by speed (so calm
 * wind ⇒ ~1 in every direction).
 */
export function windFactor(spreadDirIndex: number, wind: Wind, cfg: Config): number {
  const d = DIR_UNIT[spreadDirIndex]!;
  const alignment = d.x * wind.dirX + d.y * wind.dirY; // cos(angle) ∈ [-1, 1]
  const cross = cfg.WIND_CROSSWIND_MULT;
  const target =
    alignment >= 0
      ? cross + (cfg.WIND_DOWNWIND_MULT - cross) * alignment // → DOWNWIND at +1
      : cross + (cross - cfg.WIND_UPWIND_MULT) * alignment; // → UPWIND at -1
  return 1 + (target - 1) * wind.speed; // neutral when speed = 0
}

function normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y);
  if (len === 0) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Resolves the active wind (and forecast) at `tick` from sorted keyframes.
 * Before the first / after the last keyframe, wind holds steady. Between two
 * keyframes, direction and speed interpolate linearly; the forecast points at
 * the NEXT keyframe and `forecastEtaTick` is when it lands.
 */
export function resolveWind(keyframes: readonly WindKeyframe[], tick: number): Wind {
  if (keyframes.length === 0) {
    return {
      dirX: 1, dirY: 0, speed: 0,
      forecastDirX: 1, forecastDirY: 0, forecastSpeed: 0,
      forecastEtaTick: tick,
    };
  }

  let prev: WindKeyframe | undefined;
  let next: WindKeyframe | undefined;
  for (const kf of keyframes) {
    if (kf.atTick <= tick) prev = kf;
    else { next = kf; break; }
  }

  const first = keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;

  if (!prev) {
    // Before the first keyframe — hold first; forecast is that first change.
    const n = normalize(first.dirX, first.dirY);
    return {
      dirX: n.x, dirY: n.y, speed: first.speed,
      forecastDirX: n.x, forecastDirY: n.y, forecastSpeed: first.speed,
      forecastEtaTick: first.atTick,
    };
  }

  if (!next) {
    // At or after the last keyframe — steady.
    const n = normalize(last.dirX, last.dirY);
    return {
      dirX: n.x, dirY: n.y, speed: last.speed,
      forecastDirX: n.x, forecastDirY: n.y, forecastSpeed: last.speed,
      forecastEtaTick: last.atTick,
    };
  }

  const span = next.atTick - prev.atTick;
  const t = span === 0 ? 0 : (tick - prev.atTick) / span;
  const cur = normalize(lerp(prev.dirX, next.dirX, t), lerp(prev.dirY, next.dirY, t));
  const fc = normalize(next.dirX, next.dirY);
  return {
    dirX: cur.x, dirY: cur.y, speed: lerp(prev.speed, next.speed, t),
    forecastDirX: fc.x, forecastDirY: fc.y, forecastSpeed: next.speed,
    forecastEtaTick: next.atTick,
  };
}
