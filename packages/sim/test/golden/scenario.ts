/**
 * A fixed, deterministic Phase-1 scenario used by the determinism gates and the
 * cross-engine (Node↔Chromium) golden-hash check. Exercises grass + forest +
 * assets, a wind shift, and multiple ignitions over a long run.
 *
 * Pure: no console / fs / DOM — safe to import in both Node tests and a browser.
 */
import {
  cellIndex,
  createInitialState,
  type Command,
  hashWorld,
  igniteCell,
  makeUnit,
  Terrain,
  tick,
  type WindKeyframe,
  type WorldState,
} from "../../src/index.ts";

export const SCENARIO_SEED = 7;
export const CHECKPOINTS = [1, 50, 200, 500] as const;
export const MAX_TICK = 500;

export function buildScenario(): WorldState {
  const W = 30;
  const H = 30;
  const terrain = new Uint8Array(W * H).fill(Terrain.GRASSLAND);

  // A forest band across the middle.
  for (let row = 10; row < 16; row++) {
    for (let col = 0; col < W; col++) terrain[cellIndex(col, row, W)] = Terrain.FOREST;
  }
  // Asset clusters.
  terrain[cellIndex(5, 5, W)] = Terrain.HOUSE;
  terrain[cellIndex(6, 5, W)] = Terrain.HOUSE;
  terrain[cellIndex(20, 20, W)] = Terrain.ANIMALS;
  terrain[cellIndex(21, 20, W)] = Terrain.ANIMALS;
  // A non-flammable source for variety.
  terrain[cellIndex(10, 25, W)] = Terrain.WATER_SOURCE;

  const windKeyframes: WindKeyframe[] = [
    { atTick: 0, dirX: 1, dirY: 0, speed: 0.6 },
    { atTick: 300, dirX: 0, dirY: 1, speed: 0.9 },
  ];

  const s = createInitialState({
    seed: SCENARIO_SEED,
    config: { GRID_W: W, GRID_H: H, ROUND_LENGTH_SEC: 100_000 },
    terrain,
    windKeyframes,
  });

  igniteCell(s, cellIndex(2, 2, W));
  igniteCell(s, cellIndex(15, 12, W)); // inside the forest band
  return s;
}

/** Runs the scenario and returns `{ [tick]: hash }` at the checkpoint ticks. */
export function runCheckpoints(): Record<string, string> {
  let s = buildScenario();
  const checkpoints = new Set<number>(CHECKPOINTS);
  const out: Record<string, string> = {};
  for (let t = 1; t <= MAX_TICK; t++) {
    s = tick(s);
    if (checkpoints.has(t)) out[String(t)] = hashWorld(s);
  }
  return out;
}

/**
 * Phase-2 scenario: 6 units exercise extinguish, firebreak, auto-refill, and
 * movement (with no-stacking) alongside fire spread. Locks unit determinism.
 */
export function buildScenario2(): WorldState {
  const W = 20;
  const H = 20;
  const terrain = new Uint8Array(W * H).fill(Terrain.GRASSLAND);
  for (let row = 8; row <= 10; row++) {
    for (let col = 0; col < W; col++) terrain[cellIndex(col, row, W)] = Terrain.FOREST;
  }
  terrain[cellIndex(2, 2, W)] = Terrain.WATER_SOURCE;
  terrain[cellIndex(3, 2, W)] = Terrain.FUEL_SOURCE;

  const thirsty = makeUnit({ id: "t1", role: "TRUCK", operatorId: "op-t", cell: cellIndex(2, 2, W) });
  thirsty.water = 0.3; // will auto-refill on the source

  const units = [
    makeUnit({ id: "h1", role: "HELI", operatorId: "op-h", cell: cellIndex(5, 5, W) }), // sits on a fire
    makeUnit({ id: "h2", role: "HELI", operatorId: "op-h", cell: cellIndex(18, 1, W) }),
    thirsty,
    makeUnit({ id: "t2", role: "TRUCK", operatorId: "op-t", cell: cellIndex(1, 18, W) }),
    makeUnit({ id: "d1", role: "DOZER", operatorId: "op-d", cell: cellIndex(10, 15, W) }), // firebreaks grass
    makeUnit({ id: "d2", role: "DOZER", operatorId: "op-d", cell: cellIndex(18, 18, W) }),
  ];

  const s = createInitialState({
    seed: 11,
    config: { GRID_W: W, GRID_H: H, ROUND_LENGTH_SEC: 100_000 },
    terrain,
    windKeyframes: [{ atTick: 0, dirX: 1, dirY: 0, speed: 0.7 }],
    units,
  });
  igniteCell(s, cellIndex(5, 5, W)); // under h1
  igniteCell(s, cellIndex(10, 10, W)); // free-spreading fire in the forest
  return s;
}

export function runCheckpoints2(): Record<string, string> {
  let s = buildScenario2();
  const W = 20;
  // Scripted commands: act in place + send the idle units roaming (no-stacking).
  const schedule: Record<number, Command[]> = {
    1: [
      { type: "ACT", unitId: "h1" }, // extinguish the fire under it
      { type: "ACT", unitId: "d1" }, // firebreak the grass under it
      { type: "SET_WAYPOINT", unitId: "h2", target: cellIndex(0, 0, W) },
      { type: "SET_WAYPOINT", unitId: "t2", target: cellIndex(0, 19, W) },
      { type: "SET_WAYPOINT", unitId: "d2", target: cellIndex(19, 0, W) },
    ],
  };

  const checkpoints = new Set<number>(CHECKPOINTS);
  const out: Record<string, string> = {};
  for (let t = 1; t <= MAX_TICK; t++) {
    s = tick(s, schedule[t] ?? []);
    if (checkpoints.has(t)) out[String(t)] = hashWorld(s);
  }
  return out;
}
