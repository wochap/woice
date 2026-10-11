import type { FadeCurve } from "@/lib/types";

/** Gain at `u ∈ [0, 1]` of a fade-in; matches the ffmpeg afade curves the export uses (tri, cub, hsin). */
export function gainCurve(u: number, curve: FadeCurve): number {
  const x = Math.min(1, Math.max(0, u));
  if (curve === "linear") return x;
  if (curve === "exp") return x * x * x;
  return (1 - Math.cos(Math.PI * x)) / 2;
}

/** Clamps a fade so fade-in + fade-out never exceed the selection (all in ms). */
export function clampFade(
  value: number,
  other: number,
  selectionMs: number,
): number {
  return Math.round(Math.max(0, Math.min(value, selectionMs - other)));
}
