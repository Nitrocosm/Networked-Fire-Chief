import { describe, it, expect } from "vitest";
import { cellIndex, getNeighborTable } from "../src/hex/hex.ts";
import { Fire, Terrain } from "../src/fire/fire.ts";
import { createInitialState, igniteCell, makeUnit, type Unit } from "../src/index.ts";
import { tick } from "../src/index.ts";
import type { Config } from "../src/config.ts";

const W = 3;
const H = 3;
const C = cellIndex(1, 1, W);

function board(fill: number): Uint8Array {
  return new Uint8Array(W * H).fill(fill);
}

function start(terrain: Uint8Array, units: Unit[], over: Partial<Config> = {}, ignite: number[] = []) {
  const s = createInitialState({
    seed: 1,
    config: { GRID_W: W, GRID_H: H, ROUND_LENGTH_SEC: 100000, ...over },
    terrain,
    units,
  });
  for (const i of ignite) igniteCell(s, i);
  return s;
}

const u = (s: ReturnType<typeof start>, id: string) => s.units.find((x) => x.id === id)!;
const run = (s: ReturnType<typeof start>, n: number) => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = tick(cur);
  return cur;
};

describe("extinguish", () => {
  it("clears the fire after EXTINGUISH_DURATION and charges 50/50 up front", () => {
    let s = start(board(Terrain.GRASSLAND), [makeUnit({ id: "h", role: "HELI", operatorId: "op", cell: C })], {}, [C]);
    s = tick(s, [{ type: "ACT", unitId: "h" }]);
    // cost charged immediately, action running
    expect(u(s, "h").water).toBeCloseTo(0.5, 6);
    expect(u(s, "h").fuel).toBeCloseTo(0.5, 6);
    expect(u(s, "h").action?.type).toBe("EXTINGUISH");

    s = run(s, 45); // EXTINGUISH_DURATION = 3s * 15
    expect(s.fire[C]).toBe(Fire.UNBURNT);
    expect(s.immune[C]).toBeGreaterThan(0); // reignition immunity set
    expect(u(s, "h").action).toBeNull();
  });

  it("suppresses spread while extinguishing (a paced fire can't jump out)", () => {
    const terrain = board(Terrain.GRASSLAND);
    const nb = getNeighborTable(W, H)[C]![0]!;
    let s = start(terrain, [makeUnit({ id: "h", role: "HELI", operatorId: "op", cell: C })], { FIRE_P0: 100 }, [C]);
    s = tick(s, [{ type: "ACT", unitId: "h" }]);
    s = run(s, 10);
    expect(s.fire[nb]).toBe(Fire.UNBURNT); // would have caught instantly if not suppressed
  });

  it("does nothing and spends nothing when unaffordable", () => {
    const heli = makeUnit({ id: "h", role: "HELI", operatorId: "op", cell: C });
    heli.water = 0.4; // < 0.5 needed
    let s = start(board(Terrain.GRASSLAND), [heli], {}, [C]);
    s = tick(s, [{ type: "ACT", unitId: "h" }]);
    expect(u(s, "h").action).toBeNull();
    expect(u(s, "h").water).toBeCloseTo(0.4, 6); // untouched, never negative
    expect(u(s, "h").fuel).toBeCloseTo(1, 6);
  });
});

describe("firebreak", () => {
  it("dozer converts grass to FIREBREAK and charges 25/25", () => {
    let s = start(board(Terrain.GRASSLAND), [makeUnit({ id: "d", role: "DOZER", operatorId: "op", cell: C })]);
    s = tick(s, [{ type: "ACT", unitId: "d" }]);
    expect(u(s, "d").action?.type).toBe("FIREBREAK");
    expect(u(s, "d").water).toBeCloseTo(0.75, 6);

    s = run(s, 45);
    expect(s.terrain[C]).toBe(Terrain.FIREBREAK);
    expect(u(s, "d").action).toBeNull();
  });

  it("a firebreak cell cannot catch fire", () => {
    const terrain = board(Terrain.GRASSLAND);
    const nb = getNeighborTable(W, H)[C]![0]!;
    let s = start(terrain, [makeUnit({ id: "d", role: "DOZER", operatorId: "op", cell: C })], { FIRE_P0: 100 });
    s = tick(s, [{ type: "ACT", unitId: "d" }]);
    s = run(s, 46); // finish the firebreak at C
    igniteCell(s, nb); // light a neighbor
    s = run(s, 30);
    expect(s.fire[C]).toBe(Fire.UNBURNT); // firebreak never catches
  });

  it("dozer cannot firebreak an asset and spends nothing", () => {
    const terrain = board(Terrain.GRASSLAND);
    terrain[C] = Terrain.HOUSE;
    let s = start(terrain, [makeUnit({ id: "d", role: "DOZER", operatorId: "op", cell: C })]);
    s = tick(s, [{ type: "ACT", unitId: "d" }]);
    expect(u(s, "d").action).toBeNull();
    expect(u(s, "d").water).toBeCloseTo(1, 6);
  });

  it("a non-dozer cannot firebreak", () => {
    let s = start(board(Terrain.GRASSLAND), [makeUnit({ id: "t", role: "TRUCK", operatorId: "op", cell: C })]);
    s = tick(s, [{ type: "ACT", unitId: "t" }]);
    expect(u(s, "t").action).toBeNull();
  });
});

describe("refilling", () => {
  it("auto-refills water on a water source and depletes it equally", () => {
    const terrain = board(Terrain.BARE);
    terrain[C] = Terrain.WATER_SOURCE;
    const truck = makeUnit({ id: "t", role: "TRUCK", operatorId: "op", cell: C });
    truck.water = 0.2;
    let s = start(terrain, [truck]);
    s = run(s, 40); // REFILL_DURATION 1.5s*15 ≈ 23 ticks to fill
    expect(u(s, "t").water).toBeCloseTo(1, 4);
    expect(s.sourceLevel[C]).toBeCloseTo(1 - 0.8, 4); // source drained by exactly what was added
    expect(u(s, "t").fuel).toBeCloseTo(1, 6); // water source does not refill fuel
  });

  it("an emptied source gives only what it had left", () => {
    const terrain = board(Terrain.BARE);
    terrain[C] = Terrain.WATER_SOURCE;
    const truck = makeUnit({ id: "t", role: "TRUCK", operatorId: "op", cell: C });
    truck.water = 0;
    let s = start(terrain, [truck], { SOURCE_CAPACITY: 1 });
    s.sourceLevel[C] = 0.1; // nearly empty
    s = run(s, 40);
    expect(s.sourceLevel[C]).toBeCloseTo(0, 5);
    expect(u(s, "t").water).toBeCloseTo(0.1, 4); // only got what the source held
  });
});
