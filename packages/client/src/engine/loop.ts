/**
 * Fixed-timestep game loop, independent of render FPS.
 *
 * A rAF-driven accumulator advances the sim a fixed number of times per real
 * second (TICKS_PER_SEC). The leftover accumulator fraction (`alpha`) is handed
 * to the renderer for interpolation. Long frames (tab switch, GC) are clamped
 * and the backlog dropped — no spiral-of-death, and we never extrapolate past
 * the latest tick.
 */
import { pushSnapshot } from "./holder.ts";
import type { LocalTransport } from "../transport/local.ts";

const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_MS = 250;

export class GameLoop {
  private raf = 0;
  private running = false;
  private last = -1;
  private acc = 0;
  private readonly tickMs: number;

  constructor(
    private readonly transport: LocalTransport,
    ticksPerSec: number,
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
      pushSnapshot(this.transport.step());
      this.acc -= this.tickMs;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) this.acc = 0; // drop backlog

    this.onFrame(Math.min(this.acc / this.tickMs, 1)); // alpha ∈ [0,1], never extrapolate
    this.raf = requestAnimationFrame(this.frame);
  };
}
