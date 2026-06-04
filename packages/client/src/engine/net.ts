/**
 * Multiplayer client: owns the WebSocket, routes lobby messages to the cold-path
 * store and snapshots to the hot-path holder. Implements CommandSink (send), so
 * the shared input/HUD dispatch commands the same way as single-player.
 *
 * The client is a THIN renderer — it never runs the sim. The server (VPS) is
 * authoritative; we only render what it sends.
 */
import { decodeServerMsg, encodeClientMsg, wireToClientView, type ClientMsg, type Role } from "@fire/protocol";
import type { Command, GameOptions } from "@fire/sim";
import { pushSnapshot } from "./holder.ts";
import { useUi } from "../state/store.ts";

export function defaultServerUrl(): string {
  // Production: same host over TLS via a /ws reverse-proxy. Dev: server on 8787.
  if (window.location.protocol === "https:") return `wss://${window.location.host}/ws`;
  return `ws://${window.location.hostname}:8787`;
}

export class NetClient {
  private ws: WebSocket;
  private outbox: string[] = [];
  private opened = false;
  lastSnapshotMs = 0;
  ticksPerSec = 15;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.opened = true;
      for (const m of this.outbox) this.ws.send(m);
      this.outbox = [];
    };
    this.ws.onmessage = (e) => this.handle(typeof e.data === "string" ? e.data : "");
    this.ws.onerror = () => useUi.getState().setNetError("Could not reach the server.");
  }

  private out(msg: ClientMsg): void {
    const s = encodeClientMsg(msg);
    if (this.opened) this.ws.send(s);
    else this.outbox.push(s);
  }

  private handle(raw: string): void {
    const m = decodeServerMsg(raw);
    if (!m) return;
    const ui = useUi.getState();
    switch (m.type) {
      case "JOINED":
        ui.setJoined(m.code, m.token, m.playerId, m.isHost);
        break;
      case "ROOM_STATE":
        ui.setLobby(m.lobby);
        break;
      case "WELCOME":
        this.ticksPerSec = m.ticksPerSec;
        ui.setWelcome(m.role);
        break;
      case "SNAPSHOT":
        pushSnapshot(wireToClientView(m.snap));
        this.lastSnapshotMs = performance.now();
        break;
      case "ERROR":
        ui.setNetError(m.message);
        break;
    }
  }

  createRoom(name: string, options: GameOptions): void {
    this.out({ type: "CREATE_ROOM", name, options });
  }

  joinRoom(code: string, name: string, token?: string): void {
    this.out(token ? { type: "JOIN_ROOM", code, name, token } : { type: "JOIN_ROOM", code, name });
  }

  claimRole(role: Role | null): void {
    this.out({ type: "CLAIM_ROLE", role });
  }

  startGame(): void {
    this.out({ type: "START" });
  }

  /** CommandSink. */
  send(cmd: Command): void {
    this.out({ type: "COMMAND", command: cmd });
  }

  close(): void {
    try {
      this.out({ type: "LEAVE" });
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

// Active multiplayer client shared by the lobby and game components.
let active: NetClient | null = null;
export function getNet(): NetClient | null {
  return active;
}
export function setNet(c: NetClient | null): void {
  active = c;
}
