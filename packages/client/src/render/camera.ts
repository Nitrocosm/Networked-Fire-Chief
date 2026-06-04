/**
 * 2D pan/zoom camera. `(x, y)` is the world point shown at screen center; `zoom`
 * is screen pixels per world unit. The renderer sets a single ctx transform from
 * this and draws everything in world coordinates.
 */
import { gridWorldSize } from "./hexLayout.ts";

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  setTransform(ctx: CanvasRenderingContext2D, screenW: number, screenH: number): void {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, screenW / 2 - this.x * this.zoom, screenH / 2 - this.y * this.zoom);
  }

  screenToWorld(sx: number, sy: number, screenW: number, screenH: number): { x: number; y: number } {
    return { x: (sx - screenW / 2) / this.zoom + this.x, y: (sy - screenH / 2) / this.zoom + this.y };
  }

  /** Visible world rectangle (for culling). */
  visibleBounds(screenW: number, screenH: number): { minX: number; minY: number; maxX: number; maxY: number } {
    const halfW = screenW / 2 / this.zoom;
    const halfH = screenH / 2 / this.zoom;
    return { minX: this.x - halfW, minY: this.y - halfH, maxX: this.x + halfW, maxY: this.y + halfH };
  }

  panByScreen(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Zoom toward a screen anchor (keeps the world point under the cursor fixed). */
  zoomAt(factor: number, sx: number, sy: number, screenW: number, screenH: number): void {
    const before = this.screenToWorld(sx, sy, screenW, screenH);
    this.zoom = Math.max(0.15, Math.min(8, this.zoom * factor));
    const after = this.screenToWorld(sx, sy, screenW, screenH);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Fits the whole grid in view with a margin. */
  fit(width: number, height: number, hexSize: number, screenW: number, screenH: number): void {
    const { w, h } = gridWorldSize(width, height, hexSize);
    this.x = w / 2;
    this.y = h / 2;
    const margin = 0.92;
    this.zoom = Math.min((screenW / w) * margin, (screenH / h) * margin);
  }
}
