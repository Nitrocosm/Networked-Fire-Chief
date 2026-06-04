import { describe, it, expect } from "vitest";
import {
  AXIAL_DIRECTIONS,
  axialDistance,
  axialToOffset,
  buildNeighborTable,
  cellIndex,
  indexToOffset,
  offsetToAxial,
} from "../src/hex/hex.ts";

describe("hex offset ↔ axial", () => {
  it("round-trips every cell on a 50×50 board", () => {
    for (let row = 0; row < 50; row++) {
      for (let col = 0; col < 50; col++) {
        const back = axialToOffset(offsetToAxial(col, row));
        expect(back).toEqual({ col, row });
      }
    }
  });

  it("round-trips flat index ↔ offset", () => {
    const W = 50;
    for (let i = 0; i < W * 50; i++) {
      const o = indexToOffset(i, W);
      expect(cellIndex(o.col, o.row, W)).toBe(i);
    }
  });
});

describe("axial distance", () => {
  it("is zero to self and symmetric", () => {
    const a = offsetToAxial(10, 12);
    const b = offsetToAxial(20, 7);
    expect(axialDistance(a, a)).toBe(0);
    expect(axialDistance(a, b)).toBe(axialDistance(b, a));
  });

  it("adjacent cells are distance 1", () => {
    const center = offsetToAxial(25, 25);
    for (const dir of AXIAL_DIRECTIONS) {
      const neighbor = { q: center.q + dir.q, r: center.r + dir.r };
      expect(axialDistance(center, neighbor)).toBe(1);
    }
  });
});

describe("neighbor table", () => {
  const W = 50;
  const H = 50;
  const table = buildNeighborTable(W, H);

  it("gives interior cells exactly 6 neighbors", () => {
    const interior = table[cellIndex(25, 25, W)]!;
    expect(interior).toHaveLength(6);
  });

  it("gives corner cells fewer neighbors (2 or 3)", () => {
    const corners = [
      cellIndex(0, 0, W),
      cellIndex(W - 1, 0, W),
      cellIndex(0, H - 1, W),
      cellIndex(W - 1, H - 1, W),
    ];
    for (const c of corners) {
      const n = table[c]!;
      expect(n.length).toBeGreaterThanOrEqual(2);
      expect(n.length).toBeLessThanOrEqual(3);
    }
  });

  it("neighbor relation is symmetric (a∈N(b) ⇒ b∈N(a))", () => {
    for (let i = 0; i < W * H; i++) {
      for (const j of table[i]!) {
        expect(table[j]).toContain(i);
      }
    }
  });

  it("never lists a cell as its own neighbor and has no out-of-range indices", () => {
    for (let i = 0; i < W * H; i++) {
      for (const j of table[i]!) {
        expect(j).not.toBe(i);
        expect(j).toBeGreaterThanOrEqual(0);
        expect(j).toBeLessThan(W * H);
      }
    }
  });
});
