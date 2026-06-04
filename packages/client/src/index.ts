// Browser client (Phase 4): Vite + React shell + layered Canvas renderer reading
// role-filtered snapshots. The 15Hz snapshot rides a NON-reactive holder read by
// the rAF loop; Zustand holds only cold UI state (selection, role, lobby, toggles).
import { ROLE_VISIBILITY, type Role } from "@fire/protocol";
import { DEFAULT_CONFIG } from "@fire/sim";

export function canSeeWind(role: Role): boolean {
  return ROLE_VISIBILITY[role].wind;
}

export const GRID_DIMS = { w: DEFAULT_CONFIG.GRID_W, h: DEFAULT_CONFIG.GRID_H };
