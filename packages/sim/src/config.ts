/**
 * Central configuration — the ONE place to tune the game.
 *
 * Consolidates spec §14 with the resolutions in DECISIONS.md §6. Values marked
 * `tune-later` are deliberate placeholders to be dialed in during the Phase 1
 * spread-statistics pass and the Phase 6 tuning pass.
 *
 * All durations are expressed in REAL SECONDS here and converted to ticks via
 * `secondsToTicks` so designers reason in seconds while the sim runs on ticks.
 */

export type LossToggle = "both" | "assets_only";
export type OutbreakSource = "scripted" | "seeded";

export interface ResourceCost {
  /** Fraction of a full tank (0..1) consumed per action. */
  water: number;
  fuel: number;
}

export interface Config {
  // ── Grid ───────────────────────────────────────────────────────────────
  GRID_W: number;
  GRID_H: number;

  // ── Timing ─────────────────────────────────────────────────────────────
  TICKS_PER_SEC: number;
  ROUND_LENGTH_SEC: number;

  // ── Scoring (loss-only) ────────────────────────────────────────────────
  BASELINE_SCORE: number;
  ASSET_LOSS_PER_CELL: number;
  VEGETATION_LOSS_PER_CELL: number;
  LOSS_TOGGLE: LossToggle;

  // ── Fire spread CA ─────────────────────────────────────────────────────
  /** Base per-burning-neighbor per-tick catch probability. Tune so ~4–5 of 6 catch. */
  FIRE_P0: number;
  /** Per-terrain catch-ease multipliers (DECISIONS §6 — assets get explicit numbers). */
  FUEL_FACTOR_GRASSLAND: number;
  FUEL_FACTOR_FOREST: number;
  FUEL_FACTOR_HOUSE: number;
  FUEL_FACTOR_ANIMALS: number;

  // ── Fire timing & lifecycle (seconds) ──────────────────────────────────
  GRASS_BURN_DURATION_SEC: number;
  FOREST_BURN_DURATION_SEC: number;
  /** Burn duration for asset cells (house/animals). */
  ASSET_BURN_DURATION_SEC: number;
  /** IGNITING telegraph window before a cell becomes BURNING (DECISIONS §1.3). */
  IGNITING_DURATION_SEC: number;
  /** Post-extinguish immunity before a cell may reignite (DECISIONS §1.2). */
  REIGNITE_IMMUNITY_SEC: number;

  // ── Wind ───────────────────────────────────────────────────────────────
  /** Falloff anchors (DECISIONS §2.1). Implemented via wind-vector dot product, not Math.cos. */
  WIND_DOWNWIND_MULT: number;
  WIND_CROSSWIND_MULT: number;
  WIND_UPWIND_MULT: number;

  // ── Resources & sources ────────────────────────────────────────────────
  EXTINGUISH_DURATION_SEC: number;
  FIREBREAK_DURATION_SEC: number;
  REFILL_DURATION_SEC: number;
  SOURCE_CAPACITY: number;
  SOURCE_REGEN_RATE: number;
  HELI_COST: ResourceCost;
  TRUCK_COST: ResourceCost;
  DOZER_COST: ResourceCost;

  // ── Units & movement ───────────────────────────────────────────────────
  UNITS_PER_OPERATOR: number;
  /** Base movement speed in cells/sec for truck & dozer (tune-later). */
  BASE_MOVE_SPEED: number;
  HELI_SPEED_MULT: number;

  // ── Warnings & outbreaks ───────────────────────────────────────────────
  WARNING_LEAD_TIME_SEC: number;
  /** Developed fire lands within this radius of the warning center (DECISIONS §3.1). */
  IGNITION_SCATTER_RADIUS: number;
  OUTBREAK_SOURCE: OutbreakSource;

  // ── Map generation (tune-later; NFC-flavored, DECISIONS §6) ─────────────
  HOUSE_CLUSTER_MIN: number;
  HOUSE_CLUSTER_MAX: number;
  ANIMAL_CLUSTER_MIN: number;
  ANIMAL_CLUSTER_MAX: number;
  FOREST_CLUSTER_MIN: number;
  FOREST_CLUSTER_MAX: number;
  WATER_SOURCE_COUNT: number;
  FUEL_SOURCE_COUNT: number;

  // ── Optional mechanics (off by default; engine support only) ───────────
  ROAD_ENABLED: boolean;
  TERRAIN_ACCESS_RULES_ENABLED: boolean;
}

export const DEFAULT_CONFIG: Config = {
  GRID_W: 50,
  GRID_H: 50,

  TICKS_PER_SEC: 15,
  ROUND_LENGTH_SEC: 900, // 15 min formal; 300 for practice

  BASELINE_SCORE: 100_000,
  ASSET_LOSS_PER_CELL: 500, // tune with map asset counts
  VEGETATION_LOSS_PER_CELL: 20, // set 0 for "protect assets only"
  LOSS_TOGGLE: "both",

  FIRE_P0: 0.0118, // tuned from 0.08 starting point so a neighbor catches ~0.75 over
  // a grass burn duration → ~4.5 of 6 catch (spread-stats gate). Re-tuned in Phase 6
  // alongside burn durations.
  FUEL_FACTOR_GRASSLAND: 1.3, // tune-later — catches readily
  FUEL_FACTOR_FOREST: 0.7, // tune-later — slower per tick, longer burn
  FUEL_FACTOR_HOUSE: 1.0, // tune-later — explicit (no "vegetation they sit in")
  FUEL_FACTOR_ANIMALS: 1.0, // tune-later

  GRASS_BURN_DURATION_SEC: 6, // tune-later — shorter
  FOREST_BURN_DURATION_SEC: 14, // tune-later — longer
  ASSET_BURN_DURATION_SEC: 10, // tune-later
  IGNITING_DURATION_SEC: 1.5, // tune-later — shorter = higher skill ceiling
  REIGNITE_IMMUNITY_SEC: 2, // tune-later

  WIND_DOWNWIND_MULT: 3.5, // up to ~3–4 at full speed
  WIND_CROSSWIND_MULT: 1.0,
  WIND_UPWIND_MULT: 0.05, // small but nonzero

  EXTINGUISH_DURATION_SEC: 3,
  FIREBREAK_DURATION_SEC: 3,
  REFILL_DURATION_SEC: 1.5,
  SOURCE_CAPACITY: 1.0, // one full tank
  SOURCE_REGEN_RATE: 0, // off = faithful scarcity
  HELI_COST: { water: 0.5, fuel: 0.5 },
  TRUCK_COST: { water: 0.25, fuel: 0.25 },
  DOZER_COST: { water: 0.25, fuel: 0.25 },

  UNITS_PER_OPERATOR: 2,
  BASE_MOVE_SPEED: 3, // tune-later (cells/sec)
  HELI_SPEED_MULT: 2.5,

  WARNING_LEAD_TIME_SEC: 10,
  IGNITION_SCATTER_RADIUS: 2,
  OUTBREAK_SOURCE: "scripted",

  HOUSE_CLUSTER_MIN: 5,
  HOUSE_CLUSTER_MAX: 15,
  ANIMAL_CLUSTER_MIN: 5,
  ANIMAL_CLUSTER_MAX: 15,
  FOREST_CLUSTER_MIN: 10,
  FOREST_CLUSTER_MAX: 25,
  WATER_SOURCE_COUNT: 4,
  FUEL_SOURCE_COUNT: 4,

  ROAD_ENABLED: false,
  TERRAIN_ACCESS_RULES_ENABLED: false,
};

/** Deterministic seconds→ticks conversion (rounds to nearest whole tick, min 1). */
export function secondsToTicks(seconds: number, ticksPerSec: number): number {
  const ticks = Math.round(seconds * ticksPerSec);
  return ticks < 1 ? 1 : ticks;
}

/** Shallow-merge a partial override onto the defaults. */
export function makeConfig(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}
