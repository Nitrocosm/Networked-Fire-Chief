/**
 * Wire protocol for multiplayer. Snapshots cross the wire as JSON, so typed
 * arrays are carried as number[] (WireSnapshot) and rebuilt on the client.
 * Filtering is applied (server-side) BEFORE encoding, so a forbidden field is
 * `null` in the wire bytes — it physically never leaves the server.
 *
 * (Per-tick full snapshots are JSON for debuggability; delta-encoding is a Phase 6
 * optimization.)
 */
import type { Command, Role } from "@fire/sim";
import type { ClientView, UnitView, WarningView, WindView } from "./snapshot.ts";

export interface WireSnapshot {
  tick: number;
  endTick: number;
  ticksPerSec: number;
  width: number;
  height: number;
  score: number;
  status: "RUNNING" | "ENDED";
  terrain: number[];
  fire: number[];
  sourceLevel: number[];
  units: UnitView[];
  wind: WindView | null;
  warnings: WarningView[] | null;
}

export function snapshotToWire(s: ClientView): WireSnapshot {
  return {
    tick: s.tick,
    endTick: s.endTick,
    ticksPerSec: s.ticksPerSec,
    width: s.width,
    height: s.height,
    score: s.score,
    status: s.status,
    terrain: Array.from(s.terrain),
    fire: Array.from(s.fire),
    sourceLevel: Array.from(s.sourceLevel),
    units: s.units,
    wind: s.wind,
    warnings: s.warnings ? [...s.warnings] : null,
  };
}

export function wireToClientView(w: WireSnapshot): ClientView {
  return {
    tick: w.tick,
    endTick: w.endTick,
    ticksPerSec: w.ticksPerSec,
    width: w.width,
    height: w.height,
    score: w.score,
    status: w.status,
    terrain: Uint8Array.from(w.terrain),
    fire: Uint8Array.from(w.fire),
    sourceLevel: Float64Array.from(w.sourceLevel),
    units: w.units,
    wind: w.wind,
    warnings: w.warnings,
  };
}

// ── Messages ──────────────────────────────────────────────────────────────
export type ClientMsg =
  | { type: "JOIN"; role: Role }
  | { type: "COMMAND"; command: Command };

export type ServerMsg =
  | { type: "WELCOME"; role: Role; unitIds: string[]; ticksPerSec: number }
  | { type: "SNAPSHOT"; snap: WireSnapshot }
  | { type: "ERROR"; message: string };

export function encodeClientMsg(m: ClientMsg): string {
  return JSON.stringify(m);
}

export function decodeClientMsg(raw: string): ClientMsg | null {
  try {
    const m = JSON.parse(raw) as ClientMsg;
    if (m.type === "JOIN" && (m.role === "HELI" || m.role === "TRUCK" || m.role === "DOZER")) return m;
    if (m.type === "COMMAND" && m.command && typeof m.command.type === "string") return m;
    return null;
  } catch {
    return null;
  }
}

export function encodeServerMsg(m: ServerMsg): string {
  return JSON.stringify(m);
}

export function decodeServerMsg(raw: string): ServerMsg | null {
  try {
    return JSON.parse(raw) as ServerMsg;
  } catch {
    return null;
  }
}
