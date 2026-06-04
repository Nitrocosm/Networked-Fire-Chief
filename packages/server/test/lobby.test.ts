import { describe, it, expect } from "vitest";
import { RoomManager } from "../src/lobby.ts";

// Deterministic ids/codes for predictable assertions.
function manager() {
  let n = 0;
  return new RoomManager({ genCode: () => `ROOM-${++n}`, genId: () => `id-${++n}` });
}

describe("RoomManager", () => {
  it("creates lookup-able rooms by code (case-insensitive)", () => {
    const m = manager();
    const s = m.createRoom({ size: 20 });
    expect(m.get(s.code)).toBe(s);
    expect(m.get(s.code.toLowerCase())).toBe(s);
    expect(m.get("NOPE")).toBeUndefined();
  });
});

describe("GameSession lobby", () => {
  it("lets one player claim a role and blocks a second from the same role", () => {
    const s = manager().createRoom({});
    const host = s.addPlayer("Ana", true);
    const guest = s.addPlayer("Ben", false);

    expect(s.claimRole(guest.token, "HELI")).toBe(true);
    expect(s.claimRole(host.token, "HELI")).toBe(false); // taken
    expect(s.claimRole(host.token, "TRUCK")).toBe(true);

    const lobby = s.lobbyState();
    expect(lobby.players.find((p) => p.name === "Ben")?.role).toBe("HELI");
    expect(lobby.players.find((p) => p.name === "Ana")?.role).toBe("TRUCK");
  });

  it("releasing a role frees it for someone else", () => {
    const s = manager().createRoom({});
    const a = s.addPlayer("A", true);
    const b = s.addPlayer("B", false);
    s.claimRole(a.token, "DOZER");
    expect(s.claimRole(b.token, "DOZER")).toBe(false);
    expect(s.claimRole(a.token, null)).toBe(true); // release
    expect(s.claimRole(b.token, "DOZER")).toBe(true);
  });

  it("only the host can start, and only once", () => {
    const s = manager().createRoom({ size: 16 });
    const host = s.addPlayer("Host", true);
    const guest = s.addPlayer("Guest", false);
    expect(s.started).toBe(false);
    expect(s.start(guest.token)).toBe(false); // not host
    expect(s.start(host.token)).toBe(true);
    expect(s.started).toBe(true);
    expect(s.start(host.token)).toBe(false); // already started
  });

  it("routes commands to the player's owned units once started", () => {
    const s = manager().createRoom({ size: 16 });
    const host = s.addPlayer("Host", true);
    s.claimRole(host.token, "HELI");
    expect(s.submitCommand(host.token, { type: "ACT", unitId: "heli-1" })).toBe(false); // not started
    s.start(host.token);
    expect(s.submitCommand(host.token, { type: "ACT", unitId: "heli-1" })).toBe(true); // owns heli-1
    expect(s.submitCommand(host.token, { type: "ACT", unitId: "truck-1" })).toBe(false); // not their role
  });

  it("supports reconnect by token", () => {
    const s = manager().createRoom({});
    const p = s.addPlayer("P", true);
    s.claimRole(p.token, "TRUCK");
    s.disconnect(p.token);
    expect(s.lobbyState().players[0]!.connected).toBe(false);
    const back = s.reconnect(p.token);
    expect(back?.role).toBe("TRUCK"); // role preserved across reconnect
    expect(s.lobbyState().players[0]!.connected).toBe(true);
  });
});
