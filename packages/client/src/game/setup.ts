/**
 * Builds a single-player game: a seeded procedural map with seeded outbreaks,
 * shifting wind, and 6 units (2 of each role). One operator drives them all.
 */
import { cellIndex, createStateFromScenario, makeUnit, type Scenario, type Unit, type WorldState } from "@fire/sim";

export interface GameOptions {
  seed?: number;
  mapSeed?: number;
  size?: number;
  roundLengthSec?: number;
}

export function createSinglePlayerGame(opts: GameOptions = {}): WorldState {
  const W = opts.size ?? 40;
  const seed = opts.seed ?? 1337;
  const mapSeed = opts.mapSeed ?? 4242;

  const scenario: Scenario = {
    seed,
    mapSeed,
    config: {
      GRID_W: W,
      GRID_H: W,
      ROUND_LENGTH_SEC: opts.roundLengthSec ?? 300,
      OUTBREAK_SOURCE: "seeded",
    },
    windKeyframes: [
      { atTick: 0, dirX: 1, dirY: 0, speed: 0.5 },
      { atTick: 2000, dirX: 0, dirY: 1, speed: 0.8 },
      { atTick: 3500, dirX: -1, dirY: 0, speed: 0.6 },
    ],
    events: [], // seeded → outbreak schedule generated from `seed`
  };

  const state = createStateFromScenario(scenario);

  const k = Math.floor(W / 2);
  const starts: Array<[number, number]> = [
    [2, 2], [W - 3, 2], [2, W - 3], [W - 3, W - 3], [k, 2], [2, k],
  ];
  const units: Unit[] = [
    makeUnit({ id: "heli-1", role: "HELI", operatorId: "p1", cell: cellIndex(starts[0]![0], starts[0]![1], W) }),
    makeUnit({ id: "heli-2", role: "HELI", operatorId: "p1", cell: cellIndex(starts[1]![0], starts[1]![1], W) }),
    makeUnit({ id: "truck-1", role: "TRUCK", operatorId: "p2", cell: cellIndex(starts[2]![0], starts[2]![1], W) }),
    makeUnit({ id: "truck-2", role: "TRUCK", operatorId: "p2", cell: cellIndex(starts[3]![0], starts[3]![1], W) }),
    makeUnit({ id: "dozer-1", role: "DOZER", operatorId: "p3", cell: cellIndex(starts[4]![0], starts[4]![1], W) }),
    makeUnit({ id: "dozer-2", role: "DOZER", operatorId: "p3", cell: cellIndex(starts[5]![0], starts[5]![1], W) }),
  ];
  state.units.push(...units);

  return state;
}
