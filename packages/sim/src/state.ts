/**
 * Authoritative world state + (de)serialization.
 *
 * State is STRUCT-OF-ARRAYS (typed arrays) rather than an array of Cell objects:
 * compact, fast for the CA, and trivially serializable for golden hashing and
 * snapshot round-trips. Static geometry (the neighbor table) is NOT stored here —
 * it is memoized from (width, height) so it never bloats state or its hash.
 */
import { type Config, makeConfig, secondsToTicks } from "./config.ts";
import { CanonicalWriter, hashCanonical } from "./hash/canonical.ts";
import type { Axial } from "./hex/hex.ts";
import { burnDurationTicks, Fire, isFlammable, Terrain } from "./fire/fire.ts";
import { resolveWind, type Wind, type WindKeyframe } from "./wind/wind.ts";
import { deriveSeed, RNG_STREAMS } from "./rng/rng.ts";
import { cloneUnit, type Unit } from "./units/units.ts";

export type RunStatus = "RUNNING" | "ENDED";

export interface WorldState {
  tick: number;
  width: number;
  height: number;

  // Static terrain (never mutated by tick).
  terrain: Uint8Array;

  // Mutable fire fields.
  fire: Uint8Array;
  burnTimer: Int32Array;
  immune: Int32Array;
  /** Set by units (Phase 2): pauses burn timer + excludes from spreading. */
  suppressed: Uint8Array;
  /** 0..1 for source cells (Phase 2 refilling). */
  sourceLevel: Float64Array;

  windKeyframes: WindKeyframe[];
  wind: Wind;

  /** Fixed creation order; commands are applied in canonical unitId order. */
  units: Unit[];

  score: number;
  simRngState: number;

  endTick: number;
  status: RunStatus;

  config: Config;
}

/** Player intentions. Unit commands are applied starting in Phase 2. */
export type Command =
  | { type: "SET_WAYPOINT"; unitId: string; target: Axial }
  | { type: "CANCEL_MOVE"; unitId: string }
  | { type: "ACT"; unitId: string };

export interface InitOptions {
  seed: number;
  config?: Partial<Config>;
  /** Length width*height; defaults to all GRASSLAND. */
  terrain?: Uint8Array;
  windKeyframes?: WindKeyframe[];
  units?: Unit[];
}

export function createInitialState(opts: InitOptions): WorldState {
  const config = makeConfig(opts.config);
  const { GRID_W: width, GRID_H: height } = config;
  const cellCount = width * height;

  const terrain = opts.terrain ?? new Uint8Array(cellCount).fill(Terrain.GRASSLAND);
  if (terrain.length !== cellCount) {
    throw new Error(`terrain length ${terrain.length} != ${cellCount} (${width}x${height})`);
  }

  const sourceLevel = new Float64Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    if (terrain[i] === Terrain.WATER_SOURCE || terrain[i] === Terrain.FUEL_SOURCE) {
      sourceLevel[i] = config.SOURCE_CAPACITY;
    }
  }

  const windKeyframes = opts.windKeyframes ?? [];

  return {
    tick: 0,
    width,
    height,
    terrain,
    fire: new Uint8Array(cellCount), // all UNBURNT (0)
    burnTimer: new Int32Array(cellCount),
    immune: new Int32Array(cellCount),
    suppressed: new Uint8Array(cellCount),
    sourceLevel,
    windKeyframes,
    wind: resolveWind(windKeyframes, 0),
    units: opts.units ?? [],
    score: config.BASELINE_SCORE,
    simRngState: deriveSeed(opts.seed, RNG_STREAMS.SIM),
    endTick: secondsToTicks(config.ROUND_LENGTH_SEC, config.TICKS_PER_SEC),
    status: "RUNNING",
    config,
  };
}

/** Immediately sets a flammable cell BURNING (scripted IGNITE / test helper). */
export function igniteCell(s: WorldState, index: number): boolean {
  const t = s.terrain[index];
  if (t === undefined || !isFlammable(t)) return false;
  s.fire[index] = Fire.BURNING;
  s.burnTimer[index] = burnDurationTicks(t, s.config);
  return true;
}

/** Deep copy (fresh typed arrays) — stands in for a snapshot round-trip. */
export function cloneWorld(s: WorldState): WorldState {
  return {
    ...s,
    terrain: s.terrain.slice(),
    fire: s.fire.slice(),
    burnTimer: s.burnTimer.slice(),
    immune: s.immune.slice(),
    suppressed: s.suppressed.slice(),
    sourceLevel: s.sourceLevel.slice(),
    windKeyframes: s.windKeyframes.map((k) => ({ ...k })),
    wind: { ...s.wind },
    units: s.units.map(cloneUnit),
    config: { ...s.config },
  };
}

const STATUS_CODE: Record<RunStatus, number> = { RUNNING: 0, ENDED: 1 };
const ROLE_CODE: Record<Unit["role"], number> = { HELI: 0, TRUCK: 1, DOZER: 2 };
const ACTION_CODE = { EXTINGUISH: 0, FIREBREAK: 1, REFILL: 2 } as const;

function writeUnit(w: CanonicalWriter, u: Unit): void {
  w.str(u.id).u32(ROLE_CODE[u.role]).str(u.operatorId);
  w.i32(u.cell).f64(u.stepProgress).f64(u.water).f64(u.fuel);
  w.u32(u.path.length);
  for (let i = 0; i < u.path.length; i++) w.i32(u.path[i]!);
  if (u.action === null) {
    w.bool(false);
  } else {
    w.bool(true)
      .u32(ACTION_CODE[u.action.type])
      .i32(u.action.target)
      .i32(u.action.ticksRemaining)
      .i32(u.action.totalTicks);
  }
}

/** Appends the full dynamic+static state to a canonical byte stream (fixed order). */
export function writeWorld(w: CanonicalWriter, s: WorldState): void {
  w.u32(s.tick).u32(s.width).u32(s.height);
  w.u32(s.terrain.length);
  for (let i = 0; i < s.terrain.length; i++) w.u32(s.terrain[i]!);
  for (let i = 0; i < s.fire.length; i++) w.u32(s.fire[i]!);
  for (let i = 0; i < s.burnTimer.length; i++) w.i32(s.burnTimer[i]!);
  for (let i = 0; i < s.immune.length; i++) w.i32(s.immune[i]!);
  for (let i = 0; i < s.suppressed.length; i++) w.u32(s.suppressed[i]!);
  for (let i = 0; i < s.sourceLevel.length; i++) w.f64(s.sourceLevel[i]!);
  w.f64(s.wind.dirX).f64(s.wind.dirY).f64(s.wind.speed);
  w.f64(s.wind.forecastDirX).f64(s.wind.forecastDirY).f64(s.wind.forecastSpeed).i32(s.wind.forecastEtaTick);
  w.u32(s.units.length);
  for (let i = 0; i < s.units.length; i++) writeUnit(w, s.units[i]!);
  w.f64(s.score).i32(s.simRngState).u32(s.endTick).u32(STATUS_CODE[s.status]);
}

/** Canonical 64-bit hash of the world — the unit of golden determinism tests. */
export function hashWorld(s: WorldState): string {
  return hashCanonical((w) => writeWorld(w, s));
}
