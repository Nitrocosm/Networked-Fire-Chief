import { describe, it, expect } from "vitest";
import { Rng, deriveSeed } from "../src/rng/rng.ts";
import { CanonicalWriter, fnv1a64, hashCanonical } from "../src/hash/canonical.ts";

describe("Rng (mulberry32)", () => {
  it("is deterministic for a given seed", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    for (let i = 0; i < 1000; i++) expect(a.nextU32()).toBe(b.nextU32());
  });

  it("differs across seeds", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let same = 0;
    for (let i = 0; i < 1000; i++) if (a.nextU32() === b.nextU32()) same++;
    expect(same).toBeLessThan(5); // essentially never collides
  });

  it("serializes via state — a clone continues the identical stream", () => {
    const a = new Rng(999);
    for (let i = 0; i < 50; i++) a.nextU32();
    const resumed = new Rng(a.state);
    for (let i = 0; i < 50; i++) expect(resumed.nextU32()).toBe(a.nextU32());
  });

  it("nextFloat stays in [0,1) with ~0.5 mean", () => {
    const r = new Rng(42);
    let sum = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
    }
    expect(sum / N).toBeGreaterThan(0.49);
    expect(sum / N).toBeLessThan(0.51);
  });

  it("nextInt(n) stays in [0,n)", () => {
    const r = new Rng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r.nextInt(6);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe("deriveSeed", () => {
  it("is stable for the same inputs", () => {
    expect(deriveSeed(100, "sim")).toBe(deriveSeed(100, "sim"));
  });

  it("yields independent streams per tag and per master seed", () => {
    expect(deriveSeed(100, "sim")).not.toBe(deriveSeed(100, "map-gen"));
    expect(deriveSeed(100, "sim")).not.toBe(deriveSeed(101, "sim"));
  });
});

describe("canonical hashing", () => {
  it("is stable for identical field streams", () => {
    const h1 = hashCanonical((w) => w.u32(1).f64(3.14).str("HELI").bool(true));
    const h2 = hashCanonical((w) => w.u32(1).f64(3.14).str("HELI").bool(true));
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
  });

  it("normalizes -0 and +0 to the same bytes", () => {
    const neg = hashCanonical((w) => w.f64(-0));
    const pos = hashCanonical((w) => w.f64(0));
    expect(neg).toBe(pos);
  });

  it("detects any field change", () => {
    const base = hashCanonical((w) => w.u32(1).f64(2.5));
    expect(hashCanonical((w) => w.u32(1).f64(2.5000001))).not.toBe(base);
    expect(hashCanonical((w) => w.u32(2).f64(2.5))).not.toBe(base);
  });

  it("byte order is fixed and known (regression vector)", () => {
    // Locks the encoder so an accidental format change is caught.
    expect(fnv1a64(new CanonicalWriter().u32(0x01020304).toBytes())).toBe(
      fnv1a64(Uint8Array.from([0x01, 0x02, 0x03, 0x04])),
    );
  });
});
