import { create } from "zustand";

/** Max zoom: 2 px per sample. */
export const MAX_PX_PER_SAMPLE = 2;
export const ZOOM_STEP = 1.5;

export interface View {
  /** Visible window start and length in seconds. */
  start: number;
  span: number;
}

export const clampView = (v: View, duration: number, minSpan: number): View => {
  const span = Math.min(duration, Math.max(minSpan, v.span));
  const start = Math.min(Math.max(0, v.start), Math.max(0, duration - span));
  return { start, span };
};
/** Zooms by `factor` (>1 zooms in) keeping time `t` at the same screen fraction. */
export function zoomAround(
  v: View,
  t: number,
  factor: number,
  duration: number,
  minSpan: number,
): View {
  const span = Math.min(duration, Math.max(minSpan, v.span / factor));
  const frac = (t - v.start) / v.span;
  return clampView({ start: t - frac * span, span }, duration, minSpan);
}
/** Window showing `[a, b]` with a 5% margin on each side. */
export function viewFor(
  a: number,
  b: number,
  duration: number,
  minSpan: number,
): View {
  const len = Math.max(b - a, minSpan) / 0.9;
  return clampView(
    { start: (a + b) / 2 - len / 2, span: len },
    duration,
    minSpan,
  );
}
export const minSpanFor = (width: number, sampleRate: number) =>
  width / (MAX_PX_PER_SAMPLE * sampleRate);

interface ViewState extends View {
  duration: number;
  /** Stage width in CSS px. */
  width: number;
  sampleRate: number;
  reset(duration: number, sampleRate: number): void;
  setWidth(width: number): void;
  set(v: View): void;
  fit(): void;
  zoomAt(t: number, factor: number): void;
  scrollBy(seconds: number): void;
  show(a: number, b: number): void;
  /** Scrolls the least needed to keep `t` visible. */
  reveal(t: number): void;
}

export const useView = create<ViewState>()((set, get) => {
  const minSpan = () =>
    minSpanFor(get().width || 1000, get().sampleRate || 48000);
  return {
    start: 0,
    span: 1,
    duration: 1,
    width: 0,
    sampleRate: 48000,
    reset(duration, sampleRate) {
      set({ duration, sampleRate, start: 0, span: duration });
    },
    setWidth(width) {
      const s = get();
      set({
        width,
        ...clampView(s, s.duration, minSpanFor(width || 1000, s.sampleRate)),
      });
    },
    set(v) {
      set(clampView(v, get().duration, minSpan()));
    },
    fit() {
      set({ start: 0, span: get().duration });
    },
    zoomAt(t, factor) {
      set(zoomAround(get(), t, factor, get().duration, minSpan()));
    },
    scrollBy(seconds) {
      const s = get();
      set(
        clampView(
          { start: s.start + seconds, span: s.span },
          s.duration,
          minSpan(),
        ),
      );
    },
    show(a, b) {
      set(viewFor(a, b, get().duration, minSpan()));
    },
    reveal(t) {
      const s = get();
      if (t >= s.start && t <= s.start + s.span) return;
      set(
        clampView(
          { start: t - s.span * 0.1, span: s.span },
          s.duration,
          minSpan(),
        ),
      );
    },
  };
});
