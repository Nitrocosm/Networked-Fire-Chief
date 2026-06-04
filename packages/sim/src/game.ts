/**
 * Standard game builder — composes a seeded map, seeded outbreaks, shifting wind,
 * and 6 units (2 per role) into an initial WorldState. Shared by the single-player
 * client and the authoritative multiplayer server so both build the SAME world.
 */
import { cellIndex } from "./hex/hex.ts";
import { makeUnit, type Unit } from "./units/units.ts";
import { Terrain } from "./fire/fire.ts";
import { createStateFromScenario } from "./scenario/loader.ts";
import { sortEvents, type Scenario, type ScenarioEvent } from "./scenario/scenario.ts";
import type { WorldState } from "./state.ts";

export interface GameOptions {
  seed?: number;
  mapSeed?: number;
  size?: number;
  roundLengthSec?: number;
  windSpeed?: number;
  outbreakDensity?: number;
}

export function buildGame(options: GameOptions = {}): WorldState {
  const W = options.size ?? 40;
  const seed = options.seed ?? 1337;
  const mapSeed = options.mapSeed ?? 4242;
  const windSpeed = options.windSpeed ?? 0.4;

  const scenario: Scenario = {
    seed,
    mapSeed,
    config: {
      GRID_W: W,
      GRID_H: W,
      ROUND_LENGTH_SEC: options.roundLengthSec ?? 300,
      OUTBREAK_SOURCE: "seeded",
      OUTBREAK_DENSITY_PER_5MIN: options.outbreakDensity ?? 5,
    },
    windKeyframes: [
      { atTick: 0, dirX: 1, dirY: 0, speed: windSpeed },
      { atTick: 2400, dirX: 0, dirY: 1, speed: windSpeed + 0.15 },
      { atTick: 4200, dirX: -1, dirY: 0.3, speed: windSpeed },
    ],
    events: [],
  };

  const state = createStateFromScenario(scenario);

  const k = Math.floor(W / 2);
  const starts: Array<[number, number]> = [
    [2, 2], [W - 3, 2], [2, W - 3], [W - 3, W - 3], [k, 2], [2, k],
  ];
  const units: Unit[] = [
    makeUnit({ id: "heli-1", role: "HELI", operatorId: "HELI", cell: cellIndex(starts[0]![0], starts[0]![1], W) }),
    makeUnit({ id: "heli-2", role: "HELI", operatorId: "HELI", cell: cellIndex(starts[1]![0], starts[1]![1], W) }),
    makeUnit({ id: "truck-1", role: "TRUCK", operatorId: "TRUCK", cell: cellIndex(starts[2]![0], starts[2]![1], W) }),
    makeUnit({ id: "truck-2", role: "TRUCK", operatorId: "TRUCK", cell: cellIndex(starts[3]![0], starts[3]![1], W) }),
    makeUnit({ id: "dozer-1", role: "DOZER", operatorId: "DOZER", cell: cellIndex(starts[4]![0], starts[4]![1], W) }),
    makeUnit({ id: "dozer-2", role: "DOZER", operatorId: "DOZER", cell: cellIndex(starts[5]![0], starts[5]![1], W) }),
  ];
  state.units.push(...units);

  const grass: number[] = [];
  for (let i = 0; i < state.terrain.length; i++) if (state.terrain[i] === Terrain.GRASSLAND) grass.push(i);
  if (grass.length > 0) {
    const earlies: ScenarioEvent[] = [60, 240].map((atTick, idx) => ({
      atTick,
      type: "WARNING",
      id: `early-${idx}`,
      center: grass[(idx * 1009 + 17) % grass.length]!,
    }));
    state.events = sortEvents([...state.events, ...earlies]);
  }

  return state;
}
