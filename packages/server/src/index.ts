// Authoritative multiplayer host (Phase 5). Runs the SAME @fire/sim core as the
// single-player local transport; differs only in transport + command routing.
import { ROLES } from "@fire/protocol";
import { DEFAULT_CONFIG } from "@fire/sim";

export function describeServer(): string {
  return `@fire/server placeholder — roles=${ROLES.join(",")} grid=${DEFAULT_CONFIG.GRID_W}x${DEFAULT_CONFIG.GRID_H}`;
}
