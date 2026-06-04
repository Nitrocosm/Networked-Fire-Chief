/**
 * COLD-PATH UI state (Zustand). Human-speed selections only — selected unit,
 * active role, single-player view mode, hover. The high-frequency snapshot does
 * NOT live here (see engine/holder.ts).
 */
import { create } from "zustand";
import type { Role } from "@fire/protocol";

/** Casual = omniscient; Challenge = see only the selected unit's role view. */
export type ViewMode = "CASUAL" | "CHALLENGE";

interface UiStore {
  mode: ViewMode;
  activeRole: Role;
  selectedUnitId: string | null;
  hoverCell: number | null;

  setMode: (m: ViewMode) => void;
  setActiveRole: (r: Role) => void;
  selectUnit: (id: string | null, role?: Role) => void;
  setHoverCell: (cell: number | null) => void;
}

export const useUi = create<UiStore>((set) => ({
  mode: "CASUAL",
  activeRole: "TRUCK",
  selectedUnitId: null,
  hoverCell: null,

  setMode: (mode) => set({ mode }),
  setActiveRole: (activeRole) => set({ activeRole }),
  selectUnit: (selectedUnitId, role) => set(role ? { selectedUnitId, activeRole: role } : { selectedUnitId }),
  setHoverCell: (hoverCell) => set({ hoverCell }),
}));
