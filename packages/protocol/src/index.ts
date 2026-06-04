// Wire protocol + role-filtering. Shared VERBATIM by the local (single-player)
// and ws (multiplayer) transports so filtering can never diverge between them.
//
// Phase 3/4 will add `filterSnapshotForRole(snapshot, role) -> RoleSnapshot`
// once the sim `Snapshot` type exists. The filtered-send type contract (a full
// Snapshot is NOT assignable to RoleSnapshot) is enforced here.

export type Role = "HELI" | "TRUCK" | "DOZER";

export const ROLES: readonly Role[] = ["HELI", "TRUCK", "DOZER"] as const;

/** Per-role visibility matrix (DECISIONS / spec §13). Drives snapshot filtering. */
export const ROLE_VISIBILITY: Record<Role, { wind: boolean; warnings: boolean }> = {
  HELI: { wind: true, warnings: false }, // blind to warnings
  TRUCK: { wind: true, warnings: true },
  DOZER: { wind: false, warnings: true }, // blind to wind (incl. forecast)
};
