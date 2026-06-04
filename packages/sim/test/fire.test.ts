import { describe, it, expect } from "vitest";
import { makeConfig, type Config } from "../src/config.ts";
import { cellIndex, getNeighborDirTable } from "../src/hex/hex.ts";
import { burnDurationTicks, Fire, type FireBuffers, stepFire, Terrain } from "../src/fire/fire.ts";
import { Rng } from "../src/rng/rng.ts";
import { resolveWind } from "../src/wind/wind.ts";
import { createInitialState, igniteCell, type InitOptions, type WorldState } from "../src/state.ts";
import { tick } from "../src/tick.ts";
import type { WindKeyframe } from "../src/wind/wind.ts";

// Small inert board: everything BARE (non-flammable) unless we paint it.
function inertBoard(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h).fill(Terrain.BARE);
}

function makeState(terrain: Uint8Array, over: Partial<Config> = {}, opts: Partial<InitOptions> = {}): WorldState {
  const w = Math.round(Math.sqrt(terrain.length));
  return createInitialState({
    seed: 1,
    config: { GRID_W: w, GRID_H: w, ROUND_LENGTH_SEC: 100000, ...over },
    terrain,
    ...opts,
  });
}

function run(s: WorldState, ticks: number): WorldState {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = tick(cur);
  return cur;
}

describe("fire lifecycle", () => {
  it("a caught cell passes through IGNITING (non-spreading) before BURNING", () => {
    const W = 5;
    const terrain = inertBoard(W, W);
    const center = cellIndex(2, 2, W);
    const nb = getNeighborDirTable(W, W)[center]![0]!.idx;
    terrain[center] = Terrain.GRASSLAND;
    terrain[nb] = Terrain.GRASSLAND;
    // Force ignition: p0 huge so the neighbor catches on tick 1.
    let s = makeState(terrain, { FIRE_P0: 100 });
    igniteCell(s, center);

    s = tick(s);
    expect(s.fire[nb]).toBe(Fire.IGNITING); // telegraph first
    // IGNITING does not spread: give it a second grass neighbor that should NOT catch from an igniting cell.
    expect(s.burnTimer[nb]).toBeGreaterThan(0);

    // After the igniting window it becomes BURNING.
    s = run(s, 60);
    expect(s.fire[nb]).toBe(Fire.BURNING);
  });

  it("deducts vegetation loss exactly at BURNT_OUT, not at ignition", () => {
    const W = 3;
    const terrain = inertBoard(W, W);
    const idx = cellIndex(1, 1, W);
    terrain[idx] = Terrain.GRASSLAND;
    let s = makeState(terrain, { VEGETATION_LOSS_PER_CELL: 20, LOSS_TOGGLE: "both" });
    const baseline = s.score;
    igniteCell(s, idx);

    // While burning, no score is lost.
    s = run(s, 10);
    expect(s.score).toBe(baseline);

    // Run until it burns out; exactly one vegetation penalty applied.
    s = run(s, burnDurationTicks(Terrain.GRASSLAND, s.config) + 30);
    expect(s.fire[idx]).toBe(Fire.BURNT_OUT);
    expect(s.score).toBe(baseline - 20);
  });

  it("charges the large asset penalty when a house burns out", () => {
    const W = 3;
    const terrain = inertBoard(W, W);
    const idx = cellIndex(1, 1, W);
    terrain[idx] = Terrain.HOUSE;
    let s = makeState(terrain, { ASSET_LOSS_PER_CELL: 500 });
    const baseline = s.score;
    igniteCell(s, idx);
    s = run(s, burnDurationTicks(Terrain.HOUSE, s.config) + 30);
    expect(s.fire[idx]).toBe(Fire.BURNT_OUT);
    expect(s.score).toBe(baseline - 500);
  });

  it("BURNT_OUT cells never reignite", () => {
    const W = 5;
    const terrain = inertBoard(W, W);
    const center = cellIndex(2, 2, W);
    const nb = getNeighborDirTable(W, W)[center]![0]!.idx;
    terrain[center] = Terrain.GRASSLAND;
    terrain[nb] = Terrain.GRASSLAND;
    let s = makeState(terrain, { FIRE_P0: 100 });
    igniteCell(s, nb); // burn out the neighbor first
    s = run(s, burnDurationTicks(Terrain.GRASSLAND, s.config) + 30);
    expect(s.fire[nb]).toBe(Fire.BURNT_OUT);
    // Now light the center and run; the burnt-out neighbor must stay burnt out.
    igniteCell(s, center);
    s = run(s, 200);
    expect(s.fire[nb]).toBe(Fire.BURNT_OUT);
  });

  it("reignition immunity blocks catching for its window", () => {
    const W = 5;
    const terrain = inertBoard(W, W);
    const center = cellIndex(2, 2, W);
    const nb = getNeighborDirTable(W, W)[center]![0]!.idx;
    terrain[center] = Terrain.GRASSLAND;
    terrain[nb] = Terrain.GRASSLAND;
    let s = makeState(terrain, { FIRE_P0: 100 });
    igniteCell(s, center);
    // Make the neighbor immune for a long time.
    s.immune[nb] = 1000;
    s = run(s, 50);
    expect(s.fire[nb]).toBe(Fire.UNBURNT); // never caught while immune
  });

  it("a suppressed burning cell pauses its timer and does not spread (CA level)", () => {
    const W = 5;
    const H = 5;
    const terrain = inertBoard(W, H);
    const center = cellIndex(2, 2, W);
    const nb = getNeighborDirTable(W, H)[center]![0]!.idx;
    terrain[center] = Terrain.GRASSLAND;
    terrain[nb] = Terrain.GRASSLAND;

    const cfg = makeConfig({ GRID_W: W, GRID_H: H, FIRE_P0: 100 });
    const neighbors = getNeighborDirTable(W, H);
    const wind = resolveWind([], 0);
    const rng = new Rng(1);
    const n = W * H;
    const burnDur = burnDurationTicks(Terrain.GRASSLAND, cfg);

    let buf: FireBuffers = { fire: new Uint8Array(n), burnTimer: new Int32Array(n), immune: new Int32Array(n) };
    buf.fire[center] = Fire.BURNING;
    buf.burnTimer[center] = burnDur;

    const suppressed = new Uint8Array(n);
    suppressed[center] = 1; // pretend a unit is extinguishing it

    for (let i = 0; i < 10; i++) {
      const next: FireBuffers = { fire: new Uint8Array(n), burnTimer: new Int32Array(n), immune: new Int32Array(n) };
      stepFire(terrain, buf, suppressed, neighbors, wind, cfg, rng, next);
      buf = next;
    }
    expect(buf.fire[center]).toBe(Fire.BURNING); // still burning — timer paused
    expect(buf.burnTimer[center]).toBe(burnDur); // never decremented
    expect(buf.fire[nb]).toBe(Fire.UNBURNT); // suppressed cell does not spread
  });
});

describe("wind bias", () => {
  it("ignites downwind neighbors more often than upwind over many trials", () => {
    const W = 5;
    const center = cellIndex(2, 2, W);
    const geom = getNeighborDirTable(W, W);
    // East wind blows toward +x. The relevant spread direction is the one in the
    // TARGET cell's neighbor list describing flow FROM center INTO it.
    const east: WindKeyframe[] = [{ atTick: 0, dirX: 1, dirY: 0, speed: 1 }];
    const spreadDirInto = (t: number): number => geom[t]!.find((n) => n.idx === center)!.spreadDir;

    const centerNeighbors = geom[center]!.map((n) => n.idx);
    const downNb = centerNeighbors.find((t) => spreadDirInto(t) === 0)!; // +x downwind
    const upNb = centerNeighbors.find((t) => spreadDirInto(t) === 3)!; // -x upwind

    let downCatches = 0;
    let upCatches = 0;
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      const terrain = inertBoard(W, W);
      terrain[center] = Terrain.GRASSLAND;
      terrain[downNb] = Terrain.GRASSLAND;
      terrain[upNb] = Terrain.GRASSLAND;
      let s = makeState(terrain, {}, { seed, windKeyframes: east });
      igniteCell(s, center);
      s = run(s, 95);
      if (s.fire[downNb] !== Fire.UNBURNT) downCatches++;
      if (s.fire[upNb] !== Fire.UNBURNT) upCatches++;
    }
    expect(downCatches).toBeGreaterThan(upCatches * 2);
  });
});
