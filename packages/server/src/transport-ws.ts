/**
 * WebSocket adapter over the lobby/room logic. Thin I/O: decode client messages,
 * route to the GameSession, and broadcast role-filtered snapshots each tick.
 * All game rules + filtering live in @fire/sim and @fire/protocol (tested);
 * this file is just transport.
 */
import { WebSocketServer, type WebSocket } from "ws";
import { decodeClientMsg, encodeServerMsg, snapshotToWire, type ServerMsg } from "@fire/protocol";
import { RoomManager, type GameSession } from "./lobby.ts";

interface Conn {
  ws: WebSocket;
  session: GameSession | null;
  token: string | null;
}

export function startServer(port: number): { close: () => void } {
  const manager = new RoomManager();
  const conns = new Set<Conn>();
  const tickers = new Map<string, ReturnType<typeof setInterval>>();
  const wss = new WebSocketServer({ port });

  const send = (ws: WebSocket, msg: ServerMsg): void => {
    if (ws.readyState === ws.OPEN) ws.send(encodeServerMsg(msg));
  };

  const broadcastLobby = (session: GameSession): void => {
    const lobby = session.lobbyState();
    for (const c of conns) if (c.session === session) send(c.ws, { type: "ROOM_STATE", lobby });
  };

  const welcome = (c: Conn, session: GameSession): void => {
    if (!c.token) return;
    const role = session.roleOf(c.token);
    send(c.ws, {
      type: "WELCOME",
      role,
      unitIds: role ? session.unitIdsFor(role) : [],
      ticksPerSec: session.ticksPerSec(),
    });
    if (role) {
      const snap = session.snapshotFor(role);
      if (snap) send(c.ws, { type: "SNAPSHOT", snap: snapshotToWire(snap) });
    }
  };

  const ensureTicker = (session: GameSession): void => {
    if (tickers.has(session.code)) return;
    const interval = setInterval(() => {
      session.tick();
      for (const c of conns) {
        if (c.session !== session || !c.token) continue;
        const role = session.roleOf(c.token);
        if (!role) continue; // spectators (no role) receive nothing for now
        const snap = session.snapshotFor(role);
        if (snap) send(c.ws, { type: "SNAPSHOT", snap: snapshotToWire(snap) });
      }
      if (session.ended) {
        clearInterval(interval);
        tickers.delete(session.code);
      }
    }, 1000 / session.ticksPerSec());
    tickers.set(session.code, interval);
  };

  wss.on("connection", (ws) => {
    const c: Conn = { ws, session: null, token: null };
    conns.add(c);

    ws.on("message", (data) => {
      const msg = decodeClientMsg(data.toString());
      if (!msg) return;

      switch (msg.type) {
        case "CREATE_ROOM": {
          const session = manager.createRoom(msg.options ?? {});
          const player = session.addPlayer(msg.name ?? "", true);
          c.session = session;
          c.token = player.token;
          send(ws, { type: "JOINED", code: session.code, token: player.token, playerId: player.id, isHost: true });
          broadcastLobby(session);
          break;
        }
        case "JOIN_ROOM": {
          const session = manager.get(msg.code);
          if (!session) {
            send(ws, { type: "ERROR", message: "Room not found" });
            break;
          }
          let player = msg.token ? session.reconnect(msg.token) : null;
          if (!player) player = session.addPlayer(msg.name ?? "", false);
          c.session = session;
          c.token = player.token;
          send(ws, { type: "JOINED", code: session.code, token: player.token, playerId: player.id, isHost: session.isHost(player.token) });
          if (session.started) welcome(c, session);
          broadcastLobby(session);
          break;
        }
        case "CLAIM_ROLE": {
          if (c.session && c.token) {
            c.session.claimRole(c.token, msg.role);
            broadcastLobby(c.session);
          }
          break;
        }
        case "START": {
          if (c.session && c.token && c.session.start(c.token)) {
            for (const other of conns) if (other.session === c.session) welcome(other, c.session);
            broadcastLobby(c.session);
            ensureTicker(c.session);
          }
          break;
        }
        case "COMMAND": {
          if (c.session && c.token) c.session.submitCommand(c.token, msg.command);
          break;
        }
        case "LEAVE": {
          if (c.session && c.token) {
            c.session.disconnect(c.token);
            broadcastLobby(c.session);
          }
          c.session = null;
          c.token = null;
          break;
        }
      }
    });

    ws.on("close", () => {
      if (c.session && c.token) {
        c.session.disconnect(c.token);
        broadcastLobby(c.session);
      }
      conns.delete(c);
    });
  });

  return {
    close: () => {
      for (const t of tickers.values()) clearInterval(t);
      wss.close();
    },
  };
}
