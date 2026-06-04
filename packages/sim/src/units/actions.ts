/**
 * Unit actions + resources + refilling.
 *
 * Actions operate on the cell the unit OCCUPIES (extinguish a burning cell you
 * sit on; dozer firebreaks grass/forest under it). Cost is charged UP FRONT and
 * the action is NON-CANCELLABLE (DECISIONS §1.6). Refilling is AUTOMATIC on a
 * source while stationary, depletes the source proportionally (§1.5).
 *
 * Within a tick the split is deliberate:
 *  - startActions/stepActions run BEFORE fire spread: they build the `suppressed`
 *    array (a cell mid-extinguish doesn't spread and its burn timer pauses).
 *  - applyCompletionEffects runs AFTER fire spread, writing the post-spread
 *    buffers (a finished extinguish forces the cell UNBURNT + immune).
 */
import type { Config, ResourceCost } from "../config.ts";
import { secondsToTicks } from "../config.ts";
import { Fire, type FireBuffers, Terrain } from "../fire/fire.ts";
import { isBusy, type ActionType, type Command, type Role, type Unit } from "./units.ts";

export interface Completion {
  type: ActionType;
  target: number;
}

function actionCost(role: Role, cfg: Config): ResourceCost {
  if (role === "HELI") return cfg.HELI_COST;
  if (role === "TRUCK") return cfg.TRUCK_COST;
  return cfg.DOZER_COST;
}

function canAfford(u: Unit, cost: ResourceCost): boolean {
  return u.water >= cost.water && u.fuel >= cost.fuel;
}

/**
 * Starts actions for ACT commands. A stationary, idle unit acts based on role +
 * the cell it occupies; if unaffordable or the cell is not actionable, nothing
 * happens and NO resource is spent.
 */
export function startActions(
  units: Unit[],
  terrain: Uint8Array,
  fire: Uint8Array,
  commands: readonly Command[],
  cfg: Config,
): void {
  const byId = new Map<string, Unit>();
  for (const u of units) byId.set(u.id, u);

  const extinguishTicks = secondsToTicks(cfg.EXTINGUISH_DURATION_SEC, cfg.TICKS_PER_SEC);
  const firebreakTicks = secondsToTicks(cfg.FIREBREAK_DURATION_SEC, cfg.TICKS_PER_SEC);

  for (const cmd of commands) {
    if (cmd.type !== "ACT") continue;
    const u = byId.get(cmd.unitId);
    if (!u || isBusy(u) || u.path.length > 0) continue;

    const cell = u.cell;
    const t = terrain[cell]!;
    const f = fire[cell]!;

    let type: ActionType | null = null;
    if (u.role === "DOZER") {
      if ((t === Terrain.GRASSLAND || t === Terrain.FOREST) && f === Fire.UNBURNT) type = "FIREBREAK";
    } else if (f === Fire.BURNING || f === Fire.IGNITING) {
      type = "EXTINGUISH";
    }
    if (type === null) continue;

    const cost = actionCost(u.role, cfg);
    if (!canAfford(u, cost)) continue;

    u.water -= cost.water; // up-front, non-refundable
    u.fuel -= cost.fuel;
    const dur = type === "EXTINGUISH" ? extinguishTicks : firebreakTicks;
    u.action = { type, target: cell, ticksRemaining: dur, totalTicks: dur };
    u.path = [];
    u.stepProgress = 0;
  }
}

/**
 * Advances in-progress actions one tick and returns the freshly-built suppression
 * mask plus the actions that completed this tick. Suppression is DERIVED from
 * active extinguishes each tick (never stale).
 */
export function stepActions(units: Unit[], cellCount: number): { suppressed: Uint8Array; completions: Completion[] } {
  const suppressed = new Uint8Array(cellCount);
  const completions: Completion[] = [];

  for (const u of units) {
    if (!u.action) continue;
    u.action.ticksRemaining -= 1;
    if (u.action.type === "EXTINGUISH") suppressed[u.action.target] = 1;
    if (u.action.ticksRemaining <= 0) {
      completions.push({ type: u.action.type, target: u.action.target });
      u.action = null;
    }
  }
  return { suppressed, completions };
}

/** Applies completed-action effects to the post-spread buffers / terrain. */
export function applyCompletionEffects(
  completions: readonly Completion[],
  next: FireBuffers,
  terrain: Uint8Array,
  cfg: Config,
): void {
  const reigniteTicks = secondsToTicks(cfg.REIGNITE_IMMUNITY_SEC, cfg.TICKS_PER_SEC);
  for (const c of completions) {
    if (c.type === "EXTINGUISH") {
      next.fire[c.target] = Fire.UNBURNT;
      next.burnTimer[c.target] = 0;
      next.immune[c.target] = reigniteTicks; // brief hold against instant reignition
    } else if (c.type === "FIREBREAK") {
      terrain[c.target] = Terrain.FIREBREAK;
      next.fire[c.target] = Fire.UNBURNT;
    }
  }
}

/** Automatic refilling for stationary, idle units sitting on a source. */
export function resolveRefill(units: Unit[], terrain: Uint8Array, sourceLevel: Float64Array, cfg: Config): void {
  const refillTicks = secondsToTicks(cfg.REFILL_DURATION_SEC, cfg.TICKS_PER_SEC);
  const ratePerTick = 1 / refillTicks;

  for (const u of units) {
    if (u.action || u.path.length > 0) continue;
    const t = terrain[u.cell]!;
    const level = sourceLevel[u.cell]!;
    if (level <= 0) continue;

    if (t === Terrain.WATER_SOURCE && u.water < 1) {
      const amt = Math.min(ratePerTick, 1 - u.water, level);
      u.water += amt;
      sourceLevel[u.cell] = level - amt;
    } else if (t === Terrain.FUEL_SOURCE && u.fuel < 1) {
      const amt = Math.min(ratePerTick, 1 - u.fuel, level);
      u.fuel += amt;
      sourceLevel[u.cell] = level - amt;
    }
  }
}

/** Optional slow source regeneration (SOURCE_REGEN_RATE, default 0 = off). */
export function regenSources(terrain: Uint8Array, sourceLevel: Float64Array, cfg: Config): void {
  if (cfg.SOURCE_REGEN_RATE <= 0) return;
  for (let i = 0; i < terrain.length; i++) {
    const t = terrain[i]!;
    if (t === Terrain.WATER_SOURCE || t === Terrain.FUEL_SOURCE) {
      const lvl = sourceLevel[i]! + cfg.SOURCE_REGEN_RATE;
      sourceLevel[i] = lvl > cfg.SOURCE_CAPACITY ? cfg.SOURCE_CAPACITY : lvl;
    }
  }
}
