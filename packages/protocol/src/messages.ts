/**
 * Wire protocol for multiplayer. Snapshots cross the wire as JSON, so typed
 * arrays are carried as number[] (WireSnapshot) and rebuilt on the client.
 * Filtering is applied (server-side) BEFORE encoding, so a forbidden field is
 * `null` in the wire bytes — it physically never leaves the server.
 *
 * (Per-tick full snapshots are JSON for debuggability; delta-encoding is a Phase 6
 * optimization.)
 */
import type { Command, GameOptions, Role } from "@fire/sim";
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

// ── Lobby ───────────────────────────────────────────────────────────────────
/** Public per-player info broadcast to a room (no private token). */
export interface PlayerInfo {
  id: string;
  name: string;
  role: Role | null;
  isHost: boolean;
  connected: boolean;
}

export interface LobbyState {
  code: string;
  started: boolean;
  players: PlayerInfo[];
}

// ── Messages ──────────────────────────────────────────────────────────────
export type ClientMsg =
  | { type: "CREATE_ROOM"; name?: string; options?: GameOptions }
  | { type: "JOIN_ROOM"; code: string; name?: string; token?: string }
  | { type: "CLAIM_ROLE"; role: Role | null }
  | { type: "START" }
  | { type: "COMMAND"; command: Command }
  | { type: "LEAVE" };

export type ServerMsg =
  | { type: "JOINED"; code: string; token: string; isHost: boolean }
  | { type: "ROOM_STATE"; lobby: LobbyState }
  | { type: "WELCOME"; role: Role | null; unitIds: string[]; ticksPerSec: number }
  | { type: "SNAPSHOT"; snap: WireSnapshot }
  | { type: "ERROR"; message: string };

const ROLES_SET = new Set(["HELI", "TRUCK", "DOZER"]);

export function encodeClientMsg(m: ClientMsg): string {
  return JSON.stringify(m);
}

export function decodeClientMsg(raw: string): ClientMsg | null {
  try {
    const m = JSON.parse(raw) as ClientMsg;
    switch (m.type) {
      case "CREATE_ROOM":
        return m;
      case "JOIN_ROOM":
        return typeof m.code === "string" && m.code.length > 0 ? m : null;
      case "CLAIM_ROLE":
        return m.role === null || ROLES_SET.has(m.role) ? m : null;
      case "START":
      case "LEAVE":
        return m;
      case "COMMAND":
        return m.command && typeof m.command.type === "string" && typeof m.command.unitId === "string" ? m : null;
      default:
        return null;
    }
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
