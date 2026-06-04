import { useEffect, useRef } from "react";
import { filterForRole, type ClientView } from "@fire/protocol";
import { createSinglePlayerGame } from "./game/setup.ts";
import { LocalTransport } from "./transport/local.ts";
import { GameLoop } from "./engine/loop.ts";
import { holder, resetHolder } from "./engine/holder.ts";
import { setSessionTransport } from "./engine/session.ts";
import { useUi } from "./state/store.ts";
import { Camera } from "./render/camera.ts";
import { CanvasRenderer } from "./render/renderer.ts";
import { worldToCell } from "./render/hexLayout.ts";
import { Hud } from "./ui/Hud.tsx";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = createSinglePlayerGame();
    const { GRID_W: width, GRID_H: height, TICKS_PER_SEC: tps } = state.config;
    const transport = new LocalTransport(state);
    setSessionTransport(transport);
    resetHolder(transport.snapshot());

    const renderer = new CanvasRenderer(canvas);
    const camera = new Camera();
    let fitted = false;

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      if (!fitted) {
        camera.fit(width, height, 1, canvas.width, canvas.height);
        fitted = true;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    const dpr = (): number => window.devicePixelRatio || 1;
    const deviceXY = (e: PointerEvent | WheelEvent): { sx: number; sy: number } => {
      const rect = canvas.getBoundingClientRect();
      return { sx: (e.clientX - rect.left) * dpr(), sy: (e.clientY - rect.top) * dpr() };
    };

    // ── Input: wheel zoom, drag pan, hover ─────────────────────────────────
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const { sx, sy } = deviceXY(e);
      camera.zoomAt(e.deltaY < 0 ? 1.1 : 0.9, sx, sy, canvas.width, canvas.height);
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent): void => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent): void => {
      const { sx, sy } = deviceXY(e);
      const world = camera.screenToWorld(sx, sy, canvas.width, canvas.height);
      useUi.getState().setHoverCell(worldToCell(world.x, world.y, 1, width, height));
      if (dragging) {
        camera.panByScreen((e.clientX - lastX) * dpr(), (e.clientY - lastY) * dpr());
        lastX = e.clientX;
        lastY = e.clientY;
      }
    };
    const onPointerUp = (e: PointerEvent): void => {
      dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    const loop = new GameLoop(transport, tps, (alpha) => {
      const snap = holder.current;
      if (!snap) return;
      const { mode, activeRole, selectedUnitId, hoverCell } = useUi.getState();
      const view: ClientView = mode === "CHALLENGE" ? filterForRole(snap, activeRole) : snap;
      const prevSnap = holder.previous ?? snap;
      const prevView: ClientView = mode === "CHALLENGE" ? filterForRole(prevSnap, activeRole) : prevSnap;
      renderer.draw(view, prevView, alpha, camera, { selectedUnitId, hoverCell });
    });
    loop.start();

    return () => {
      loop.stop();
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      setSessionTransport(null);
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      <Hud />
    </div>
  );
}
