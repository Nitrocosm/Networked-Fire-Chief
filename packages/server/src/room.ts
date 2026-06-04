/**
 * Authoritative game room: one sim instance. Runs the SAME @fire/sim `tick`
 * verbatim — the server is not a reimplementation, it's the same core with
 * server-side command routing + role-filtered snapshots.
 *
 * Commands are accepted only from the role that OWNS the targeted unit (the
 * anti-cheat boundary), queued, and applied at the next tick in the core's
 * canonical order — so wire arrival order is irrelevant to the outcome.
 */
import { tick, type Command, type WorldState } from "@fire/sim";
import { filterForRole, toSnapshot, type Role, type RoleSnapshot, type Snapshot } from "@fire/protocol";

export class Room {
  private state: WorldState;
  private queue: Command[] = [];

  constructor(initial: WorldState) {
    this.state = initial;
  }

  /** Accepts a command from `role` iff it owns the targeted unit. Returns acceptance. */
  submit(role: Role, command: Command): boolean {
    const unit = this.state.units.find((u) => u.id === command.unitId);
    if (!unit || unit.role !== role) return false;
    this.queue.push(command);
    return true;
  }

  /** Applies queued commands and advances one tick. */
  tick(): void {
    const cmds = this.queue;
    this.queue = [];
    this.state = tick(this.state, cmds);
  }

  get tickNumber(): number {
    return this.state.tick;
  }

  get worldState(): WorldState {
    return this.state;
  }

  get ended(): boolean {
    return this.state.status === "ENDED";
  }

  /** Complete current state for a role — a reconnecting client adopts this as-is. */
  snapshotFor(role: Role): RoleSnapshot {
    return filterForRole(toSnapshot(this.state), role);
  }

  fullSnapshot(): Snapshot {
    return toSnapshot(this.state);
  }

  unitIdsFor(role: Role): string[] {
    return this.state.units.filter((u) => u.role === role).map((u) => u.id);
  }
}
