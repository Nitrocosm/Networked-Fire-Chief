import { useState } from "react";
import { ROLES, type Role } from "@fire/protocol";
import { useUi } from "../state/store.ts";
import { defaultServerUrl, getNet, NetClient, setNet } from "../engine/net.ts";
import { LEVELS } from "./levels.ts";

const ROLE_LABEL: Record<string, string> = { HELI: "Heli", TRUCK: "Truck", DOZER: "Dozer" };

export function MpLobby() {
  const lobby = useUi((s) => s.lobby);
  const myCode = useUi((s) => s.myCode);
  const myId = useUi((s) => s.myId);
  const isHost = useUi((s) => s.isHost);
  const netError = useUi((s) => s.netError);
  const exitToMenu = useUi((s) => s.exitToMenu);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [server, setServer] = useState(defaultServerUrl());
  const [levelId, setLevelId] = useState(LEVELS[1]!.id);

  const ensureNet = (): NetClient => {
    let n = getNet();
    if (!n) {
      n = new NetClient(server);
      setNet(n);
    }
    return n;
  };

  // ── Connect form (not yet in a room) ────────────────────────────────────
  if (!myCode || !lobby) {
    return (
      <div className="menu">
        <div className="menu-card">
          <button className="link-back" onClick={exitToMenu}>← Back</button>
          <h1>Multiplayer</h1>
          {netError && <div className="net-error">{netError}</div>}

          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player" />
          </label>
          <label className="field">
            <span>Server</span>
            <input value={server} onChange={(e) => setServer(e.target.value)} />
          </label>

          <div className="mp-cols">
            <div className="mp-col">
              <h3>Host a game</h3>
              <select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} — {l.blurb}
                  </option>
                ))}
              </select>
              <button className="primary" onClick={() => ensureNet().createRoom(name, LEVELS.find((l) => l.id === levelId)!.options)}>
                Create room
              </button>
            </div>
            <div className="mp-col">
              <h3>Join a game</h3>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ROOM CODE" />
              <button className="primary" disabled={!code.trim()} onClick={() => ensureNet().joinRoom(code.trim().toUpperCase(), name)}>
                Join room
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Room lobby ──────────────────────────────────────────────────────────
  const me = lobby.players.find((p) => p.id === myId) ?? null;
  const takenBy = (role: Role) => lobby.players.find((p) => p.role === role && p.connected) ?? null;

  return (
    <div className="menu">
      <div className="menu-card">
        <button className="link-back" onClick={exitToMenu}>← Leave</button>
        <h1>
          Room <span className="code">{lobby.code}</span>
        </h1>
        <p className="tagline">Share this code with your friends. Each player claims a role.</p>
        {netError && <div className="net-error">{netError}</div>}

        <div className="role-claim">
          {ROLES.map((r) => {
            const owner = takenBy(r);
            const mine = me?.role === r;
            return (
              <button
                key={r}
                className={`claim ${mine ? "mine" : ""}`}
                disabled={!!owner && !mine}
                onClick={() => getNet()?.claimRole(mine ? null : r)}
              >
                <span className="claim-role">{ROLE_LABEL[r]}</span>
                <span className="claim-owner">{owner ? owner.name : "open"}</span>
              </button>
            );
          })}
        </div>

        <div className="player-list">
          {lobby.players.map((p) => (
            <div key={p.id} className={`pl ${p.connected ? "" : "off"}`}>
              <span>
                {p.name}
                {p.isHost ? " · host" : ""}
                {p.id === myId ? " · you" : ""}
              </span>
              <span className="muted">{p.role ? ROLE_LABEL[p.role] : "—"}</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <button className="primary big" onClick={() => getNet()?.startGame()}>
            Start round
          </button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}
