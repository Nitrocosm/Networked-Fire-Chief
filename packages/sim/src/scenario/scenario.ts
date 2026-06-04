/**
 * Scenario + warning types (sim-native: coordinates are flat CELL INDICES, lead
 * times are TICKS). The authoring/JSON format with col/row + seconds lives in
 * @fire/protocol, which validates and converts into this shape.
 */
import type { Config } from "../config.ts";
import type { WindKeyframe } from "../wind/wind.ts";

/** An active telegraph: a developed fire will ignite near `center` at `igniteAtTick`. */
export interface Warning {
  id: string;
  center: number; // cell index
  igniteAtTick: number;
  /** Radius of the scatter zone (also the displayed risk zone, DECISIONS §3.1). */
  radius: number;
}

export type ScenarioEvent =
  | { atTick: number; type: "WARNING"; id: string; center: number; leadTime?: number }
  | { atTick: number; type: "IGNITE"; cell: number }
  | { atTick: number; type: "CANCEL_WARNING"; id: string };

export interface Scenario {
  seed: number;
  mapSeed: number;
  config: Partial<Config>;
  windKeyframes: WindKeyframe[];
  events: ScenarioEvent[];
}

/** Stable sort by atTick (V8 Array.sort is stable across Node and Chromium). */
export function sortEvents(events: readonly ScenarioEvent[]): ScenarioEvent[] {
  return [...events].sort((a, b) => a.atTick - b.atTick);
}

export function cloneWarnings(warnings: readonly Warning[]): Warning[] {
  return warnings.map((w) => ({ ...w }));
}
