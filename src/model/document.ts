import type { FadeCurve, Format, NormalizeTarget, Quality } from "@/lib/types";
import { clampFade } from "./fades";

/** Shortest kept range, in seconds. */
export const MIN_RANGE = 0.01;
export const GAIN_MIN = -24;
export const GAIN_MAX = 12;

/** The undoable document. Zoom, scroll, playhead, playback and monitor volume are not in it. */
export interface Doc {
  in: number;
  out: number;
  /** Milliseconds. */
  fadeIn: number;
  fadeOut: number;
  fadeCurve: FadeCurve;
  gainDb: number;
  normalize: boolean;
  normalizeTarget: NormalizeTarget;
  declick: boolean;
  format: Format;
  quality: Quality;
  output: string;
  /** The output path is the derived `-trim` default and follows the format. */
  outputIsDefault: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Moves In, keeping `0 ≤ In ≤ Out − 10 ms`. */
export function withIn(d: Doc, t: number): Doc {
  return refitFades({ ...d, in: clamp(t, 0, d.out - MIN_RANGE) });
}
/** Moves Out, keeping `In + 10 ms ≤ Out ≤ duration`. */
export function withOut(d: Doc, t: number, duration: number): Doc {
  return refitFades({ ...d, out: clamp(t, d.in + MIN_RANGE, duration) });
}
/** Keeps fade-in + fade-out within the selection after the range changes. */
export function refitFades(d: Doc): Doc {
  const sel = (d.out - d.in) * 1000;
  const fadeOut = clampFade(d.fadeOut, 0, sel);
  const fadeIn = clampFade(d.fadeIn, fadeOut, sel);
  return fadeIn === d.fadeIn && fadeOut === d.fadeOut
    ? d
    : { ...d, fadeIn, fadeOut };
}
export function withFadeIn(d: Doc, ms: number): Doc {
  return { ...d, fadeIn: clampFade(ms, d.fadeOut, (d.out - d.in) * 1000) };
}
export function withFadeOut(d: Doc, ms: number): Doc {
  return { ...d, fadeOut: clampFade(ms, d.fadeIn, (d.out - d.in) * 1000) };
}
export function withGain(d: Doc, db: number): Doc {
  return { ...d, gainDb: Math.round(clamp(db, GAIN_MIN, GAIN_MAX) * 2) / 2 };
}
