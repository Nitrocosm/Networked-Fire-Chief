/**
 * Hex grid geometry.
 *
 * CONVENTION (DECISIONS §7): the canonical cell identity is AXIAL `{q, r}` and all
 * neighbor/distance math is axial. The 50×50 board is a rectangle laid out in
 * "odd-r" OFFSET coordinates (`{col, row}`, odd rows shifted right, pointy-top).
 * Offset is the storage/rendering bridge ONLY — never do neighbor math in offset.
 *
 * The flat grid array is indexed ROW-MAJOR by offset: `index = row * W + col`.
 * This fixed order is the canonical RNG-draw order the fire CA depends on.
 */

export interface Axial {
  q: number;
  r: number;
}

export interface Offset {
  col: number;
  row: number;
}

// odd-r offset ↔ axial (Red Blob Games). Rows are always ≥ 0 here, so `& 1` is safe.
export function offsetToAxial(col: number, row: number): Axial {
  const q = col - (row - (row & 1)) / 2;
  return { q, r: row };
}

export function axialToOffset(a: Axial): Offset {
  const col = a.q + (a.r - (a.r & 1)) / 2;
  return { col, row: a.r };
}

/** The 6 axial neighbor directions, in a FIXED order (determinism). */
export const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
] as const;

export function axialAdd(a: Axial, b: Axial): Axial {
  return { q: a.q + b.q, r: a.r + b.r };
}

/** Hex (cube) distance via axial coords. Pure integer math — no transcendentals. */
export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const abs = (n: number) => (n < 0 ? -n : n);
  return (abs(dq) + abs(dq + dr) + abs(dr)) / 2;
}

// ── Flat indexing over the rectangular offset board ───────────────────────────

export function cellIndex(col: number, row: number, width: number): number {
  return row * width + col;
}

export function indexToOffset(index: number, width: number): Offset {
  return { col: index % width, row: Math.floor(index / width) };
}

export function inBounds(col: number, row: number, width: number, height: number): boolean {
  return col >= 0 && col < width && row >= 0 && row < height;
}

/**
 * Precomputes, for every cell index, its in-bounds neighbor indices in fixed
 * AXIAL_DIRECTIONS order. Built once per map; the CA reads it every tick.
 * Iterating axial directions (not offset) keeps neighbor logic parity-agnostic.
 */
export function buildNeighborTable(width: number, height: number): readonly (readonly number[])[] {
  const table: number[][] = new Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const axial = offsetToAxial(col, row);
      const neighbors: number[] = [];
      for (const dir of AXIAL_DIRECTIONS) {
        const n = axialToOffset(axialAdd(axial, dir));
        if (inBounds(n.col, n.row, width, height)) {
          neighbors.push(cellIndex(n.col, n.row, width));
        }
      }
      table[cellIndex(col, row, width)] = neighbors;
    }
  }
  return table;
}

/** A neighbor of a cell, plus the direction fire travels FROM that neighbor INTO the cell. */
export interface NeighborDir {
  /** Flat index of the neighboring cell. */
  idx: number;
  /** AXIAL_DIRECTIONS index of the spread direction (neighbor → this cell), for windFactor. */
  spreadDir: number;
}

/**
 * Like `buildNeighborTable`, but each entry also carries the spread direction
 * (the fire travels from the neighbor INTO this cell). If a neighbor sits in
 * direction `d` from this cell, the inbound spread direction is the reverse,
 * `(d + 3) % 6`.
 */
export function buildNeighborDirTable(
  width: number,
  height: number,
): readonly (readonly NeighborDir[])[] {
  const table: NeighborDir[][] = new Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const axial = offsetToAxial(col, row);
      const entries: NeighborDir[] = [];
      for (let d = 0; d < AXIAL_DIRECTIONS.length; d++) {
        const n = axialToOffset(axialAdd(axial, AXIAL_DIRECTIONS[d]!));
        if (inBounds(n.col, n.row, width, height)) {
          entries.push({ idx: cellIndex(n.col, n.row, width), spreadDir: (d + 3) % 6 });
        }
      }
      table[cellIndex(col, row, width)] = entries;
    }
  }
  return table;
}

/**
 * Memoized board geometry, keyed by dimensions. The neighbor table is a pure
 * function of (width, height) — static derived data, kept OUT of WorldState so
 * it never bloats serialization or golden hashes. Memoizing a pure function
 * does not affect determinism.
 */
const geometryCache = new Map<string, readonly (readonly NeighborDir[])[]>();

export function getNeighborDirTable(
  width: number,
  height: number,
): readonly (readonly NeighborDir[])[] {
  const key = `${width}x${height}`;
  let table = geometryCache.get(key);
  if (!table) {
    table = buildNeighborDirTable(width, height);
    geometryCache.set(key, table);
  }
  return table;
}
