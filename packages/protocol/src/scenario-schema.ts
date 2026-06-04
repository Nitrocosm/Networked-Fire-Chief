/**
 * Validation + conversion at the boundary: a human/JSON "authored" scenario uses
 * col/row coordinates, hex direction indices (0–5), and seconds; this module
 * validates it with Zod and converts it to the sim-native Scenario (cell indices,
 * wind vectors, ticks). Malformed input is rejected with a clear, pathed error.
 */
import { z } from "zod";
import {
  cellIndex,
  type Config,
  DEFAULT_CONFIG,
  DIR_UNIT,
  type Scenario,
  type ScenarioEvent,
  secondsToTicks,
  type WindKeyframe,
} from "@fire/sim";

const nonNegInt = z.number().int().nonnegative();

const authoredEvent = z.discriminatedUnion("type", [
  z.object({
    atTick: nonNegInt,
    type: z.literal("WARNING"),
    id: z.string().min(1),
    col: nonNegInt,
    row: nonNegInt,
    leadTimeSec: z.number().nonnegative().optional(),
  }),
  z.object({ atTick: nonNegInt, type: z.literal("IGNITE"), col: nonNegInt, row: nonNegInt }),
  z.object({ atTick: nonNegInt, type: z.literal("CANCEL_WARNING"), id: z.string().min(1) }),
]);

const authoredWind = z.object({
  atTick: nonNegInt,
  dir: z.number().int().min(0).max(5), // hex direction index
  speed: z.number().min(0).max(1),
});

export const authoredScenarioSchema = z.object({
  seed: z.number().int(),
  mapSeed: z.number().int(),
  config: z.record(z.unknown()).optional(),
  wind: z.array(authoredWind).optional(),
  events: z.array(authoredEvent).optional(),
});

export type AuthoredScenario = z.infer<typeof authoredScenarioSchema>;

/** Validates + converts an authored scenario. Throws on invalid input. */
export function parseScenario(input: unknown): Scenario {
  const a = authoredScenarioSchema.parse(input);
  const config = { ...DEFAULT_CONFIG, ...((a.config as Partial<Config>) ?? {}) };
  const { GRID_W: width, GRID_H: height, TICKS_PER_SEC: tps } = config;

  const toIndex = (col: number, row: number, where: string): number => {
    if (col >= width || row >= height) {
      throw new Error(`${where}: cell (${col},${row}) is outside the ${width}×${height} grid`);
    }
    return cellIndex(col, row, width);
  };

  const windKeyframes: WindKeyframe[] = (a.wind ?? []).map((k) => {
    const v = DIR_UNIT[k.dir]!;
    return { atTick: k.atTick, dirX: v.x, dirY: v.y, speed: k.speed };
  });

  const events: ScenarioEvent[] = (a.events ?? []).map((e): ScenarioEvent => {
    if (e.type === "WARNING") {
      const center = toIndex(e.col, e.row, `WARNING "${e.id}"`);
      return e.leadTimeSec === undefined
        ? { atTick: e.atTick, type: "WARNING", id: e.id, center }
        : { atTick: e.atTick, type: "WARNING", id: e.id, center, leadTime: secondsToTicks(e.leadTimeSec, tps) };
    }
    if (e.type === "IGNITE") {
      return { atTick: e.atTick, type: "IGNITE", cell: toIndex(e.col, e.row, "IGNITE") };
    }
    return { atTick: e.atTick, type: "CANCEL_WARNING", id: e.id };
  });

  return { seed: a.seed, mapSeed: a.mapSeed, config: (a.config as Partial<Config>) ?? {}, windKeyframes, events };
}

/** Non-throwing variant: returns the scenario or a readable error string. */
export function safeParseScenario(input: unknown): { ok: true; scenario: Scenario } | { ok: false; error: string } {
  try {
    return { ok: true, scenario: parseScenario(input) };
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      const path = first?.path.join(".") || "(root)";
      return { ok: false, error: `${path}: ${first?.message ?? "invalid scenario"}` };
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
