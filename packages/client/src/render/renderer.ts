/**
 * Canvas2D renderer. Draws everything in WORLD coordinates under a single camera
 * transform: hex terrain, fire states, depletable sources, warning rings, unit
 * silhouettes/paths, and interpolated units. Viewport culling keeps zoomed-in
 * views cheap; the full 50×50 is well within Canvas2D's budget.
 *
 * Reads a ClientView (already role-filtered) — so a hidden field is simply
 * absent (warnings === null) and nothing can leak into the picture.
 */
import { Terrain } from "@fire/sim";
import type { ClientView, UnitView } from "@fire/protocol";
import { Camera } from "./camera.ts";
import { cellCenter, hexPath } from "./hexLayout.ts";
import { fireColor, ROLE_COLOR, TERRAIN_COLOR } from "./colors.ts";

const HEX_SIZE = 1; // world units; the camera handles screen scale
const SQRT3 = Math.sqrt(3);

export interface DrawOpts {
  selectedUnitId: string | null;
  hoverCell: number | null;
}

function unitWorldPos(u: UnitView, width: number): { x: number; y: number } {
  const base = cellCenter(u.cell % width, Math.floor(u.cell / width), HEX_SIZE);
  if (u.nextCell === null) return base;
  const next = cellCenter(u.nextCell % width, Math.floor(u.nextCell / width), HEX_SIZE);
  return { x: base.x + (next.x - base.x) * u.stepProgress, y: base.y + (next.y - base.y) * u.stepProgress };
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  draw(view: ClientView, prev: ClientView, alpha: number, camera: Camera, opts: DrawOpts): void {
    const { ctx } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0c0e14";
    ctx.fillRect(0, 0, W, H);
    camera.setTransform(ctx, W, H);

    const b = camera.visibleBounds(W, H);
    const { width, height, terrain, fire, sourceLevel } = view;

    // ── Cells: terrain + fire + sources ────────────────────────────────────
    for (let i = 0; i < width * height; i++) {
      const col = i % width;
      const row = (i / width) | 0;
      const c = cellCenter(col, row, HEX_SIZE);
      if (c.x < b.minX - 1 || c.x > b.maxX + 1 || c.y < b.minY - 1 || c.y > b.maxY + 1) continue;

      const fc = fireColor(fire[i]!);
      hexPath(ctx, c.x, c.y, HEX_SIZE * 0.98);
      ctx.fillStyle = fc ?? TERRAIN_COLOR[terrain[i]!] ?? "#333";
      ctx.fill();

      // Source level: inner dot shrinks as it depletes.
      const t = terrain[i]!;
      if (fc === null && (t === Terrain.WATER_SOURCE || t === Terrain.FUEL_SOURCE)) {
        const lvl = sourceLevel[i]!;
        if (lvl > 0) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, HEX_SIZE * 0.4 * lvl, 0, Math.PI * 2);
          ctx.fillStyle = t === Terrain.WATER_SOURCE ? "#7cc4ff" : "#c79bff";
          ctx.fill();
        }
      }
    }

    // ── Hover highlight ────────────────────────────────────────────────────
    if (opts.hoverCell !== null && opts.hoverCell < width * height) {
      const c = cellCenter(opts.hoverCell % width, (opts.hoverCell / width) | 0, HEX_SIZE);
      hexPath(ctx, c.x, c.y, HEX_SIZE * 0.98);
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
    }

    // ── Warning rings (null when the role can't see them) ──────────────────
    if (view.warnings) {
      ctx.lineWidth = 0.12;
      ctx.setLineDash([0.4, 0.3]);
      for (const w of view.warnings) {
        const c = cellCenter(w.center % width, (w.center / width) | 0, HEX_SIZE);
        ctx.beginPath();
        ctx.arc(c.x, c.y, (w.radius + 0.5) * SQRT3 * HEX_SIZE, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,170,40,0.9)";
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // ── Unit silhouettes + paths ───────────────────────────────────────────
    const prevById = new Map<string, UnitView>();
    for (const u of prev.units) prevById.set(u.id, u);

    for (const u of view.units) {
      if (u.destination === null) continue;
      const d = cellCenter(u.destination % width, (u.destination / width) | 0, HEX_SIZE);
      const from = unitWorldPos(u, width);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(d.x, d.y, HEX_SIZE * 0.38, 0, Math.PI * 2);
      ctx.setLineDash([0.18, 0.14]);
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = ROLE_COLOR[u.role] ?? "#fff";
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Units (interpolated) ───────────────────────────────────────────────
    for (const u of view.units) {
      const cur = unitWorldPos(u, width);
      const p = prevById.get(u.id);
      const pos = p ? { x: lerp(unitWorldPos(p, width).x, cur.x, alpha), y: lerp(unitWorldPos(p, width).y, cur.y, alpha) } : cur;
      this.drawUnit(u, pos.x, pos.y, opts.selectedUnitId === u.id);
    }
  }

  private drawUnit(u: UnitView, x: number, y: number, selected: boolean): void {
    const { ctx } = this;
    const r = HEX_SIZE * 0.42;

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ROLE_COLOR[u.role] ?? "#fff";
    ctx.fill();
    ctx.lineWidth = selected ? 0.14 : 0.07;
    ctx.strokeStyle = selected ? "#ffffff" : "rgba(0,0,0,0.6)";
    ctx.stroke();

    // Action progress arc.
    if (u.action) {
      ctx.beginPath();
      ctx.arc(x, y, r + 0.16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u.action.progress);
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }

    // Water (blue) + fuel (amber) bars under the unit.
    const bw = r * 1.6;
    const bx = x - bw / 2;
    const by = y + r + 0.12;
    bar(ctx, bx, by, bw, 0.12, u.water, "#4aa3ff");
    bar(ctx, bx, by + 0.16, bw, 0.12, u.fuel, "#ffb347");
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, v: number, color: string): void {
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), h);
}
