/**
 * Loops, independent of render FPS.
 *
 * GameLoop (single-player): a fixed-timestep accumulator advances the local sim
 * and hands each full snapshot to `onTick` (caller pushes the filtered view).
 * Long frames are clamped and backlog dropped — no spiral-of-death, no extrapolation.
 *
 * NetLoop (multiplayer): render-only. The server pushes snapshots; this just
 * interpolates between the last two received, using wall-clock since arrival.
 */
import type { Snapshot } from "@fire/protocol";

const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_MS = 250;

export class GameLoop {
  private raf = 0;
  private running = false;
  private last = -1;
  private acc = 0;
  private readonly tickMs: number;

  constructor(
    private readonly transport: { step(): Snapshot },
    ticksPerSec: number,
    private readonly onTick: (full: Snapshot) => void,
    private readonly onFrame: (alpha: number) => void,
  ) {
    this.tickMs = 1000 / ticksPerSec;
  }

  start(): void {
    this.running = true;
    this.last = -1;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    if (this.last < 0) {
      this.last = now;
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    let dt = now - this.last;
    this.last = now;
    if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS;
    this.acc += dt;

    let steps = 0;
    while (this.acc >= this.tickMs && steps < MAX_STEPS_PER_FRAME) {
      this.onTick(this.transport.step());
      this.acc -= this.tickMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;

    this.onFrame(Math.min(this.acc / this.tickMs, 1));
    this.raf = requestAnimationFrame(this.frame);
  };
}

export class NetLoop {
  private raf = 0;
  private running = false;

  constructor(
    private readonly tickMs: () => number,
    private readonly lastSnapshotMs: () => number,
    private readonly onFrame: (alpha: number) => void,
  ) {}

  start(): void {
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    const tm = this.tickMs();
    const alpha = tm > 0 ? Math.min(Math.max((now - this.lastSnapshotMs()) / tm, 0), 1) : 0;
    this.onFrame(alpha);
    this.raf = requestAnimationFrame(this.frame);
  };
}
