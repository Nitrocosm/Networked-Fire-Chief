/**
 * Pointy-top hex pixel geometry (render-only; offset rows are purely visual).
 * Matches the sim's odd-r convention: odd rows shift right by half a hex width.
 * Math.cos/sin are fine here — this is the renderer, not the deterministic core.
 */
const SQRT3 = Math.sqrt(3);

/** World-space pixel center of an offset cell, for a given hex size (center→corner). */
export function cellCenter(col: number, row: number, size: number): { x: number; y: number } {
  const x = SQRT3 * size * (col + 0.5 * (row & 1));
  const y = 1.5 * size * row;
  return { x, y };
}

/** Unit corner offsets for a pointy-top hex (vertices at top/bottom). */
export const HEX_CORNERS: ReadonlyArray<{ dx: number; dy: number }> = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (30 + 60 * i);
  return { dx: Math.cos(a), dy: Math.sin(a) };
});

/** Traces a hex polygon path (does not fill/stroke). */
export function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const c = HEX_CORNERS[i]!;
    const x = cx + size * c.dx;
    const y = cy + size * c.dy;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Nearest cell to a world point (estimate + 3×3 search), or null if off-grid. */
export function worldToCell(wx: number, wy: number, size: number, width: number, height: number): number | null {
  const approxRow = Math.round(wy / (1.5 * size));
  const approxCol = Math.round(wx / (SQRT3 * size) - 0.5 * (approxRow & 1));
  let best = -1;
  let bestD = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = approxRow + dr;
      const c = approxCol + dc;
      if (r < 0 || r >= height || c < 0 || c >= width) continue;
      const ctr = cellCenter(c, r, size);
      const d = (ctr.x - wx) ** 2 + (ctr.y - wy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = r * width + c;
      }
    }
  }
  return best >= 0 ? best : null;
}

/** World-space bounds of the whole grid (for fitting the camera). */
export function gridWorldSize(width: number, height: number, size: number): { w: number; h: number } {
  return {
    w: SQRT3 * size * (width + 0.5),
    h: 1.5 * size * height + 0.5 * size,
  };
}
