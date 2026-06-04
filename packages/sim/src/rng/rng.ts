/**
 * Seeded PRNG — mulberry32. State is a single int32, so it serializes inside
 * WorldState and survives snapshot round-trips (reconnection). Uses only integer
 * ops (`Math.imul`, shifts) — no transcendentals, bit-identical across engines.
 *
 * Determinism contract: the number AND order of draws per tick must be a pure
 * function of state. The fire CA enforces this by iterating cells in flat-index
 * order and drawing exactly once per eligible cell.
 */
export class Rng {
  state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Next uint32 in [0, 2^32). */
  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Next float in [0, 1). */
  nextFloat(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  /** Integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.nextFloat() * n);
  }

  clone(): Rng {
    return new Rng(this.state);
  }
}

/**
 * Derives an independent stream seed from a master seed + tag (FNV-1a style mix).
 * Lets map-gen / scenario / sim use separate streams so tuning fire rolls does
 * NOT shift map generation (and vice-versa) — keeps golden fixtures stable.
 */
export function deriveSeed(masterSeed: number, tag: string): number {
  let h = (masterSeed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < tag.length; i++) {
    h ^= tag.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // FNV-32 prime
  }
  // Final avalanche so adjacent tags/seeds don't yield adjacent streams.
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

export const RNG_STREAMS = {
  SIM: "sim",
  MAP_GEN: "map-gen",
  SCENARIO: "scenario",
} as const;
