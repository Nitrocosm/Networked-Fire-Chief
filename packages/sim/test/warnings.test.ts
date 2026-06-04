import { describe, it, expect } from "vitest";
import { axialDistance, cellIndex, indexToOffset, offsetToAxial } from "../src/hex/hex.ts";
import { Fire, Terrain } from "../src/fire/fire.ts";
import { createInitialState, hashWorld, type ScenarioEvent } from "../src/index.ts";
import { tick } from "../src/index.ts";

const W = 11;
const H = 11;
const CENTER = cellIndex(5, 5, W);

function build(events: ScenarioEvent[], terrain?: Uint8Array, over = {}) {
  return createInitialState({
    seed: 5,
    config: { GRID_W: W, GRID_H: H, ROUND_LENGTH_SEC: 100000, IGNITION_SCATTER_RADIUS: 2, ...over },
    terrain: terrain ?? new Uint8Array(W * H).fill(Terrain.GRASSLAND),
    events,
  });
}

function burningCells(s: ReturnType<typeof build>): number[] {
  const out: number[] = [];
  for (let i = 0; i < W * H; i++) if (s.fire[i] === Fire.BURNING) out.push(i);
  return out;
}

function distFromCenter(cell: number): number {
  const o = indexToOffset(cell, W);
  const c = indexToOffset(CENTER, W);
  return axialDistance(offsetToAxial(o.col, o.row), offsetToAxial(c.col, c.row));
}

const run = (s: ReturnType<typeof build>, n: number) => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = tick(cur);
  return cur;
};

describe("warning → developed fire", () => {
  const events: ScenarioEvent[] = [{ atTick: 1, type: "WARNING", id: "w1", center: CENTER, leadTime: 5 }];

  it("creates a pending warning, then ignites within the scatter radius (not the center)", () => {
    let s = build(events);
    s = run(s, 5); // before development
    expect(s.warnings.length).toBe(1);
    expect(burningCells(s)).toHaveLength(0);

    s = tick(s); // tick 6 — develops
    const fires = burningCells(s);
    expect(fires).toHaveLength(1);
    const d = distFromCenter(fires[0]!);
    expect(d).toBeGreaterThanOrEqual(1); // not the exact center
    expect(d).toBeLessThanOrEqual(2); // within the scatter radius
    expect(s.warnings).toHaveLength(0); // consumed
  });

  it("is deterministic — same seed picks the same scatter cell", () => {
    expect(hashWorld(run(build(events), 6))).toBe(hashWorld(run(build(events), 6)));
  });

  it("CANCEL_WARNING before development prevents the fire", () => {
    let s = build([
      { atTick: 1, type: "WARNING", id: "w1", center: CENTER, leadTime: 5 },
      { atTick: 3, type: "CANCEL_WARNING", id: "w1" },
    ]);
    s = run(s, 10);
    expect(burningCells(s)).toHaveLength(0);
    expect(s.warnings).toHaveLength(0);
  });

  it("fizzles when every cell in the zone is non-flammable (dozer preemption)", () => {
    // Firebreak the whole scatter disc — exactly what a successful dozer screen does.
    const terrain = new Uint8Array(W * H).fill(Terrain.GRASSLAND);
    const c = indexToOffset(CENTER, W);
    for (let row = c.row - 2; row <= c.row + 2; row++) {
      for (let col = c.col - 2; col <= c.col + 2; col++) {
        if (row < 0 || row >= H || col < 0 || col >= W) continue;
        if (distFromCenter(cellIndex(col, row, W)) <= 2) terrain[cellIndex(col, row, W)] = Terrain.FIREBREAK;
      }
    }
    let s = build(events, terrain);
    s = run(s, 8);
    expect(burningCells(s)).toHaveLength(0); // fizzled
    expect(s.warnings).toHaveLength(0);
  });
});

describe("scripted IGNITE is god-mode", () => {
  it("lights a FOREST cell (not just grassland)", () => {
    const terrain = new Uint8Array(W * H).fill(Terrain.GRASSLAND);
    const forest = cellIndex(2, 2, W);
    terrain[forest] = Terrain.FOREST;
    let s = build([{ atTick: 1, type: "IGNITE", cell: forest }], terrain);
    s = tick(s);
    expect(s.fire[forest]).toBe(Fire.BURNING);
  });

  it("is ignored on a non-flammable cell", () => {
    const terrain = new Uint8Array(W * H).fill(Terrain.GRASSLAND);
    const water = cellIndex(2, 2, W);
    terrain[water] = Terrain.WATER_SOURCE;
    let s = build([{ atTick: 1, type: "IGNITE", cell: water }], terrain);
    s = tick(s);
    expect(s.fire[water]).toBe(Fire.UNBURNT);
  });
});
