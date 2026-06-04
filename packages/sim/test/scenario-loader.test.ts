import { describe, it, expect } from "vitest";
import { Fire, Terrain } from "../src/fire/fire.ts";
import { createStateFromScenario, hashWorld, type Scenario } from "../src/index.ts";
import { tick } from "../src/index.ts";

function run(s: ReturnType<typeof createStateFromScenario>, n: number) {
  let cur = s;
  for (let i = 0; i < n; i++) cur = tick(cur);
  return cur;
}

const base: Scenario = {
  seed: 3,
  mapSeed: 9,
  config: { GRID_W: 25, GRID_H: 25, ROUND_LENGTH_SEC: 100000 },
  windKeyframes: [{ atTick: 0, dirX: 1, dirY: 0, speed: 0.5 }],
  events: [{ atTick: 1, type: "WARNING", id: "w1", center: 12 * 25 + 12, leadTime: 5 }],
};

describe("createStateFromScenario", () => {
  it("generates a map and is fully reproducible", () => {
    const a = createStateFromScenario(base);
    const b = createStateFromScenario(base);
    expect(hashWorld(a)).toBe(hashWorld(b));
    // map actually generated (has forest somewhere)
    expect([...a.terrain].some((t) => t === Terrain.FOREST)).toBe(true);
  });

  it("runs the scripted warning to a developed fire", () => {
    let s = createStateFromScenario(base);
    s = run(s, 7); // lead 5 + slack
    expect([...s.fire].some((f) => f === Fire.BURNING)).toBe(true);
  });

  it("synthesizes a seeded outbreak schedule when OUTBREAK_SOURCE is 'seeded'", () => {
    const seeded: Scenario = {
      ...base,
      config: { ...base.config, OUTBREAK_SOURCE: "seeded" },
      events: [], // none supplied → generated from seed
    };
    const s = createStateFromScenario(seeded);
    expect(s.events.length).toBeGreaterThan(0);
    expect(createStateFromScenario(seeded).events).toEqual(s.events); // deterministic
  });
});
