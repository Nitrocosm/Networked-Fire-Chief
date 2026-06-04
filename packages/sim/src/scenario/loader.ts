/**
 * Builds an initial WorldState from a (sim-native) Scenario: seeded map from
 * mapSeed, then either the scripted events or — when OUTBREAK_SOURCE is "seeded"
 * and no events were supplied — a seeded outbreak schedule.
 *
 * Separate from state.ts to avoid a state→scenario→state import cycle.
 */
import { makeConfig } from "../config.ts";
import { createInitialState, type WorldState } from "../state.ts";
import { generateMap, generateOutbreaks } from "./procgen.ts";
import type { Scenario } from "./scenario.ts";

export function createStateFromScenario(scenario: Scenario): WorldState {
  const config = makeConfig(scenario.config);
  const terrain = generateMap(scenario.mapSeed, config);

  let events = scenario.events;
  if (config.OUTBREAK_SOURCE === "seeded" && events.length === 0) {
    events = generateOutbreaks(scenario.seed, config, terrain);
  }

  return createInitialState({
    seed: scenario.seed,
    config: scenario.config,
    terrain,
    windKeyframes: scenario.windKeyframes,
    events,
  });
}
