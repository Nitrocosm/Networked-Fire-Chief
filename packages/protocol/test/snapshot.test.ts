import { describe, it, expect } from "vitest";
import { createInitialState, makeUnit, tick, type WorldState } from "@fire/sim";
import { filterForRole, toSnapshot } from "../src/index.ts";

function world(): WorldState {
  const s = createInitialState({
    seed: 1,
    config: { GRID_W: 8, GRID_H: 8, ROUND_LENGTH_SEC: 100000 },
    units: [makeUnit({ id: "h1", role: "HELI", operatorId: "op", cell: 0 })],
    events: [{ atTick: 1, type: "WARNING", id: "w1", center: 20, leadTime: 50 }],
  });
  return tick(s); // tick 1 creates the warning
}

describe("toSnapshot", () => {
  it("projects state into a render-friendly snapshot", () => {
    const snap = toSnapshot(world());
    expect(snap.width).toBe(8);
    expect(snap.units).toHaveLength(1);
    expect(snap.warnings).toHaveLength(1);
    expect(snap.wind).not.toBeNull();
  });
});

describe("filterForRole enforces information asymmetry in the DATA", () => {
  const snap = toSnapshot(world());

  it("HELI receives wind but NOT warnings", () => {
    const v = filterForRole(snap, "HELI");
    expect(v.wind).not.toBeNull();
    expect(v.warnings).toBeNull(); // stripped from the data, not just hidden
  });

  it("DOZER receives warnings but NOT wind", () => {
    const v = filterForRole(snap, "DOZER");
    expect(v.warnings).not.toBeNull();
    expect(v.wind).toBeNull();
  });

  it("TRUCK receives both", () => {
    const v = filterForRole(snap, "TRUCK");
    expect(v.wind).not.toBeNull();
    expect(v.warnings).not.toBeNull();
  });

  it("a serialized HELI view contains no warning data anywhere", () => {
    const v = filterForRole(snap, "HELI");
    expect(JSON.stringify(v.warnings)).toBe("null");
  });
});
