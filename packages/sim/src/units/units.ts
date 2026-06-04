/**
 * Units (appliances). 3 roles × UNITS_PER_OPERATOR = 6 by default.
 *
 * POSITION MODEL: rather than a 2D float position, a unit occupies a discrete
 * `cell` and carries `stepProgress` (0..1) toward the next cell on its `path`.
 * This is fully deterministic (progress is simple addition, no sqrt/normalize)
 * and makes "which cell does a unit occupy" trivial for the no-stacking rule.
 * The client derives a smooth (x,y) for rendering by interpolating cell centers.
 */
export type Role = "HELI" | "TRUCK" | "DOZER";
export const ROLES: readonly Role[] = ["HELI", "TRUCK", "DOZER"] as const;

export type ActionType = "EXTINGUISH" | "FIREBREAK" | "REFILL";

export interface UnitAction {
  type: ActionType;
  /** Cell index the action operates on (the unit's own cell). */
  target: number;
  ticksRemaining: number;
  totalTicks: number;
}

export interface Unit {
  id: string;
  role: Role;
  operatorId: string;
  /** Cell index currently occupied. */
  cell: number;
  /** Remaining cells to traverse, next first (excludes `cell`). */
  path: number[];
  /** 0..1 progress from `cell` toward `path[0]`. */
  stepProgress: number;
  water: number; // 0..1
  fuel: number; // 0..1
  /** Non-cancellable in-progress action, or null. */
  action: UnitAction | null;
}

export interface MakeUnitOptions {
  id: string;
  role: Role;
  operatorId: string;
  cell: number;
  water?: number;
  fuel?: number;
}

export function makeUnit(o: MakeUnitOptions): Unit {
  return {
    id: o.id,
    role: o.role,
    operatorId: o.operatorId,
    cell: o.cell,
    path: [],
    stepProgress: 0,
    water: o.water ?? 1,
    fuel: o.fuel ?? 1,
    action: null,
  };
}

export function cloneUnit(u: Unit): Unit {
  return {
    ...u,
    path: u.path.slice(),
    action: u.action ? { ...u.action } : null,
  };
}

/** True if the unit is busy (mid-action) — actions are non-cancellable. */
export function isBusy(u: Unit): boolean {
  return u.action !== null;
}

/** True if the unit is currently moving (has a remaining path). */
export function isMoving(u: Unit): boolean {
  return u.path.length > 0;
}
