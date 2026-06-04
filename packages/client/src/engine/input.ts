/**
 * Pointer + wheel input → camera control, selection, and commands.
 *
 * - Wheel: zoom toward cursor.
 * - Drag starting on a unit: SET_WAYPOINT to the cell under the cursor on release.
 * - Drag starting on empty ground: pan the camera.
 * - Click (no drag) on a unit: select it (and adopt its role); if it's moving,
 *   CANCEL_MOVE; otherwise ACT (engine decides extinguish/firebreak/nothing).
 * - Click on empty ground with a unit selected: SET_WAYPOINT there.
 */
import type { Snapshot } from "@fire/protocol";
import type { Camera } from "../render/camera.ts";
import { unitWorldPos, worldToCell } from "../render/hexLayout.ts";
import { sendCommand } from "./session.ts";
import { useUi } from "../state/store.ts";

const CLICK_THRESHOLD_PX = 4;
const UNIT_HIT_RADIUS = 0.6; // world units

function unitAt(wx: number, wy: number, snap: Snapshot): string | null {
  let best: string | null = null;
  let bestD = UNIT_HIT_RADIUS * UNIT_HIT_RADIUS;
  for (const u of snap.units) {
    const p = unitWorldPos(u.cell, u.nextCell, u.stepProgress, snap.width, 1);
    const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = u.id;
    }
  }
  return best;
}

export class GameInput {
  private mode: "none" | "pan" | "unit" = "none";
  private grabbedUnit: string | null = null;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private moved = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly getSnapshot: () => Snapshot | null,
  ) {}

  private dpr(): number {
    return window.devicePixelRatio || 1;
  }

  private deviceXY(e: PointerEvent | WheelEvent): { sx: number; sy: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { sx: (e.clientX - rect.left) * this.dpr(), sy: (e.clientY - rect.top) * this.dpr() };
  }

  private worldAt(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const { sx, sy } = this.deviceXY(e);
    return this.camera.screenToWorld(sx, sy, this.canvas.width, this.canvas.height);
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const { sx, sy } = this.deviceXY(e);
    this.camera.zoomAt(e.deltaY < 0 ? 1.1 : 0.9, sx, sy, this.canvas.width, this.canvas.height);
  };

  private onDown = (e: PointerEvent): void => {
    const snap = this.getSnapshot();
    const w = this.worldAt(e);
    const hit = snap ? unitAt(w.x, w.y, snap) : null;
    this.mode = hit ? "unit" : "pan";
    this.grabbedUnit = hit;
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
    this.moved = false;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onMove = (e: PointerEvent): void => {
    const snap = this.getSnapshot();
    const w = this.worldAt(e);
    if (snap) useUi.getState().setHoverCell(worldToCell(w.x, w.y, 1, snap.width, snap.height));

    if (this.mode === "none") return;
    if (Math.abs(e.clientX - this.startX) > CLICK_THRESHOLD_PX || Math.abs(e.clientY - this.startY) > CLICK_THRESHOLD_PX) {
      this.moved = true;
    }
    if (this.mode === "pan") {
      this.camera.panByScreen((e.clientX - this.lastX) * this.dpr(), (e.clientY - this.lastY) * this.dpr());
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private onUp = (e: PointerEvent): void => {
    this.canvas.releasePointerCapture(e.pointerId);
    const snap = this.getSnapshot();
    const w = this.worldAt(e);
    const cell = snap ? worldToCell(w.x, w.y, 1, snap.width, snap.height) : null;
    const ui = useUi.getState();

    if (this.mode === "unit" && this.grabbedUnit && snap) {
      const unit = snap.units.find((u) => u.id === this.grabbedUnit);
      if (this.moved && cell !== null) {
        sendCommand({ type: "SET_WAYPOINT", unitId: this.grabbedUnit, target: cell });
        ui.selectUnit(this.grabbedUnit, unit?.role);
      } else {
        ui.selectUnit(this.grabbedUnit, unit?.role);
        if (unit && unit.destination !== null) sendCommand({ type: "CANCEL_MOVE", unitId: this.grabbedUnit });
        else sendCommand({ type: "ACT", unitId: this.grabbedUnit });
      }
    } else if (this.mode === "pan" && !this.moved) {
      // Click on empty ground: route the selected unit there, or clear selection.
      if (ui.selectedUnitId && cell !== null) sendCommand({ type: "SET_WAYPOINT", unitId: ui.selectedUnitId, target: cell });
      else ui.selectUnit(null);
    }

    this.mode = "none";
    this.grabbedUnit = null;
  };

  attach(): () => void {
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    return () => {
      this.canvas.removeEventListener("wheel", this.onWheel);
      this.canvas.removeEventListener("pointerdown", this.onDown);
      this.canvas.removeEventListener("pointermove", this.onMove);
      this.canvas.removeEventListener("pointerup", this.onUp);
    };
  }
}
