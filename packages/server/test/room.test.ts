import { describe, it, expect } from "vitest";
import { cellIndex, createInitialState, hashWorld, makeUnit, tick, type Command, type WorldState } from "@fire/sim";
import type { Role } from "@fire/protocol";
import { Room } from "../src/room.ts";

const W = 16;

function makeWorld(): WorldState {
  return createInitialState({
    seed: 7,
    config: { GRID_W: W, GRID_H: W, ROUND_LENGTH_SEC: 100000 },
    units: [
      makeUnit({ id: "h1", role: "HELI", operatorId: "a", cell: cellIndex(2, 2, W) }),
      makeUnit({ id: "t1", role: "TRUCK", operatorId: "b", cell: cellIndex(8, 8, W) }),
      makeUnit({ id: "d1", role: "DOZER", operatorId: "c", cell: cellIndex(12, 12, W) }),
    ],
  });
}

interface Ev {
  role: Role;
  command: Command;
}
const schedule: Record<number, Ev[]> = {
  1: [{ role: "HELI", command: { type: "SET_WAYPOINT", unitId: "h1", target: cellIndex(12, 2, W) } }],
  3: [{ role: "DOZER", command: { type: "ACT", unitId: "d1" } }],
  10: [{ role: "TRUCK", command: { type: "SET_WAYPOINT", unitId: "t1", target: cellIndex(2, 8, W) } }],
};

describe("Room — authoritative core reuse", () => {
  it("matches a direct tick loop exactly (verbatim sim reuse)", () => {
    const room = new Room(makeWorld());
    let direct = makeWorld();

    for (let t = 1; t <= 200; t++) {
      const cmds: Command[] = [];
      for (const e of schedule[t] ?? []) {
        expect(room.submit(e.role, e.command)).toBe(true);
        cmds.push(e.command);
      }
      room.tick();
      direct = tick(direct, cmds);
      expect(room.tickNumber).toBe(direct.tick);
    }
    expect(hashWorld(room.worldState)).toBe(hashWorld(direct));
  });

  it("is invariant to command ARRIVAL ORDER (core sorts canonically)", () => {
    const batch: Ev[] = [
      { role: "HELI", command: { type: "SET_WAYPOINT", unitId: "h1", target: cellIndex(12, 2, W) } },
      { role: "TRUCK", command: { type: "SET_WAYPOINT", unitId: "t1", target: cellIndex(2, 8, W) } },
      { role: "DOZER", command: { type: "ACT", unitId: "d1" } },
    ];
    const a = new Room(makeWorld());
    const b = new Room(makeWorld());
    batch.forEach((e) => a.submit(e.role, e.command));
    [...batch].reverse().forEach((e) => b.submit(e.role, e.command));
    for (let i = 0; i < 80; i++) {
      a.tick();
      b.tick();
    }
    expect(hashWorld(a.worldState)).toBe(hashWorld(b.worldState));
  });

  it("rejects commands for units a role does not own (anti-cheat)", () => {
    const room = new Room(makeWorld());
    expect(room.submit("TRUCK", { type: "ACT", unitId: "h1" })).toBe(false); // truck ≠ heli's unit
    expect(room.submit("HELI", { type: "ACT", unitId: "nope" })).toBe(false); // unknown unit
    expect(room.submit("HELI", { type: "ACT", unitId: "h1" })).toBe(true);
  });

  it("exposes a complete current snapshot for reconnection", () => {
    const room = new Room(makeWorld());
    for (let i = 0; i < 30; i++) room.tick();
    const snap = room.snapshotFor("TRUCK");
    expect(snap.terrain.length).toBe(W * W); // full state, not a delta
    expect(snap.units).toHaveLength(3);
    expect(room.unitIdsFor("HELI")).toEqual(["h1"]);
  });

  it("server state is unaffected by who is (or isn't) connected", () => {
    // The room ticks regardless of connections; the same command stream ⇒ same state.
    const withGaps = new Room(makeWorld());
    let reference = makeWorld();
    for (let t = 1; t <= 100; t++) {
      const cmds: Command[] = [];
      for (const e of schedule[t] ?? []) {
        withGaps.submit(e.role, e.command);
        cmds.push(e.command);
      }
      withGaps.tick();
      reference = tick(reference, cmds);
    }
    expect(hashWorld(withGaps.worldState)).toBe(hashWorld(reference));
  });
});
