/**
 * Unit movement + command application.
 *
 * Movement is deterministic: units are advanced in canonical unitId order, and
 * an occupancy set is updated as each moves, so two units never end a tick in the
 * same cell (no-stacking, spec §8). A blocked unit simply waits at the boundary
 * (stepProgress capped at 1) and retries next tick.
 */
import type { Config } from "../config.ts";
import { findPath } from "./pathfinding.ts";
import { isBusy, type Command, type Role, type Unit } from "./units.ts";

/** Cells traversed per tick for a role (heli is HELI_SPEED_MULT× the base). */
export function cellsPerTick(role: Role, cfg: Config): number {
  const base = cfg.BASE_MOVE_SPEED * (role === "HELI" ? cfg.HELI_SPEED_MULT : 1);
  return base / cfg.TICKS_PER_SEC;
}

function byIdAsc(a: Unit, b: Unit): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Applies movement commands (SET_WAYPOINT, CANCEL_MOVE) to units in place.
 * ACT is handled by the actions module. Commands should be pre-sorted with
 * `sortCommands`. Busy (mid-action) units ignore movement commands.
 */
export function applyMovementCommands(
  units: Unit[],
  width: number,
  height: number,
  commands: readonly Command[],
): void {
  const byId = new Map<string, Unit>();
  for (const u of units) byId.set(u.id, u);

  for (const cmd of commands) {
    const u = byId.get(cmd.unitId);
    if (!u || isBusy(u)) continue;

    if (cmd.type === "CANCEL_MOVE") {
      u.path = [];
      u.stepProgress = 0;
    } else if (cmd.type === "SET_WAYPOINT") {
      const occupied = new Set<number>();
      for (const other of units) if (other.id !== u.id) occupied.add(other.cell);
      const path = findPath(width, height, u.cell, cmd.target, (c) => occupied.has(c));
      if (path) {
        u.path = path;
        u.stepProgress = 0;
      }
    }
  }
}

/** Advances every unit one tick along its path, enforcing no-stacking. */
export function resolveMovement(units: Unit[], cfg: Config): void {
  const occupied = new Set<number>();
  for (const u of units) occupied.add(u.cell);

  for (const u of [...units].sort(byIdAsc)) {
    if (isBusy(u) || u.path.length === 0) continue;

    u.stepProgress += cellsPerTick(u.role, cfg);
    while (u.stepProgress >= 1 && u.path.length > 0) {
      const nextCell = u.path[0]!;
      if (occupied.has(nextCell)) break; // blocked by another unit — wait
      occupied.delete(u.cell);
      u.cell = nextCell;
      occupied.add(nextCell);
      u.path.shift();
      u.stepProgress -= 1;
    }

    if (u.path.length === 0) u.stepProgress = 0;
    else if (u.stepProgress > 1) u.stepProgress = 1; // cap while waiting
  }
}
