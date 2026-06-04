/**
 * In-process transport (single-player / dev). Runs the SAME @fire/sim core the
 * authoritative server will run; differs only in that the client drives the tick
 * locally. Commands queue between ticks and are applied at the next step.
 *
 * The Phase 5 ws transport will implement the same send()/snapshot() surface.
 */
import { tick, type Command, type WorldState } from "@fire/sim";
import { toSnapshot, type Snapshot } from "@fire/protocol";

export class LocalTransport {
  private state: WorldState;
  private queue: Command[] = [];

  constructor(initial: WorldState) {
    this.state = initial;
  }

  send(cmd: Command): void {
    this.queue.push(cmd);
  }

  /** Applies queued commands, advances one tick, returns the new snapshot. */
  step(): Snapshot {
    const cmds = this.queue;
    this.queue = [];
    this.state = tick(this.state, cmds);
    return toSnapshot(this.state);
  }

  snapshot(): Snapshot {
    return toSnapshot(this.state);
  }
}
