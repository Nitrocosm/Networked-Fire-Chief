/**
 * The HOT-PATH snapshot holder. A plain module singleton — deliberately NOT
 * reactive. Stores the renderable ClientView (single-player pushes the full
 * snapshot, already role-filtered at push time; multiplayer pushes the
 * server-filtered view). The rAF renderer reads current/previous to interpolate.
 */
import type { ClientView } from "@fire/protocol";

export interface SnapshotHolder {
  current: ClientView | null;
  previous: ClientView | null;
}

export const holder: SnapshotHolder = { current: null, previous: null };

export function pushSnapshot(s: ClientView): void {
  holder.previous = holder.current ?? s;
  holder.current = s;
}

export function resetHolder(s: ClientView): void {
  holder.current = s;
  holder.previous = s;
}

export function clearHolder(): void {
  holder.current = null;
  holder.previous = null;
}
