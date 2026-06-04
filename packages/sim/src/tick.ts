/**
 * The pure, authoritative simulation step: tick(state, commands) → newState.
 *
 * NEVER mutates its input — it allocates fresh fire buffers and returns a new
 * WorldState (static terrain/source arrays are shared by reference since the
 * tick does not write them). This purity is what makes determinism, golden
 * replay, and server-authoritative multiplayer possible.
 *
 * Step order (spec §15; unit/warning steps arrive in Phases 2–3):
 *   apply commands → [movement] → [actions] → spread fire & burnouts
 *   → update wind → [warnings/outbreaks] → check end condition
 */
import { lossValue, Fire, stepFire, type FireBuffers } from "./fire/fire.ts";
import { getNeighborDirTable } from "./hex/hex.ts";
import { Rng } from "./rng/rng.ts";
import { resolveWind } from "./wind/wind.ts";
import type { Command, RunStatus, WorldState } from "./state.ts";

export function tick(state: WorldState, _commands: readonly Command[] = []): WorldState {
  // Once a round has ended it is frozen — further ticks are no-ops.
  if (state.status === "ENDED") return state;

  const { width, height, config } = state;
  const cellCount = width * height;

  // 1. Apply commands — unit commands land in Phase 2 (no units yet).
  // 2. Resolve unit movement — Phase 2.
  // 3. Resolve unit actions (extinguish/firebreak/refill) — Phase 2.

  // 4. Spread fire + advance burn timers + process burnouts (deduct score).
  const neighbors = getNeighborDirTable(width, height);
  const rng = new Rng(state.simRngState);
  const prev: FireBuffers = { fire: state.fire, burnTimer: state.burnTimer, immune: state.immune };
  const next: FireBuffers = {
    fire: new Uint8Array(cellCount),
    burnTimer: new Int32Array(cellCount),
    immune: new Int32Array(cellCount),
  };
  const scoreLost = stepFire(state.terrain, prev, state.suppressed, neighbors, state.wind, config, rng, next);

  const newTick = state.tick + 1;
  let newScore = state.score - scoreLost;

  // 5. Update wind for the new tick (recomputed from keyframes — no drift).
  const newWind = resolveWind(state.windKeyframes, newTick);

  // 6. Warnings / outbreaks — Phase 3.

  // 7. End condition. On the final tick, charge any still-in-progress fire once
  //    (DECISIONS §1.8): a cell burning at the buzzer is lost, but an extinguished
  //    cell never deducts.
  let status: RunStatus = state.status;
  if (newTick >= state.endTick) {
    status = "ENDED";
    for (let i = 0; i < cellCount; i++) {
      const f = next.fire[i]!;
      if (f === Fire.BURNING || f === Fire.IGNITING) {
        newScore -= lossValue(state.terrain[i]!, config);
      }
    }
  }

  return {
    ...state,
    tick: newTick,
    fire: next.fire,
    burnTimer: next.burnTimer,
    immune: next.immune,
    wind: newWind,
    score: newScore,
    simRngState: rng.state,
    status,
  };
}
