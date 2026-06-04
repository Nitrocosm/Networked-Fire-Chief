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
import { cloneUnit, sortCommands, type Command } from "./units/units.ts";
import { applyMovementCommands, resolveMovement } from "./units/movement.ts";
import {
  applyCompletionEffects,
  regenSources,
  resolveRefill,
  startActions,
  stepActions,
} from "./units/actions.ts";
import { applyEvents } from "./scenario/events.ts";
import { cloneWarnings } from "./scenario/scenario.ts";
import type { RunStatus, WorldState } from "./state.ts";

export function tick(state: WorldState, commands: readonly Command[] = []): WorldState {
  // Once a round has ended it is frozen — further ticks are no-ops.
  if (state.status === "ENDED") return state;

  const { width, height, config } = state;
  const cellCount = width * height;

  // Copy-on-tick everything the step may mutate, so the input stays untouched
  // (purity). terrain mutates on firebreak; sourceLevel on refill.
  const units = state.units.map(cloneUnit);
  const terrain = state.terrain.slice();
  const sourceLevel = state.sourceLevel.slice();

  const sorted = sortCommands(commands);

  // 1. Apply commands (canonical order): movement, then actions (ACT).
  applyMovementCommands(units, width, height, sorted);
  startActions(units, terrain, state.fire, sorted, config);

  // 2. Resolve unit movement (no-stacking). Busy (acting) units don't move.
  resolveMovement(units, config);

  // 3a. Advance actions: derive suppression (pauses spread + timer), collect
  //     completions, then auto-refill stationary units.
  const { suppressed, completions } = stepActions(units, cellCount);
  resolveRefill(units, terrain, sourceLevel, config);
  regenSources(terrain, sourceLevel, config);

  // 4. Spread fire + advance burn timers + process burnouts (deduct score).
  const neighbors = getNeighborDirTable(width, height);
  const rng = new Rng(state.simRngState);
  const prev: FireBuffers = { fire: state.fire, burnTimer: state.burnTimer, immune: state.immune };
  const next: FireBuffers = {
    fire: new Uint8Array(cellCount),
    burnTimer: new Int32Array(cellCount),
    immune: new Int32Array(cellCount),
  };
  const scoreLost = stepFire(terrain, prev, suppressed, neighbors, state.wind, config, rng, next);

  // 3b. Apply completed-action effects to the post-spread buffers / terrain.
  applyCompletionEffects(completions, next, terrain, config);

  const newTick = state.tick + 1;
  let newScore = state.score - scoreLost;

  // 5. Update wind for the new tick (recomputed from keyframes — no drift).
  const newWind = resolveWind(state.windKeyframes, newTick);

  // 6. Outbreaks & warnings: apply scripted events + resolve developed fires
  //    (writes the post-spread buffers; scatter draws follow the spread draws).
  const warnings = cloneWarnings(state.warnings);
  const nextEventIndex = applyEvents(
    newTick, state.events, state.nextEventIndex, warnings, terrain, next, width, height, config, rng,
  );

  // 7. End condition. On the final tick, charge any still-in-progress fire once
  //    (DECISIONS §1.8): a cell burning at the buzzer is lost, but an extinguished
  //    cell never deducts.
  let status: RunStatus = state.status;
  if (newTick >= state.endTick) {
    status = "ENDED";
    for (let i = 0; i < cellCount; i++) {
      const f = next.fire[i]!;
      if (f === Fire.BURNING || f === Fire.IGNITING) {
        newScore -= lossValue(terrain[i]!, config);
      }
    }
  }

  return {
    ...state,
    tick: newTick,
    terrain,
    fire: next.fire,
    burnTimer: next.burnTimer,
    immune: next.immune,
    suppressed,
    sourceLevel,
    units,
    warnings,
    nextEventIndex,
    wind: newWind,
    score: newScore,
    simRngState: rng.state,
    status,
  };
}
