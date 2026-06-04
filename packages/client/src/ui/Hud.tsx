import { holder } from "../engine/holder.ts";
import { useUi } from "../state/store.ts";
import { useFrame } from "./useFrame.ts";

function fmtTime(totalSec: number): string {
  const s = Math.ceil(totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function Hud() {
  useFrame(8);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);
  const snap = holder.current;
  if (!snap) return null;

  const remaining = Math.max(0, (snap.endTick - snap.tick) / snap.ticksPerSec);

  return (
    <div className="hud">
      <div className="hud-bar">
        <div className="stat">
          <label>SCORE</label>
          <span className="score">{snap.score.toLocaleString()}</span>
        </div>
        <div className="stat">
          <label>TIME</label>
          <span className={remaining < 30 ? "time low" : "time"}>{fmtTime(remaining)}</span>
        </div>
        {snap.status === "ENDED" && <div className="ended">ROUND OVER</div>}
        <div className="spacer" />
        <div className="modes">
          <button className={mode === "CASUAL" ? "on" : ""} onClick={() => setMode("CASUAL")}>
            Casual
          </button>
          <button className={mode === "CHALLENGE" ? "on" : ""} onClick={() => setMode("CHALLENGE")}>
            Challenge
          </button>
        </div>
      </div>
    </div>
  );
}
