/**
 * Lobby: many concurrent rooms keyed by short code, each with up to 3 players
 * claiming the HELI/TRUCK/DOZER roles. A GameSession holds the lobby until the
 * host starts, then owns the authoritative Room. Pure logic (no sockets) so it
 * is unit-tested directly; the ws layer is a thin adapter over this.
 *
 * Math.random is fine here — codes/tokens are I/O identity, NOT the deterministic
 * sim (which lives in @fire/sim and is replay-stable).
 */
import { buildGame, type Command, type GameOptions, type Role } from "@fire/sim";
import type { LobbyState, RoleSnapshot } from "@fire/protocol";
import { Room } from "./room.ts";

interface Player {
  token: string; // private identity (for reconnect)
  id: string; // public id
  name: string;
  role: Role | null;
  isHost: boolean;
  connected: boolean;
}

const BASE32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomBase32(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += BASE32[Math.floor(Math.random() * BASE32.length)];
  return s;
}
const defaultGenCode = (): string => `FIRE-${randomBase32(4)}`;
const defaultGenId = (): string => randomBase32(14);

export class GameSession {
  readonly code: string;
  private readonly options: GameOptions;
  private readonly genId: () => string;
  private players: Player[] = [];
  private room: Room | null = null;

  constructor(code: string, options: GameOptions, genId: () => string) {
    this.code = code;
    this.options = options;
    this.genId = genId;
  }

  get started(): boolean {
    return this.room !== null;
  }

  get ended(): boolean {
    return this.room?.ended ?? false;
  }

  private byToken(token: string): Player | undefined {
    return this.players.find((p) => p.token === token);
  }

  addPlayer(name: string, isHost: boolean): Player {
    const p: Player = {
      token: this.genId(),
      id: this.genId(),
      name: name || `Player ${this.players.length + 1}`,
      role: null,
      isHost,
      connected: true,
    };
    this.players.push(p);
    return p;
  }

  reconnect(token: string): Player | null {
    const p = this.byToken(token);
    if (!p) return null;
    p.connected = true;
    return p;
  }

  disconnect(token: string): void {
    const p = this.byToken(token);
    if (p) p.connected = false;
  }

  /** Claim a role (or release with null). Fails if another connected player holds it. */
  claimRole(token: string, role: Role | null): boolean {
    const p = this.byToken(token);
    if (!p || this.started) return false;
    if (role === null) {
      p.role = null;
      return true;
    }
    if (this.players.some((o) => o.token !== token && o.role === role && o.connected)) return false;
    p.role = role;
    return true;
  }

  /** Host-only: build the authoritative world and begin. */
  start(token: string): boolean {
    const p = this.byToken(token);
    if (!p || !p.isHost || this.started) return false;
    this.room = new Room(buildGame(this.options));
    return true;
  }

  submitCommand(token: string, command: Command): boolean {
    const p = this.byToken(token);
    if (!p || p.role === null || !this.room) return false;
    return this.room.submit(p.role, command);
  }

  tick(): void {
    this.room?.tick();
  }

  roleOf(token: string): Role | null {
    return this.byToken(token)?.role ?? null;
  }

  isHost(token: string): boolean {
    return this.byToken(token)?.isHost ?? false;
  }

  ticksPerSec(): number {
    return this.room?.worldState.config.TICKS_PER_SEC ?? 15;
  }

  snapshotFor(role: Role): RoleSnapshot | null {
    return this.room ? this.room.snapshotFor(role) : null;
  }

  unitIdsFor(role: Role): string[] {
    return this.room ? this.room.unitIdsFor(role) : [];
  }

  hasConnectedPlayers(): boolean {
    return this.players.some((p) => p.connected);
  }

  lobbyState(): LobbyState {
    return {
      code: this.code,
      started: this.started,
      players: this.players.map((p) => ({ id: p.id, name: p.name, role: p.role, isHost: p.isHost, connected: p.connected })),
    };
  }
}

export class RoomManager {
  private sessions = new Map<string, GameSession>();
  private readonly genCode: () => string;
  private readonly genId: () => string;

  constructor(gen: { genCode?: () => string; genId?: () => string } = {}) {
    this.genCode = gen.genCode ?? defaultGenCode;
    this.genId = gen.genId ?? defaultGenId;
  }

  createRoom(options: GameOptions): GameSession {
    let code = this.genCode();
    while (this.sessions.has(code)) code = this.genCode();
    const session = new GameSession(code, options, this.genId);
    this.sessions.set(code, session);
    return session;
  }

  get(code: string): GameSession | undefined {
    return this.sessions.get(code.toUpperCase());
  }

  remove(code: string): void {
    this.sessions.delete(code);
  }

  get size(): number {
    return this.sessions.size;
  }
}
