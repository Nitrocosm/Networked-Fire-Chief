/**
 * The HOT-PATH snapshot holder. A plain module singleton — deliberately NOT
 * reactive. The sim loop pushes ~15 snapshots/sec here; the rAF renderer reads
 * `current`/`previous` to interpolate. Nothing in React subscribes to this, so
 * sim ticks never trigger reconciliation (the HUD reads it on its own cadence).
 */
import type { Snapshot } from "@fire/protocol";

export interface SnapshotHolder {
  current: Snapshot | null;
  previous: Snapshot | null;
}

export const holder: SnapshotHolder = { current: null, previous: null };

export function pushSnapshot(s: Snapshot): void {
  holder.previous = holder.current ?? s;
  holder.current = s;
}

export function resetHolder(s: Snapshot): void {
  holder.current = s;
  holder.previous = s;
}
