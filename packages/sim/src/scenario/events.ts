/**
 * Outbreak engine: applies scripted events and resolves developed fires.
 *
 * Runs in tick step 6 (after fire spread), writing the post-spread buffers.
 * - WARNING: creates a pending warning (developed fire `leadTime` ticks later).
 * - IGNITE: god-mode — lights ANY flammable cell immediately (DECISIONS §1.9).
 * - CANCEL_WARNING: removes a pending warning by its author id.
 * Developed fires scatter to a flammable, unburnt cell WITHIN the radius but NOT
 * the exact center (the gamble that keeps dozer preemption skill-based); if no
 * such cell exists the warning FIZZLES (DECISIONS §3.3).
 */
import { type Config, secondsToTicks } from "../config.ts";
import { burnDurationTicks, Fire, type FireBuffers, isFlammable } from "../fire/fire.ts";
import { axialDistance, indexToOffset, offsetToAxial } from "../hex/hex.ts";
import type { Rng } from "../rng/rng.ts";
import type { ScenarioEvent, Warning } from "./scenario.ts";

function ignite(next: FireBuffers, terrain: Uint8Array, cell: number, cfg: Config): void {
  next.fire[cell] = Fire.BURNING;
  next.burnTimer[cell] = burnDurationTicks(terrain[cell]!, cfg);
}

/** Flammable, unburnt cells within [1, radius] of the warning center, in flat order. */
function scatterCandidates(w: Warning, terrain: Uint8Array, next: FireBuffers, width: number, height: number): number[] {
  const center = indexToOffset(w.center, width);
  const aCenter = offsetToAxial(center.col, center.row);
  const out: number[] = [];
  const R = w.radius;
  for (let row = center.row - R; row <= center.row + R; row++) {
    if (row < 0 || row >= height) continue;
    for (let col = center.col - R; col <= center.col + R; col++) {
      if (col < 0 || col >= width) continue;
      const dist = axialDistance(aCenter, offsetToAxial(col, row));
      if (dist < 1 || dist > R) continue; // exclude the exact center
      const idx = row * width + col;
      if (isFlammable(terrain[idx]!) && next.fire[idx] === Fire.UNBURNT) out.push(idx);
    }
  }
  return out;
}

/**
 * Applies all events due at `tick`, then resolves warnings igniting this tick.
 * Mutates `warnings` (in place) and the `next` fire buffers. Returns the new
 * event cursor. Scatter draws use the shared sim RNG (after the spread draws).
 */
export function applyEvents(
  tick: number,
  events: readonly ScenarioEvent[],
  cursor: number,
  warnings: Warning[],
  terrain: Uint8Array,
  next: FireBuffers,
  width: number,
  height: number,
  cfg: Config,
  rng: Rng,
): number {
  const defaultLead = secondsToTicks(cfg.WARNING_LEAD_TIME_SEC, cfg.TICKS_PER_SEC);

  let c = cursor;
  while (c < events.length && events[c]!.atTick <= tick) {
    const ev = events[c]!;
    if (ev.type === "WARNING") {
      warnings.push({
        id: ev.id,
        center: ev.center,
        igniteAtTick: tick + (ev.leadTime ?? defaultLead),
        radius: cfg.IGNITION_SCATTER_RADIUS,
      });
    } else if (ev.type === "IGNITE") {
      if (isFlammable(terrain[ev.cell]!)) ignite(next, terrain, ev.cell, cfg);
    } else {
      const i = warnings.findIndex((w) => w.id === ev.id);
      if (i >= 0) warnings.splice(i, 1);
    }
    c++;
  }

  // Resolve warnings developing this tick; keep the rest (preserve order).
  const remaining: Warning[] = [];
  for (const w of warnings) {
    if (w.igniteAtTick !== tick) {
      remaining.push(w);
      continue;
    }
    const candidates = scatterCandidates(w, terrain, next, width, height);
    if (candidates.length > 0) {
      ignite(next, terrain, candidates[rng.nextInt(candidates.length)]!, cfg);
    }
    // else fizzle — warning is consumed regardless.
  }
  warnings.length = 0;
  for (const w of remaining) warnings.push(w);

  return c;
}
