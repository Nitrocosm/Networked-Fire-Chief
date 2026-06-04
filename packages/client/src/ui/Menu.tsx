import type { GameOptions } from "../game/setup.ts";
import { useUi } from "../state/store.ts";

interface Level {
  id: string;
  name: string;
  blurb: string;
  options: GameOptions;
}

const LEVELS: Level[] = [
  {
    id: "practice",
    name: "Practice",
    blurb: "30×30 · 5 min · light wind, sparse fires",
    options: { size: 30, roundLengthSec: 300, windSpeed: 0.3, outbreakDensity: 4, seed: 101, mapSeed: 11 },
  },
  {
    id: "standard",
    name: "Standard",
    blurb: "44×44 · 10 min · shifting wind",
    options: { size: 44, roundLengthSec: 600, windSpeed: 0.45, outbreakDensity: 5.5, seed: 202, mapSeed: 22 },
  },
  {
    id: "inferno",
    name: "Inferno",
    blurb: "50×50 · 10 min · high wind, dense outbreaks",
    options: { size: 50, roundLengthSec: 600, windSpeed: 0.7, outbreakDensity: 9, seed: 303, mapSeed: 33 },
  },
];

export function Menu() {
  const startGame = useUi((s) => s.startGame);
  const mode = useUi((s) => s.mode);
  const setMode = useUi((s) => s.setMode);

  return (
    <div className="menu">
      <div className="menu-card">
        <h1>Networked Fire Chief</h1>
        <p className="tagline">
          Contain the wildfires. You start at 100,000 and only ever lose points as land and assets burn.
          Pick a scenario.
        </p>

        <div className="mode-pick">
          <span className="mode-label">View mode</span>
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
            <button key={lvl.id} className="level" onClick={() => startGame(lvl.options)}>
              <span className="level-name">{lvl.name}</span>
              <span className="level-blurb">{lvl.blurb}</span>
            </button>
          ))}
        </div>

        <p className="hint">
          Drag a unit to move it · click it to extinguish / firebreak · scroll to zoom · drag the map to pan.
        </p>
      </div>
    </div>
  );
}
