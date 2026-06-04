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
import { GameInput } from "./engine/input.ts";
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

    const input = new GameInput(canvas, camera, () => holder.current);
    const detachInput = input.attach();

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
      detachInput();
      window.removeEventListener("resize", resize);
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
