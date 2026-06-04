/**
 * Seeded procedural generation — deterministic map + outbreak schedule.
 *
 * Map and outbreaks use SEPARATE derived RNG streams (map-gen vs scenario) so
 * tuning one never shifts the other. Same seed ⇒ identical map AND event list.
 */
import { type Config, secondsToTicks } from "../config.ts";
import { Terrain } from "../fire/fire.ts";
import { getNeighborTable } from "../hex/hex.ts";
import { deriveSeed, Rng, RNG_STREAMS } from "../rng/rng.ts";
import type { ScenarioEvent } from "./scenario.ts";

/** Grows a cluster of `type` from a random grassland seed via random frontier expansion. */
function growCluster(
  terrain: Uint8Array,
  rng: Rng,
  type: number,
  size: number,
  neighbors: readonly (readonly number[])[],
): void {
  // Pick a grassland seed (bounded attempts so a saturated map can't loop forever).
  let seed = -1;
  for (let attempt = 0; attempt < 200; attempt++) {
    const c = rng.nextInt(terrain.length);
    if (terrain[c] === Terrain.GRASSLAND) {
      seed = c;
      break;
    }
  }
  if (seed < 0) return;

  terrain[seed] = type;
  let count = 1;
  const frontier: number[] = [];
  for (const n of neighbors[seed]!) if (terrain[n] === Terrain.GRASSLAND) frontier.push(n);

  while (count < size && frontier.length > 0) {
    const pick = rng.nextInt(frontier.length);
    const cell = frontier[pick]!;
    frontier[pick] = frontier[frontier.length - 1]!; // swap-pop (deterministic)
    frontier.pop();
    if (terrain[cell] !== Terrain.GRASSLAND) continue;
    terrain[cell] = type;
    count++;
    for (const n of neighbors[cell]!) if (terrain[n] === Terrain.GRASSLAND) frontier.push(n);
  }
}

function placeSources(terrain: Uint8Array, rng: Rng, type: number, count: number, cfg: Config): void {
  const { GRID_W: width, GRID_H: height } = cfg;
  for (let i = 0; i < count; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      let col: number;
      let row: number;
      if (cfg.SOURCE_DISTRIBUTION === "clustered") {
        col = rng.nextInt(Math.max(1, Math.floor(width / 5))); // left-edge band
        row = rng.nextInt(height);
      } else {
        col = rng.nextInt(width);
        row = rng.nextInt(height);
      }
      const idx = row * width + col;
      if (terrain[idx] === Terrain.GRASSLAND) {
        terrain[idx] = type;
        placed = true;
      }
    }
  }
}

export function generateMap(mapSeed: number, cfg: Config): Uint8Array {
  const { GRID_W: width, GRID_H: height } = cfg;
  const terrain = new Uint8Array(width * height).fill(Terrain.GRASSLAND);
  const rng = new Rng(deriveSeed(mapSeed, RNG_STREAMS.MAP_GEN));
  const neighbors = getNeighborTable(width, height);

  const clusterSize = (min: number, max: number): number => min + rng.nextInt(Math.max(1, max - min + 1));

  for (let i = 0; i < cfg.FOREST_CLUSTER_COUNT; i++) {
    growCluster(terrain, rng, Terrain.FOREST, clusterSize(cfg.FOREST_CLUSTER_MIN, cfg.FOREST_CLUSTER_MAX), neighbors);
  }
  for (let i = 0; i < cfg.HOUSE_CLUSTER_COUNT; i++) {
    growCluster(terrain, rng, Terrain.HOUSE, clusterSize(cfg.HOUSE_CLUSTER_MIN, cfg.HOUSE_CLUSTER_MAX), neighbors);
  }
  for (let i = 0; i < cfg.ANIMAL_CLUSTER_COUNT; i++) {
    growCluster(terrain, rng, Terrain.ANIMALS, clusterSize(cfg.ANIMAL_CLUSTER_MIN, cfg.ANIMAL_CLUSTER_MAX), neighbors);
  }
  placeSources(terrain, rng, Terrain.WATER_SOURCE, cfg.WATER_SOURCE_COUNT, cfg);
  placeSources(terrain, rng, Terrain.FUEL_SOURCE, cfg.FUEL_SOURCE_COUNT, cfg);

  return terrain;
}

/**
 * Seeded outbreak schedule: WARNING events at random ticks on grassland cells
 * (new fires start on grassland, spec §9.1.3), at the configured density.
 */
export function generateOutbreaks(seed: number, cfg: Config, terrain: Uint8Array): ScenarioEvent[] {
  const rng = new Rng(deriveSeed(seed, RNG_STREAMS.SCENARIO));
  const roundTicks = secondsToTicks(cfg.ROUND_LENGTH_SEC, cfg.TICKS_PER_SEC);
  const leadTicks = secondsToTicks(cfg.WARNING_LEAD_TIME_SEC, cfg.TICKS_PER_SEC);
  const roundMinutes = cfg.ROUND_LENGTH_SEC / 60;
  const count = Math.max(1, Math.round((roundMinutes / 5) * cfg.OUTBREAK_DENSITY_PER_5MIN));

  const grass: number[] = [];
  for (let i = 0; i < terrain.length; i++) if (terrain[i] === Terrain.GRASSLAND) grass.push(i);
  if (grass.length === 0) return [];

  const events: ScenarioEvent[] = [];
  const latest = Math.max(1, roundTicks - leadTicks - 1);
  for (let i = 0; i < count; i++) {
    events.push({
      atTick: 1 + rng.nextInt(latest),
      type: "WARNING",
      id: `gen-${i}`,
      center: grass[rng.nextInt(grass.length)]!,
    });
  }
  return events.sort((a, b) => a.atTick - b.atTick);
}
