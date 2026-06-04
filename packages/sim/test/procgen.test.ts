import { describe, it, expect } from "vitest";
import { makeConfig } from "../src/config.ts";
import { Terrain } from "../src/fire/fire.ts";
import { generateMap, generateOutbreaks } from "../src/scenario/procgen.ts";

const cfg = makeConfig({ GRID_W: 30, GRID_H: 30 });

function tally(terrain: Uint8Array): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const t of terrain) counts[t] = (counts[t] ?? 0) + 1;
  return counts;
}

describe("seeded map generation", () => {
  it("is deterministic for a given seed and differs across seeds", () => {
    expect([...generateMap(123, cfg)]).toEqual([...generateMap(123, cfg)]);
    expect([...generateMap(123, cfg)]).not.toEqual([...generateMap(124, cfg)]);
  });

  it("produces the expected terrain composition", () => {
    const counts = tally(generateMap(42, cfg));
    expect(counts[Terrain.GRASSLAND]!).toBeGreaterThan(0);
    expect(counts[Terrain.FOREST]!).toBeGreaterThan(0);
    expect(counts[Terrain.HOUSE]!).toBeGreaterThan(0);
    expect(counts[Terrain.ANIMALS]!).toBeGreaterThan(0);
    expect(counts[Terrain.WATER_SOURCE]).toBe(cfg.WATER_SOURCE_COUNT);
    expect(counts[Terrain.FUEL_SOURCE]).toBe(cfg.FUEL_SOURCE_COUNT);
    // Grassland still dominates a 30×30 map.
    expect(counts[Terrain.GRASSLAND]!).toBeGreaterThan(30 * 30 * 0.4);
  });

  it("places sources on the left edge when clustered", () => {
    const clustered = makeConfig({ GRID_W: 30, GRID_H: 30, SOURCE_DISTRIBUTION: "clustered" });
    const terrain = generateMap(7, clustered);
    for (let i = 0; i < terrain.length; i++) {
      if (terrain[i] === Terrain.WATER_SOURCE || terrain[i] === Terrain.FUEL_SOURCE) {
        expect(i % 30).toBeLessThan(30 / 5); // left band
      }
    }
  });
});

describe("seeded outbreak schedule", () => {
  it("is deterministic for a given seed + map", () => {
    const terrain = generateMap(1, cfg);
    expect(generateOutbreaks(99, cfg, terrain)).toEqual(generateOutbreaks(99, cfg, terrain));
  });

  it("emits roughly the configured density, all on grassland, sorted in range", () => {
    const terrain = generateMap(1, cfg);
    const events = generateOutbreaks(5, cfg, terrain);
    const roundTicks = cfg.ROUND_LENGTH_SEC * cfg.TICKS_PER_SEC;
    const expected = Math.round((cfg.ROUND_LENGTH_SEC / 60 / 5) * cfg.OUTBREAK_DENSITY_PER_5MIN);
    expect(events.length).toBe(expected);

    let prev = 0;
    for (const e of events) {
      expect(e.type).toBe("WARNING");
      expect(e.atTick).toBeGreaterThanOrEqual(1);
      expect(e.atTick).toBeLessThan(roundTicks);
      expect(e.atTick).toBeGreaterThanOrEqual(prev); // sorted
      prev = e.atTick;
      if (e.type === "WARNING") expect(terrain[e.center]).toBe(Terrain.GRASSLAND);
    }
  });
});
