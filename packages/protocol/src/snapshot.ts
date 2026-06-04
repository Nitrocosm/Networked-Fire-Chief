/**
 * Snapshot projection + ROLE FILTERING — the information-asymmetry boundary.
 *
 * `toSnapshot` projects the authoritative WorldState into a render-friendly
 * Snapshot. `filterForRole` strips the fields a role may not see (HELI never
 * receives warnings; DOZER never receives wind) and returns a branded
 * RoleSnapshot. Filtering happens in the DATA here — not hidden in the UI — so a
 * client literally cannot read a field it isn't entitled to. Shared verbatim by
 * the single-player local transport (Challenge mode) and the ws server.
 */
import type { Role, Unit, WorldState } from "@fire/sim";
import { ROLE_VISIBILITY } from "./roles.ts";

export interface WindView {
  dirX: number;
  dirY: number;
  speed: number;
  forecastDirX: number;
  forecastDirY: number;
  forecastSpeed: number;
  /** The "forecast clock": tick at which the forecast wind becomes active. */
  forecastEtaTick: number;
}

export interface WarningView {
  id: string;
  center: number;
  igniteAtTick: number;
  radius: number;
}

export interface UnitActionView {
  type: "EXTINGUISH" | "FIREBREAK" | "REFILL";
  target: number;
  /** 0..1 completion. */
  progress: number;
}

export interface UnitView {
  id: string;
  role: Role;
  operatorId: string;
  cell: number;
  stepProgress: number;
  /** Next cell on the path (for render interpolation), or null if stopped. */
  nextCell: number | null;
  /** Final waypoint (drawn as a silhouette), or null. */
  destination: number | null;
  water: number;
  fuel: number;
  action: UnitActionView | null;
}

interface SnapshotBase {
  tick: number;
  endTick: number;
  ticksPerSec: number;
  width: number;
  height: number;
  score: number;
  status: "RUNNING" | "ENDED";
  terrain: Uint8Array;
  fire: Uint8Array;
  sourceLevel: Float64Array;
  units: UnitView[];
}

/** Full authoritative projection (server-side / Casual single-player). */
export interface Snapshot extends SnapshotBase {
  wind: WindView;
  warnings: WarningView[];
}

/** What renderer + HUD consume — wind/warnings may be filtered to null. */
export interface ClientView extends SnapshotBase {
  wind: WindView | null;
  warnings: readonly WarningView[] | null;
}

declare const filteredBrand: unique symbol;
/** A role-filtered view. Only `filterForRole` can mint one (brand) — so a server
 *  `send` typed to RoleSnapshot cannot be handed a raw, unfiltered Snapshot. */
export type RoleSnapshot = ClientView & { readonly [filteredBrand]: true };

function projectUnit(u: Unit): UnitView {
  return {
    id: u.id,
    role: u.role,
    operatorId: u.operatorId,
    cell: u.cell,
    stepProgress: u.stepProgress,
    nextCell: u.path.length > 0 ? u.path[0]! : null,
    destination: u.path.length > 0 ? u.path[u.path.length - 1]! : null,
    water: u.water,
    fuel: u.fuel,
    action: u.action
      ? {
          type: u.action.type,
          target: u.action.target,
          progress: u.action.totalTicks > 0 ? 1 - u.action.ticksRemaining / u.action.totalTicks : 1,
        }
      : null,
  };
}

export function toSnapshot(state: WorldState): Snapshot {
  return {
    tick: state.tick,
    endTick: state.endTick,
    ticksPerSec: state.config.TICKS_PER_SEC,
    width: state.width,
    height: state.height,
    score: state.score,
    status: state.status,
    terrain: state.terrain,
    fire: state.fire,
    sourceLevel: state.sourceLevel,
    units: state.units.map(projectUnit),
    wind: { ...state.wind },
    warnings: state.warnings.map((w) => ({ ...w })),
  };
}

/** Strips fields the role may not see and brands the result as filtered. */
export function filterForRole(snap: Snapshot, role: Role): RoleSnapshot {
  const vis = ROLE_VISIBILITY[role];
  const view: ClientView = {
    ...snap,
    wind: vis.wind ? snap.wind : null,
    warnings: vis.warnings ? snap.warnings : null,
  };
  return view as RoleSnapshot;
}
