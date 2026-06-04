import { describe, it, expect } from "vitest";
import { cellIndex, secondsToTicks } from "@fire/sim";
import { parseScenario, safeParseScenario } from "../src/index.ts";

const valid = {
  seed: 1,
  mapSeed: 2,
  config: { GRID_W: 20, GRID_H: 20, TICKS_PER_SEC: 15 },
  wind: [{ atTick: 0, dir: 0, speed: 0.5 }],
  events: [
    { atTick: 10, type: "WARNING", id: "w1", col: 5, row: 6, leadTimeSec: 8 },
    { atTick: 20, type: "IGNITE", col: 3, row: 3 },
    { atTick: 30, type: "CANCEL_WARNING", id: "w1" },
  ],
};

describe("parseScenario (authored → sim-native)", () => {
  it("converts coords, hex wind direction, and seconds", () => {
    const s = parseScenario(valid);
    expect(s.seed).toBe(1);
    expect(s.windKeyframes[0]).toEqual({ atTick: 0, dirX: 1, dirY: 0, speed: 0.5 });
    expect(s.events[0]).toEqual({
      atTick: 10,
      type: "WARNING",
      id: "w1",
      center: cellIndex(5, 6, 20),
      leadTime: secondsToTicks(8, 15),
    });
    expect(s.events[1]).toEqual({ atTick: 20, type: "IGNITE", cell: cellIndex(3, 3, 20) });
    expect(s.events[2]).toEqual({ atTick: 30, type: "CANCEL_WARNING", id: "w1" });
  });
});

describe("rejecting malformed scenarios", () => {
  it("throws when a required field is missing", () => {
    expect(() => parseScenario({ mapSeed: 1 })).toThrow();
  });

  it("reports an out-of-bounds coordinate clearly", () => {
    const bad = { seed: 1, mapSeed: 2, config: { GRID_W: 20, GRID_H: 20 }, events: [{ atTick: 1, type: "WARNING", id: "x", col: 25, row: 2 }] };
    const r = safeParseScenario(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("outside the 20×20 grid");
  });

  it("rejects an unknown event type", () => {
    const bad = { seed: 1, mapSeed: 2, events: [{ atTick: 1, type: "NUKE", col: 1, row: 1 }] };
    expect(safeParseScenario(bad).ok).toBe(false);
  });

  it("rejects an out-of-range wind direction with a pathed message", () => {
    const bad = { seed: 1, mapSeed: 2, wind: [{ atTick: 0, dir: 6, speed: 0.5 }] };
    const r = safeParseScenario(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("wind");
  });

  it("safeParse returns a readable error for a bad type", () => {
    const r = safeParseScenario({ seed: "nope", mapSeed: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.toLowerCase()).toContain("seed");
  });
});
