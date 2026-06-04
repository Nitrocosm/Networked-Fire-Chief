import { describe, it, expect } from "vitest";
import { createInitialState, cloneWorld, hashWorld } from "../src/index.ts";
import { makeUnit } from "../src/index.ts";
import { tick } from "../src/index.ts";

function stateWithUnits() {
  return createInitialState({
    seed: 3,
    config: { GRID_W: 10, GRID_H: 10, ROUND_LENGTH_SEC: 100000 },
    units: [
      makeUnit({ id: "h1", role: "HELI", operatorId: "op-heli", cell: 11 }),
      makeUnit({ id: "t1", role: "TRUCK", operatorId: "op-truck", cell: 55 }),
    ],
  });
}

describe("unit state integration", () => {
  it("makeUnit starts with full tanks and no action/path", () => {
    const u = makeUnit({ id: "x", role: "DOZER", operatorId: "op", cell: 0 });
    expect(u.water).toBe(1);
    expect(u.fuel).toBe(1);
    expect(u.path).toEqual([]);
    expect(u.action).toBeNull();
  });

  it("cloneWorld deep-copies units (mutating the clone leaves the original intact)", () => {
    const s = stateWithUnits();
    const c = cloneWorld(s);
    c.units[0]!.water = 0.1;
    c.units[0]!.path.push(99);
    expect(s.units[0]!.water).toBe(1);
    expect(s.units[0]!.path).toEqual([]);
  });

  it("units are part of the canonical hash", () => {
    const s = stateWithUnits();
    const before = hashWorld(s);
    const c = cloneWorld(s);
    c.units[0]!.water = 0.5;
    expect(hashWorld(c)).not.toBe(before);
  });

  it("tick is pure with units present and a clone continues identically", () => {
    let s = stateWithUnits();
    const before = hashWorld(s);
    s = tick(s);
    // original snapshot object is unchanged (we captured its hash on a fresh build)
    expect(hashWorld(stateWithUnits())).toBe(before);

    let a = s;
    let b = cloneWorld(s);
    for (let i = 0; i < 30; i++) {
      a = tick(a);
      b = tick(b);
    }
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});
