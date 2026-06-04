import { describe, it, expect } from "vitest";
import { axialDistance, cellIndex, getNeighborTable, indexToOffset, offsetToAxial } from "../src/hex/hex.ts";
import { findPath } from "../src/units/pathfinding.ts";

const W = 20;
const H = 20;

function hexDist(a: number, b: number): number {
  const oa = indexToOffset(a, W);
  const ob = indexToOffset(b, W);
  return axialDistance(offsetToAxial(oa.col, oa.row), offsetToAxial(ob.col, ob.row));
}

function assertContiguous(start: number, path: number[]): void {
  const neighbors = getNeighborTable(W, H);
  let cur = start;
  for (const step of path) {
    expect(neighbors[cur]!).toContain(step); // each step is adjacent to the last
    cur = step;
  }
}

describe("hex A* pathfinding", () => {
  it("returns empty path when already at the goal", () => {
    expect(findPath(W, H, cellIndex(3, 3, W), cellIndex(3, 3, W))).toEqual([]);
  });

  it("finds a shortest path: length equals hex distance with no obstacles", () => {
    const start = cellIndex(2, 2, W);
    const goal = cellIndex(15, 11, W);
    const path = findPath(W, H, start, goal)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toBe(goal);
    expect(path.length).toBe(hexDist(start, goal));
    assertContiguous(start, path);
  });

  it("is deterministic — identical inputs yield the identical path", () => {
    const start = cellIndex(0, 0, W);
    const goal = cellIndex(19, 19, W);
    expect(findPath(W, H, start, goal)).toEqual(findPath(W, H, start, goal));
  });

  it("routes around blocked cells and never steps on one", () => {
    const start = cellIndex(5, 10, W);
    const goal = cellIndex(12, 10, W);
    // A vertical wall at col 8, leaving a gap at row 0.
    const wall = new Set<number>();
    for (let row = 1; row < H; row++) wall.add(cellIndex(8, row, W));
    const path = findPath(W, H, start, goal, (c) => wall.has(c))!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toBe(goal);
    for (const step of path) expect(wall.has(step)).toBe(false);
    assertContiguous(start, path);
    expect(path.length).toBeGreaterThan(hexDist(start, goal)); // detour costs extra
  });

  it("returns null when the goal is unreachable (fully walled off)", () => {
    const goal = cellIndex(10, 10, W);
    const ring = new Set(getNeighborTable(W, H)[goal]!);
    const path = findPath(W, H, cellIndex(0, 0, W), goal, (c) => ring.has(c));
    expect(path).toBeNull();
  });

  it("returns null when the goal itself is blocked", () => {
    const goal = cellIndex(10, 10, W);
    expect(findPath(W, H, cellIndex(0, 0, W), goal, (c) => c === goal)).toBeNull();
  });
});
