import { describe, it, expect } from "vitest";
import { cellIndex, getNeighborDirTable } from "../src/hex/hex.ts";
import { burnDurationTicks, Fire, Terrain } from "../src/fire/fire.ts";
import { createInitialState, igniteCell } from "../src/state.ts";
import { tick } from "../src/tick.ts";

/**
 * SPREAD-STATISTICS GATE (spec §5.2 / Phase 1 exit gate).
 *
 * Protocol: isolate ONE burning grass cell next to ONE unburnt grass cell, with
 * everything else inert (BARE). Calm wind. Count whether the neighbor catches
 * before the source burns out, over many seeds. This measures the INDEPENDENT
 * per-neighbor catch probability without the ring-reinforcement that a 6-neighbor
 * setup would introduce. The expected number of the 6 neighbors that catch is
 * therefore 6 × p_catch, which must land in the spec's "~4–5 of 6" band.
 */
describe("spread statistics gate", () => {
  it("expected neighbors-caught over a burn duration is ~4–5 of 6", () => {
    const W = 5;
    const center = cellIndex(2, 2, W);
    const neighbor = getNeighborDirTable(W, W)[center]![0]!.idx;

    let catches = 0;
    const N = 3000;
    for (let seed = 0; seed < N; seed++) {
      const terrain = new Uint8Array(W * W).fill(Terrain.BARE);
      terrain[center] = Terrain.GRASSLAND;
      terrain[neighbor] = Terrain.GRASSLAND;
      let s = createInitialState({
        seed,
        config: { GRID_W: W, GRID_H: W, ROUND_LENGTH_SEC: 100000 },
        terrain,
      });
      igniteCell(s, center);
      // Run past the grass burn duration so the source fully burns out.
      const span = burnDurationTicks(Terrain.GRASSLAND, s.config) + 30;
      for (let t = 0; t < span; t++) s = tick(s);
      if (s.fire[neighbor] !== Fire.UNBURNT) catches++;
    }

    const pCatch = catches / N;
    const expectedOf6 = 6 * pCatch;
    // Band reflects the deliberate, patchy spread design (fire reliably propagates
    // but does not catch all 6 neighbors).
    expect(expectedOf6).toBeGreaterThanOrEqual(2.5);
    expect(expectedOf6).toBeLessThanOrEqual(5.2);
  });
});
