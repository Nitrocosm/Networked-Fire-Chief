import { filterForRole, ROLES, type ClientView, type UnitView, type WindView } from "@fire/protocol";
import { holder } from "../engine/holder.ts";
import { sendCommand } from "../engine/session.ts";
import { useUi } from "../state/store.ts";
import { useFrame } from "./useFrame.ts";

const TERRAIN_NAME: Record<number, string> = {
  0: "Grassland", 1: "Forest", 2: "Water source", 3: "Fuel source",
  4: "House", 5: "Animals", 6: "Firebreak", 7: "Road", 8: "Bare",
};
const ROLE_LABEL: Record<string, string> = { HELI: "Heli", TRUCK: "Truck", DOZER: "Dozer" };

function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function windDeg(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI; // 0° = up/north
}

function unitStatus(u: UnitView): string {
  if (u.action) return `${u.action.type[0]}${u.action.type.slice(1).toLowerCase()} ${Math.round(u.action.progress * 100)}%`;
  if (u.destination !== null) return "Moving";
  return "Idle";
}

function Bars({ water, fuel }: { water: number; fuel: number }) {
  return (
    <div className="bars">
      <div className="bar"><i style={{ width: `${water * 100}%`, background: "#4aa3ff" }} /></div>
      <div className="bar"><i style={{ width: `${fuel * 100}%`, background: "#ffb347" }} /></div>
    </div>
  );
}

export function Hud() {
  useFrame(10);
  const { mode, activeRole, selectedUnitId, hoverCell, setMode, setActiveRole, selectUnit } = useUi();
  const snap = holder.current;
  if (!snap) return null;

  const view: ClientView = mode === "CHALLENGE" ? filterForRole(snap, activeRole) : snap;
  const remaining = (snap.endTick - snap.tick) / snap.ticksPerSec;
  const roster = snap.units.filter((u) => u.role === activeRole);
  const selected = snap.units.find((u) => u.id === selectedUnitId) ?? null;
  const wind: WindView | null = view.wind;

  return (
    <div className="hud">
      {/* Top bar */}
      <div className="hud-bar">
        <div className="stat"><label>SCORE</label><span className="score">{snap.score.toLocaleString()}</span></div>
        <div className="stat"><label>TIME</label><span className={remaining < 30 ? "time low" : "time"}>{fmtClock(remaining)}</span></div>
        {snap.status === "ENDED" && <div className="ended">ROUND OVER</div>}
        <div className="roles">
          {ROLES.map((r) => (
            <button key={r} className={r === activeRole ? "on" : ""} onClick={() => setActiveRole(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="modes">
          <button className={mode === "CASUAL" ? "on" : ""} onClick={() => setMode("CASUAL")}>Casual</button>
          <button className={mode === "CHALLENGE" ? "on" : ""} onClick={() => setMode("CHALLENGE")}>Challenge</button>
        </div>
      </div>

      {/* Top-right: wind + warnings (role-gated) */}
      <div className="panel-tr">
        {wind ? (
          <div className="card wind">
            <label>WIND</label>
            <div className="wind-row">
              <span className="arrow" style={{ transform: `rotate(${windDeg(wind.dirX, wind.dirY)}deg)` }}>▲</span>
              <span className="wind-speed">{Math.round(wind.speed * 100)}%</span>
            </div>
            <div className="forecast">
              forecast <span className="arrow sm" style={{ transform: `rotate(${windDeg(wind.forecastDirX, wind.forecastDirY)}deg)` }}>▲</span>
              {" @ "}{fmtClock(wind.forecastEtaTick / snap.ticksPerSec)}
            </div>
          </div>
        ) : (
          <div className="card muted">Wind: hidden for {ROLE_LABEL[activeRole]}</div>
        )}
        {view.warnings ? (
          <div className="card">
            <label>WARNINGS</label>
            <span className="big">{view.warnings.length}</span>
          </div>
        ) : (
          <div className="card muted">Warnings: hidden for {ROLE_LABEL[activeRole]}</div>
        )}
      </div>

      {/* Bottom-left: hover info */}
      {hoverCell !== null && (
        <div className="panel-bl card">
          <div>({hoverCell % snap.width}, {Math.floor(hoverCell / snap.width)})</div>
          <div className="muted">{TERRAIN_NAME[snap.terrain[hoverCell]!] ?? "?"}</div>
        </div>
      )}

      {/* Bottom: roster + selected */}
      <div className="panel-bottom">
        <div className="roster">
          {roster.map((u) => (
            <button key={u.id} className={u.id === selectedUnitId ? "unit on" : "unit"} onClick={() => selectUnit(u.id, u.role)}>
              <span className="unit-name">{u.id}</span>
              <Bars water={u.water} fuel={u.fuel} />
              <span className="unit-status">{unitStatus(u)}</span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="card selected">
            <label>{ROLE_LABEL[selected.role]} — {selected.id}</label>
            <div className="kv">water <b>{Math.round(selected.water * 100)}%</b> · fuel <b>{Math.round(selected.fuel * 100)}%</b></div>
            <div className="kv muted">{unitStatus(selected)} · cell ({selected.cell % snap.width}, {Math.floor(selected.cell / snap.width)})</div>
            {selected.destination !== null && (
              <button className="cancel" onClick={() => sendCommand({ type: "CANCEL_MOVE", unitId: selected.id })}>Stop</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
