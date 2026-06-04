import { describe, it, expect } from "vitest";
import WebSocket from "ws";
import { decodeServerMsg, encodeClientMsg, type ClientMsg, type ServerMsg } from "@fire/protocol";
import { startServer } from "../src/transport-ws.ts";

const PORT = 18791;

function connect(): Promise<WebSocket> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    ws.on("open", () => resolve(ws));
  });
}

function nextMsg(ws: WebSocket, pred: (m: ServerMsg) => boolean): Promise<ServerMsg> {
  return new Promise((resolve) => {
    const handler = (data: WebSocket.RawData): void => {
      const m = decodeServerMsg(data.toString());
      if (m && pred(m)) {
        ws.off("message", handler);
        resolve(m);
      }
    };
    ws.on("message", handler);
  });
}

const send = (ws: WebSocket, msg: ClientMsg): void => ws.send(encodeClientMsg(msg));

describe("ws server end-to-end", () => {
  it("creates a room, claims roles, starts, and streams role-filtered snapshots", async () => {
    const server = startServer(PORT);
    try {
      // Host creates a room and takes HELI.
      const a = await connect();
      send(a, { type: "CREATE_ROOM", name: "Ana", options: { size: 16, roundLengthSec: 100000 } });
      const joined = (await nextMsg(a, (m) => m.type === "JOINED")) as Extract<ServerMsg, { type: "JOINED" }>;
      expect(joined.isHost).toBe(true);
      send(a, { type: "CLAIM_ROLE", role: "HELI" });

      // Second player joins by code and takes DOZER.
      const b = await connect();
      send(b, { type: "JOIN_ROOM", code: joined.code, name: "Ben" });
      await nextMsg(b, (m) => m.type === "JOINED");
      send(b, { type: "CLAIM_ROLE", role: "DOZER" });

      // Host starts; both receive role-filtered snapshots.
      send(a, { type: "START" });
      const aSnap = (await nextMsg(a, (m) => m.type === "SNAPSHOT")) as Extract<ServerMsg, { type: "SNAPSHOT" }>;
      const bSnap = (await nextMsg(b, (m) => m.type === "SNAPSHOT")) as Extract<ServerMsg, { type: "SNAPSHOT" }>;

      expect(aSnap.snap.wind).not.toBeNull(); // HELI sees wind
      expect(aSnap.snap.warnings).toBeNull(); // HELI blind to warnings
      expect(bSnap.snap.wind).toBeNull(); // DOZER blind to wind
      expect(bSnap.snap.warnings).not.toBeNull(); // DOZER sees warnings
      expect(aSnap.snap.units).toHaveLength(6);

      a.close();
      b.close();
    } finally {
      server.close();
    }
  });
});
