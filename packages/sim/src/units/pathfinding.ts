/**
 * Deterministic A* over the hex grid.
 *
 * Determinism is non-negotiable (replay + multiplayer): the open set is a binary
 * min-heap ordered by (f, then cell index) so ties always break the same way,
 * and neighbors are expanded in the fixed neighbor-table order. Uniform step
 * cost; admissible hex-distance heuristic. Returns the path as cell indices,
 * NEXT-first and excluding the start, or null if unreachable.
 */
import { axialDistance, getNeighborTable, offsetToAxial } from "../hex/hex.ts";

/** Binary min-heap of (cell, f). Ties broken by smaller cell index. */
class OpenSet {
  private cells: number[] = [];
  private fs: number[] = [];

  get size(): number {
    return this.cells.length;
  }

  private less(i: number, j: number): boolean {
    const fi = this.fs[i]!;
    const fj = this.fs[j]!;
    if (fi !== fj) return fi < fj;
    return this.cells[i]! < this.cells[j]!;
  }

  private swap(i: number, j: number): void {
    [this.cells[i], this.cells[j]] = [this.cells[j]!, this.cells[i]!];
    [this.fs[i], this.fs[j]] = [this.fs[j]!, this.fs[i]!];
  }

  push(cell: number, f: number): void {
    this.cells.push(cell);
    this.fs.push(f);
    let i = this.cells.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(i, parent)) {
        this.swap(i, parent);
        i = parent;
      } else break;
    }
  }

  pop(): number {
    const top = this.cells[0]!;
    const lastCell = this.cells.pop()!;
    const lastF = this.fs.pop()!;
    if (this.cells.length > 0) {
      this.cells[0] = lastCell;
      this.fs[0] = lastF;
      let i = 0;
      const n = this.cells.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && this.less(l, smallest)) smallest = l;
        if (r < n && this.less(r, smallest)) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }
}

export type BlockedFn = (cell: number) => boolean;

export function findPath(
  width: number,
  height: number,
  start: number,
  goal: number,
  blocked: BlockedFn = () => false,
): number[] | null {
  if (start === goal) return [];
  if (blocked(goal)) return null;

  const neighbors = getNeighborTable(width, height);
  const cellCount = width * height;

  const gScore = new Int32Array(cellCount).fill(0x7fffffff);
  const cameFrom = new Int32Array(cellCount).fill(-1);

  const goalOff = { col: goal % width, row: (goal / width) | 0 };
  const goalAxial = offsetToAxial(goalOff.col, goalOff.row);
  const heuristic = (cell: number): number => {
    const a = offsetToAxial(cell % width, (cell / width) | 0);
    return axialDistance(a, goalAxial);
  };

  gScore[start] = 0;
  const open = new OpenSet();
  open.push(start, heuristic(start));

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) return reconstruct(cameFrom, start, goal);

    const cg = gScore[current]!;
    for (const nb of neighbors[current]!) {
      if (blocked(nb)) continue;
      const tentative = cg + 1;
      if (tentative < gScore[nb]!) {
        gScore[nb] = tentative;
        cameFrom[nb] = current;
        open.push(nb, tentative + heuristic(nb));
      }
    }
  }
  return null;
}

function reconstruct(cameFrom: Int32Array, start: number, goal: number): number[] {
  const reverse: number[] = [];
  let cur = goal;
  while (cur !== start) {
    reverse.push(cur);
    cur = cameFrom[cur]!;
  }
  reverse.reverse(); // now start-exclusive, goal-last (next-first)
  return reverse;
}
