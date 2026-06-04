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
  hashWorld,
  igniteCell,
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
