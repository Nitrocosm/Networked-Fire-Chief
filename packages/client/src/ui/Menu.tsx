import { useUi } from "../state/store.ts";
import { LEVELS } from "./levels.ts";

export function Menu() {
  const startSinglePlayer = useUi((s) => s.startSinglePlayer);
  const enterMpLobby = useUi((s) => s.enterMpLobby);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);

  return (
    <div className="menu">
      <div className="menu-card">
        <h1>Networked Fire Chief</h1>
        <p className="tagline">
          Contain the wildfires. You start at 100,000 and only ever lose points as land and assets burn.
        </p>

        <div className="mode-pick">
          <span className="mode-label">Single-player view</span>
          <div className="modes big-modes">
            <button className={mode === "CASUAL" ? "on" : ""} onClick={() => setMode("CASUAL")}>
              Casual <em>see everything</em>
            </button>
            <button className={mode === "CHALLENGE" ? "on" : ""} onClick={() => setMode("CHALLENGE")}>
              Challenge <em>per-role view</em>
            </button>
          </div>
        </div>

        <div className="levels">
          {LEVELS.map((lvl) => (
            <button key={lvl.id} className="level" onClick={() => startSinglePlayer(lvl.options)}>
              <span className="level-name">{lvl.name}</span>
              <span className="level-blurb">{lvl.blurb}</span>
            </button>
          ))}
        </div>

        <div className="mp-cta">
          <button className="mp-button" onClick={enterMpLobby}>
            Play Multiplayer with friends →
          </button>
          <span className="muted">3 players, one role each — coordination is the game.</span>
        </div>

        <p className="hint">Drag a unit to move it · click it to extinguish / firebreak · scroll to zoom · drag the map to pan.</p>
      </div>
    </div>
  );
}
