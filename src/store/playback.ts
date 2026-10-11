import { create } from "zustand";

interface PlaybackState {
  playing: boolean;
  /** Seconds. */
  playhead: number;
  loop: boolean;
  /** Playing In→Out (stops at Out unless looping). */
  selectionOnly: boolean;
  /** Monitor volume 0–1; playback only. */
  volume: number;
}

export const usePlayback = create<PlaybackState>()(() => ({
  playing: false,
  playhead: 0,
  loop: false,
  selectionOnly: false,
  volume: 0.72,
}));
