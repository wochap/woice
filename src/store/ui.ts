import { create } from "zustand";
import type { ExportProgress, ExportResult } from "@/lib/types";

export type Focus = "playhead" | "in" | "out";
export type Overlay = null | "help" | "export" | "done";

export interface SnapInfo {
  requested: number;
  time: number;
  edge: "in" | "out";
  key: string;
}

interface UiState {
  focus: Focus;
  /** Handle value when it took focus; Esc reverts to it. */
  focusEntry: number | null;
  overlay: Overlay;
  sidebar: boolean;
  /** Compact drawer open state (below 960 px). */
  drawer: boolean;
  windowWidth: number;
  progress: ExportProgress | null;
  result: ExportResult | null;
  exportError: string | null;
  /** Last zero-crossing snap, shown in the sample view. */
  snap: SnapInfo | null;
  dragOver: boolean;
}

export const useUi = create<UiState>()(() => ({
  focus: "playhead",
  focusEntry: null,
  overlay: null,
  sidebar: true,
  drawer: false,
  windowWidth: typeof window === "undefined" ? 1280 : window.innerWidth,
  progress: null,
  result: null,
  exportError: null,
  snap: null,
  dragOver: false,
}));

export const COMPACT_BELOW = 960;
