import { create } from "zustand";
import type { LaunchOptions, LoadFailure, MediaInfo } from "@/lib/types";
import type { PeakData } from "@/lib/peaks";

export type Status = "empty" | "loading" | "ready" | "error";

interface MediaState {
  status: Status;
  loadId: number;
  info: MediaInfo | null;
  failure: LoadFailure | null;
  peaks: PeakData | null;
  /** Bumped on every applied peak chunk. */
  peaksVersion: number;
  previewUrl: string | null;
  launch: LaunchOptions | null;
  home: string | null;
}

export const useMedia = create<MediaState>()(() => ({
  status: "empty",
  loadId: 0,
  info: null,
  failure: null,
  peaks: null,
  peaksVersion: 0,
  previewUrl: null,
  launch: null,
  home: null,
}));
