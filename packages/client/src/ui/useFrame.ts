/**
 * Forces a throttled React re-render so HUD components can re-read the
 * non-reactive snapshot holder. Default 12fps is plenty for text — crucially,
 * the snapshot PUSH itself never triggers React; the HUD pulls on this cadence.
 */
import { useEffect, useReducer, useRef } from "react";

export function useFrame(fps = 12): void {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    const interval = 1000 / fps;
    const loop = (t: number): void => {
      if (t - last.current >= interval) {
        last.current = t;
        bump();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps]);
}
