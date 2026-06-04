/**
 * COLD-PATH UI state (Zustand). Human-speed selections only — selected unit,
 * active role, single-player view mode, hover. The high-frequency snapshot does
 * NOT live here (see engine/holder.ts).
 */
import { create } from "zustand";
import type { Role } from "@fire/protocol";
import type { GameOptions } from "../game/setup.ts";

/** Casual = omniscient; Challenge = see only the selected unit's role view. */
export type ViewMode = "CASUAL" | "CHALLENGE";
export type Screen = "MENU" | "PLAYING";

interface UiStore {
  screen: Screen;
  level: GameOptions | null;
  mode: ViewMode;
  activeRole: Role;
  selectedUnitId: string | null;
  hoverCell: number | null;

  startGame: (level: GameOptions) => void;
  exitToMenu: () => void;
  setMode: (m: ViewMode) => void;
  setActiveRole: (r: Role) => void;
  selectUnit: (id: string | null, role?: Role) => void;
  setHoverCell: (cell: number | null) => void;
}

export const useUi = create<UiStore>((set) => ({
  screen: "MENU",
  level: null,
  mode: "CASUAL",
  activeRole: "TRUCK",
  selectedUnitId: null,
  hoverCell: null,

  startGame: (level) => set({ level, screen: "PLAYING", selectedUnitId: null }),
  exitToMenu: () => set({ screen: "MENU", level: null, selectedUnitId: null }),
  setMode: (mode) => set({ mode }),
  setActiveRole: (activeRole) => set({ activeRole }),
  selectUnit: (selectedUnitId, role) => set(role ? { selectedUnitId, activeRole: role } : { selectedUnitId }),
  setHoverCell: (hoverCell) => set({ hoverCell }),
}));
