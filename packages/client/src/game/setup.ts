/**
 * Single-player game = the shared @fire/sim buildGame. The same builder runs on
 * the authoritative server, so single-player and multiplayer share one world.
 */
import { buildGame, type GameOptions, type WorldState } from "@fire/sim";

export type { GameOptions };

export function createSinglePlayerGame(opts: GameOptions = {}): WorldState {
  return buildGame(opts);
}
