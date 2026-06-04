import { describe, it, expect } from "vitest";
import { cellIndex, indexToOffset } from "../src/hex/hex.ts";
import { Rng } from "../src/rng/rng.ts";
import { createInitialState, hashWorld } from "../src/index.ts";
import { makeUnit, type Command, type Unit } from "../src/index.ts";
import { tick } from "../src/index.ts";

const W = 12;
const H = 12;

function withUnits(units: Unit[]) {
  return createInitialState({
    seed: 1,
    config: { GRID_W: W, GRID_H: H, ROUND_LENGTH_SEC: 100000 },
    units,
  });
}

function unit(s: ReturnType<typeof withUnits>, id: string): Unit {
  return s.units.find((u) => u.id === id)!;
}

describe("unit movement", () => {
  it("moves to a waypoint and stops there", () => {
    let s = withUnits([makeUnit({ id: "t1", role: "TRUCK", operatorId: "op", cell: cellIndex(1, 1, W) })]);
    const goal = cellIndex(9, 1, W);
    s = tick(s, [{ type: "SET_WAYPOINT", unitId: "t1", target: goal }]);
    expect(unit(s, "t1").path.length).toBeGreaterThan(0);

    for (let i = 0; i < 200 && unit(s, "t1").path.length > 0; i++) s = tick(s);
    expect(unit(s, "t1").cell).toBe(goal);
    expect(unit(s, "t1").path).toEqual([]);
    expect(unit(s, "t1").stepProgress).toBe(0);
  });

  it("the helicopter outruns the truck", () => {
    let s = withUnits([
      makeUnit({ id: "h1", role: "HELI", operatorId: "op", cell: cellIndex(0, 5, W) }),
      makeUnit({ id: "t1", role: "TRUCK", operatorId: "op", cell: cellIndex(0, 7, W) }),
    ]);
    s = tick(s, [
      { type: "SET_WAYPOINT", unitId: "h1", target: cellIndex(11, 5, W) },
      { type: "SET_WAYPOINT", unitId: "t1", target: cellIndex(11, 7, W) },
    ]);
    for (let i = 0; i < 20; i++) s = tick(s);
    const heliCol = indexToOffset(unit(s, "h1").cell, W).col;
    const truckCol = indexToOffset(unit(s, "t1").cell, W).col;
    expect(heliCol).toBeGreaterThan(truckCol);
  });

  it("CANCEL_MOVE halts a unit", () => {
    let s = withUnits([makeUnit({ id: "t1", role: "TRUCK", operatorId: "op", cell: cellIndex(1, 1, W) })]);
    s = tick(s, [{ type: "SET_WAYPOINT", unitId: "t1", target: cellIndex(9, 9, W) }]);
    for (let i = 0; i < 5; i++) s = tick(s);
    s = tick(s, [{ type: "CANCEL_MOVE", unitId: "t1" }]);
    const parked = unit(s, "t1").cell;
    for (let i = 0; i < 20; i++) s = tick(s);
    expect(unit(s, "t1").cell).toBe(parked);
    expect(unit(s, "t1").path).toEqual([]);
  });

  it("a unit will not move onto a cell a stationary unit occupies", () => {
    const blockerCell = cellIndex(5, 5, W);
    let s = withUnits([
      makeUnit({ id: "blk", role: "TRUCK", operatorId: "op", cell: blockerCell }),
      makeUnit({ id: "mov", role: "HELI", operatorId: "op", cell: cellIndex(2, 5, W) }),
    ]);
    // Aim straight at the blocker's cell — pathfinding refuses (target blocked).
    s = tick(s, [{ type: "SET_WAYPOINT", unitId: "mov", target: blockerCell }]);
    for (let i = 0; i < 50; i++) s = tick(s);
    expect(unit(s, "mov").cell).not.toBe(blockerCell);
    expect(unit(s, "blk").cell).toBe(blockerCell);
  });

  it("is deterministic for the same command stream", () => {
    const cmds: Command[] = [{ type: "SET_WAYPOINT", unitId: "t1", target: cellIndex(10, 10, W) }];
    function play(): string {
      let s = withUnits([makeUnit({ id: "t1", role: "TRUCK", operatorId: "op", cell: cellIndex(1, 1, W) })]);
      s = tick(s, cmds);
      for (let i = 0; i < 80; i++) s = tick(s);
      return hashWorld(s);
    }
    expect(play()).toBe(play());
  });
});

describe("no-stacking property", () => {
  it("no two units ever share a cell across many random waypoints", () => {
    const startCells = [
      cellIndex(1, 1, W), cellIndex(10, 1, W), cellIndex(1, 10, W),
      cellIndex(10, 10, W), cellIndex(5, 1, W), cellIndex(1, 5, W),
    ];
    const roles = ["HELI", "HELI", "TRUCK", "TRUCK", "DOZER", "DOZER"] as const;
    let s = withUnits(
      startCells.map((c, i) => makeUnit({ id: `u${i}`, role: roles[i]!, operatorId: `op${i % 3}`, cell: c })),
    );

    const rng = new Rng(424242);
    for (let t = 0; t < 600; t++) {
      const cmds: Command[] = [];
      // Occasionally retarget a random unit to a random cell.
      if (t % 7 === 0) {
        const uid = `u${rng.nextInt(6)}`;
        cmds.push({ type: "SET_WAYPOINT", unitId: uid, target: rng.nextInt(W * H) });
      }
      s = tick(s, cmds);

      const seen = new Set<number>();
      for (const u of s.units) {
        expect(seen.has(u.cell)).toBe(false); // no two units in the same cell
        seen.add(u.cell);
      }
    }
  });
});
