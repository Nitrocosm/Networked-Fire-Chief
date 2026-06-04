/**
 * Fire model — probabilistic cellular automaton.
 *
 * Lifecycle: UNBURNT → IGNITING (telegraph, non-spreading) → BURNING → BURNT_OUT.
 * Score is deducted at the transition into BURNT_OUT. BURNT_OUT is terminal.
 *
 * DETERMINISM: the CA is DOUBLE-BUFFERED — it reads start-of-tick state and
 * writes a fresh buffer, so spread does not cascade within a tick. Cells are
 * visited in FLAT INDEX ORDER and exactly one RNG draw is made per eligible
 * (UNBURNT, flammable, not immune, ≥1 unsuppressed BURNING neighbor) cell.
 */
import type { Config } from "../config.ts";
import { secondsToTicks } from "../config.ts";
import type { NeighborDir } from "../hex/hex.ts";
import type { Rng } from "../rng/rng.ts";
import { windFactor, type Wind } from "../wind/wind.ts";

// Numeric enums keep state in typed arrays (compact, trivially serializable).
export const Terrain = {
  GRASSLAND: 0,
  FOREST: 1,
  WATER_SOURCE: 2,
  FUEL_SOURCE: 3,
  HOUSE: 4,
  ANIMALS: 5,
  FIREBREAK: 6,
  ROAD: 7,
  BARE: 8,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export const Fire = {
  UNBURNT: 0,
  IGNITING: 1,
  BURNING: 2,
  BURNT_OUT: 3,
} as const;
export type FireId = (typeof Fire)[keyof typeof Fire];

export function isFlammable(t: number): boolean {
  return t === Terrain.GRASSLAND || t === Terrain.FOREST || t === Terrain.HOUSE || t === Terrain.ANIMALS;
}

export function isAsset(t: number): boolean {
  return t === Terrain.HOUSE || t === Terrain.ANIMALS;
}

export function fuelFactor(t: number, cfg: Config): number {
  switch (t) {
    case Terrain.GRASSLAND: return cfg.FUEL_FACTOR_GRASSLAND;
    case Terrain.FOREST: return cfg.FUEL_FACTOR_FOREST;
    case Terrain.HOUSE: return cfg.FUEL_FACTOR_HOUSE;
    case Terrain.ANIMALS: return cfg.FUEL_FACTOR_ANIMALS;
    default: return 0;
  }
}

export function burnDurationTicks(t: number, cfg: Config): number {
  switch (t) {
    case Terrain.GRASSLAND: return secondsToTicks(cfg.GRASS_BURN_DURATION_SEC, cfg.TICKS_PER_SEC);
    case Terrain.FOREST: return secondsToTicks(cfg.FOREST_BURN_DURATION_SEC, cfg.TICKS_PER_SEC);
    case Terrain.HOUSE:
    case Terrain.ANIMALS: return secondsToTicks(cfg.ASSET_BURN_DURATION_SEC, cfg.TICKS_PER_SEC);
    default: return 1;
  }
}

/** Score lost when a cell of this terrain burns out (respects LOSS_TOGGLE). */
export function lossValue(t: number, cfg: Config): number {
  if (isAsset(t)) return cfg.ASSET_LOSS_PER_CELL;
  if (t === Terrain.GRASSLAND || t === Terrain.FOREST) {
    return cfg.LOSS_TOGGLE === "assets_only" ? 0 : cfg.VEGETATION_LOSS_PER_CELL;
  }
  return 0;
}

export interface FireBuffers {
  fire: Uint8Array;
  burnTimer: Int32Array;
  /** Reignition immunity ticks remaining (post-extinguish, DECISIONS §1.2). */
  immune: Int32Array;
}

/**
 * Advances fire one tick. Reads `prev`, fully writes `next` (every cell). Returns
 * the score lost to burnouts this tick. `suppressed[i]` (set by units in Phase 2)
 * pauses a BURNING cell's timer and excludes it from spreading.
 */
export function stepFire(
  terrain: Uint8Array,
  prev: FireBuffers,
  suppressed: Uint8Array,
  neighbors: readonly (readonly NeighborDir[])[],
  wind: Wind,
  cfg: Config,
  rng: Rng,
  next: FireBuffers,
): number {
  const n = terrain.length;
  const p0 = cfg.FIRE_P0;
  const igniteTicks = secondsToTicks(cfg.IGNITING_DURATION_SEC, cfg.TICKS_PER_SEC);
  let scoreLost = 0;

  for (let i = 0; i < n; i++) {
    const t = terrain[i]!;
    const f = prev.fire[i]!;
    const bt = prev.burnTimer[i]!;
    const im = prev.immune[i]!;

    // Defaults: carry over, decrement immunity.
    let nf = f;
    let nbt = bt;
    const nim = im > 0 ? im - 1 : 0;

    if (f === Fire.BURNING) {
      if (suppressed[i] === 1) {
        nbt = bt; // suppression PAUSES the burn timer (DECISIONS §1.1)
      } else {
        nbt = bt - 1;
        if (nbt <= 0) {
          nf = Fire.BURNT_OUT;
          nbt = 0;
          scoreLost += lossValue(t, cfg);
        }
      }
    } else if (f === Fire.IGNITING) {
      // Telegraph countdown; does NOT spread. (Suppressible later via the same flag.)
      if (suppressed[i] === 1) {
        nbt = bt;
      } else {
        nbt = bt - 1;
        if (nbt <= 0) {
          nf = Fire.BURNING;
          nbt = burnDurationTicks(t, cfg);
        }
      }
    } else if (f === Fire.UNBURNT && im === 0 && isFlammable(t)) {
      const fuel = fuelFactor(t, cfg);
      let pNone = 1; // Π (1 − p_i)
      let hasBurningNeighbor = false;
      const list = neighbors[i]!;
      for (let k = 0; k < list.length; k++) {
        const nb = list[k]!;
        if (prev.fire[nb.idx] === Fire.BURNING && suppressed[nb.idx] === 0) {
          hasBurningNeighbor = true;
          let p = p0 * fuel * windFactor(nb.spreadDir, wind, cfg);
          if (p < 0) p = 0;
          else if (p > 1) p = 1;
          pNone *= 1 - p;
        }
      }
      if (hasBurningNeighbor) {
        // Exactly one RNG draw per eligible cell, in flat order.
        const pIgnite = 1 - pNone;
        if (rng.nextFloat() < pIgnite) {
          nf = Fire.IGNITING;
          nbt = igniteTicks;
        }
      }
    }
    // BURNT_OUT and non-flammable cells just carry over.

    next.fire[i] = nf;
    next.burnTimer[i] = nbt;
    next.immune[i] = nim;
  }

  return scoreLost;
}
