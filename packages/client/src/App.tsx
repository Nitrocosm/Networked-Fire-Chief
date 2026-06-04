import { useEffect, useRef } from "react";
import { createSinglePlayerGame } from "./game/setup.ts";
import { LocalTransport } from "./transport/local.ts";
import { GameLoop } from "./engine/loop.ts";
import { resetHolder } from "./engine/holder.ts";
import { setSessionTransport } from "./engine/session.ts";
import { Hud } from "./ui/Hud.tsx";

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const state = createSinglePlayerGame();
    const transport = new LocalTransport(state);
    setSessionTransport(transport);
    resetHolder(transport.snapshot());

    const loop = new GameLoop(transport, state.config.TICKS_PER_SEC, () => {
      // The canvas renderer subscribes here in the next commit.
    });
    loop.start();

    return () => {
      loop.stop();
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
