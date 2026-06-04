/**
 * Canonical serialization + hashing for golden determinism tests.
 *
 * We do NOT hash `JSON.stringify(state)` — key order, `-0`, and float formatting
 * are unreliable. Instead, callers append fields in a FIXED order to a
 * `CanonicalWriter` (raw IEEE-754 bytes, `-0` normalized), then hash the bytes
 * with 64-bit FNV-1a. The exact same byte stream + hash must be reproducible in
 * Node and in Chromium — that cross-engine match is the Phase 1 gate.
 */
export class CanonicalWriter {
  private readonly bytes: number[] = [];
  private readonly scratch = new DataView(new ArrayBuffer(8));

  u32(n: number): this {
    const v = n >>> 0;
    this.bytes.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    return this;
  }

  i32(n: number): this {
    return this.u32(n | 0);
  }

  /** Writes a float64 as raw big-endian bytes, normalizing -0 → +0. */
  f64(n: number): this {
    this.scratch.setFloat64(0, n === 0 ? 0 : n, false);
    for (let i = 0; i < 8; i++) this.bytes.push(this.scratch.getUint8(i));
    return this;
  }

  bool(b: boolean): this {
    this.bytes.push(b ? 1 : 0);
    return this;
  }

  /** Length-prefixed UTF-16 code units (ids/enums are ASCII here). */
  str(s: string): this {
    this.u32(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.bytes.push((c >>> 8) & 0xff, c & 0xff);
    }
    return this;
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

const FNV64_OFFSET = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const MASK64 = 0xffffffffffffffffn;

/** 64-bit FNV-1a → 16-char lowercase hex. Pure BigInt, engine-stable. */
export function fnv1a64(data: Uint8Array): string {
  let h = FNV64_OFFSET;
  for (let i = 0; i < data.length; i++) {
    h ^= BigInt(data[i]!);
    h = (h * FNV64_PRIME) & MASK64;
  }
  return h.toString(16).padStart(16, "0");
}

/** Convenience: hash whatever a writer-filling callback produced. */
export function hashCanonical(fill: (w: CanonicalWriter) => void): string {
  const w = new CanonicalWriter();
  fill(w);
  return fnv1a64(w.toBytes());
}
