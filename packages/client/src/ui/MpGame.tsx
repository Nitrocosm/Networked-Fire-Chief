import { useEffect, useRef } from "react";
import { clearHolder, holder } from "../engine/holder.ts";
import { setCommandSink } from "../engine/session.ts";
import { getNet, setNet } from "../engine/net.ts";
import { NetLoop } from "../engine/loop.ts";
import { useUi } from "../state/store.ts";
import { Camera } from "../render/camera.ts";
import { CanvasRenderer } from "../render/renderer.ts";
import { GameInput } from "../engine/input.ts";
import { Hud } from "./Hud.tsx";

/** Multiplayer view: render server snapshots (already role-filtered); no local sim. */
export function MpGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exitToMenu = useUi((s) => s.exitToMenu);

  useEffect(() => {
    const canvas = canvasRef.current;
    const net = getNet();
    if (!canvas || !net) return;
    setCommandSink(net);

    const renderer = new CanvasRenderer(canvas);
    const camera = new Camera();
    let fitted = false;
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      fitted = false; // refit on resize using the latest snapshot dims
    };
    resize();
    window.addEventListener("resize", resize);

    const input = new GameInput(canvas, camera, () => holder.current);
    const detachInput = input.attach();

    const loop = new NetLoop(
      () => 1000 / net.ticksPerSec,
      () => net.lastSnapshotMs,
      (alpha) => {
        const cur = holder.current;
        if (!cur) return;
        if (!fitted) {
          camera.fit(cur.width, cur.height, 1, canvas.width, canvas.height);
          fitted = true;
        }
        const { selectedUnitId, hoverCell } = useUi.getState();
        renderer.draw(cur, holder.previous ?? cur, alpha, camera, { selectedUnitId, hoverCell });
      },
    );
    loop.start();

    return () => {
      loop.stop();
      detachInput();
      window.removeEventListener("resize", resize);
      setCommandSink(null);
      net.close();
      setNet(null);
      clearHolder();
    };
  }, []);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="game-canvas" />
      <button className="exit-btn" onClick={exitToMenu}>← Leave</button>
      <Hud />
    </div>
  );
}
