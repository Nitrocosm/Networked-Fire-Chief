/**
 * COLD-PATH UI state (Zustand). Human-speed only: navigation, selections, and
 * the multiplayer lobby. The high-frequency snapshot lives in engine/holder.ts.
 */
import { create } from "zustand";
import type { LobbyState, Role } from "@fire/protocol";
import type { GameOptions } from "../game/setup.ts";

/** Casual = omniscient; Challenge = see only the active role's view (single-player). */
export type ViewMode = "CASUAL" | "CHALLENGE";
export type Screen = "MENU" | "SP" | "MP_LOBBY" | "MP_GAME";

interface UiStore {
  screen: Screen;
  multiplayer: boolean;
  level: GameOptions | null;

  // Single-player view controls.
  mode: ViewMode;
  activeRole: Role;
  selectedUnitId: string | null;
  hoverCell: number | null;

  // Multiplayer lobby.
  lobby: LobbyState | null;
  myCode: string | null;
  myToken: string | null;
  myId: string | null;
  isHost: boolean;
  myRole: Role | null;
  netError: string | null;

  startSinglePlayer: (level: GameOptions) => void;
  enterMpLobby: () => void;
  exitToMenu: () => void;

  setLobby: (lobby: LobbyState) => void;
  setJoined: (code: string, token: string, playerId: string, isHost: boolean) => void;
  setWelcome: (role: Role | null) => void;
  setNetError: (message: string | null) => void;

  setMode: (m: ViewMode) => void;
  setActiveRole: (r: Role) => void;
  selectUnit: (id: string | null, role?: Role) => void;
  setHoverCell: (cell: number | null) => void;
}

export const useUi = create<UiStore>((set) => ({
  screen: "MENU",
  multiplayer: false,
  level: null,

  mode: "CASUAL",
  activeRole: "TRUCK",
  selectedUnitId: null,
  hoverCell: null,

  lobby: null,
  myCode: null,
  myToken: null,
  myId: null,
  isHost: false,
  myRole: null,
  netError: null,

  startSinglePlayer: (level) => set({ screen: "SP", multiplayer: false, level, selectedUnitId: null }),
  enterMpLobby: () =>
    set({ screen: "MP_LOBBY", multiplayer: true, lobby: null, myCode: null, myToken: null, myId: null, isHost: false, myRole: null, netError: null }),
  exitToMenu: () =>
    set({ screen: "MENU", multiplayer: false, level: null, lobby: null, myCode: null, myToken: null, myId: null, isHost: false, myRole: null, netError: null, selectedUnitId: null }),

  setLobby: (lobby) => set({ lobby }),
  setJoined: (myCode, myToken, myId, isHost) => set({ myCode, myToken, myId, isHost, netError: null }),
  setWelcome: (myRole) => set({ myRole, activeRole: myRole ?? "TRUCK", screen: "MP_GAME", selectedUnitId: null }),
  setNetError: (netError) => set({ netError }),

  setMode: (mode) => set({ mode }),
  setActiveRole: (activeRole) => set({ activeRole }),
  selectUnit: (selectedUnitId, role) => set(role ? { selectedUnitId, activeRole: role } : { selectedUnitId }),
  setHoverCell: (hoverCell) => set({ hoverCell }),
}));
