const pad = (n: number, l: number) => String(n).padStart(l, "0");

/** `m:ss.mmm` with unpadded minutes; negative values get a typographic minus. */
export function formatTime(s: number): string {
  const ms = Math.round(Math.abs(s) * 1000);
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${s < 0 && ms > 0 ? "−" : ""}${m}:${pad(sec, 2)}.${pad(ms % 1000, 3)}`;
}

/** Parses `m:ss.mmm`, `ss.mmm`, `h:mm:ss.mmm` or plain seconds; `null` when invalid. */
export function parseTime(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d*)?$/.test(t)) return null;
  const parts = t.split(":");
  const secs = parseFloat(parts.pop()!);
  if (parts.length > 0 && secs >= 60) return null;
  let total = secs;
  let mult = 60;
  for (let i = parts.length - 1; i >= 0; i--) {
    total += parseInt(parts[i], 10) * mult;
    mult *= 60;
  }
  return Number.isFinite(total) ? total : null;
}

export const TICK_STEPS = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60,
  120,
];
/** Smallest step whose majors are at least `minPx` apart. */
export function tickStep(span: number, width: number, minPx = 86): number {
  return TICK_STEPS.find((s) => (s / span) * width >= minPx) ?? 120;
}

/** Ruler label: m:ss for steps ≥ 1 s, m:ss.d for ≥ 100 ms, else m:ss.mmm. */
export function tickLabel(s: number, step: number): string {
  const ms = Math.round(s * 1000);
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const f = ms % 1000;
  if (step >= 1) return `${m}:${pad(sec, 2)}`;
  if (step >= 0.1) return `${m}:${pad(sec, 2)}.${Math.floor(f / 100)}`;
  return `${m}:${pad(sec, 2)}.${pad(f, 3)}`;
}

/** Major ticks (with the four minors between) visible in `[v0, v1]`. */
export function ticks(v0: number, v1: number, width: number) {
  const step = tickStep(v1 - v0, width);
  const minor = step / 5;
  const out: { t: number; major: boolean }[] = [];
  for (let q = Math.ceil(v0 / minor - 1e-9); q * minor <= v1 + 1e-9; q++) {
    out.push({ t: q * minor, major: q % 5 === 0 });
  }
  return { step, ticks: out };
}

/** Transport zoom readout: `Fit`, `12.4×`, `1 238×`. */
export function zoomLabel(ratio: number): string {
  if (ratio < 1.01) return "Fit";
  if (ratio >= 100)
    return `${Math.round(ratio).toLocaleString("en-US").replace(/,/g, " ")}×`;
  return `${ratio.toFixed(1)}×`;
}

/** Visible span: `200 ms window`, `12 s window`, `3:42 window`. */
export function spanLabel(span: number): string {
  if (span < 1) return `${Math.round(span * 1000)} ms window`;
  if (span < 60) return `${Math.round(span)} s window`;
  return `${formatTime(span).slice(0, -4)} window`;
}

/** Fade length label: `350 ms` below a second, else `4.0 s`. */
export function fadeLabel(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Signed delta in ms with a typographic minus: `−2.1 ms`. */
export function deltaMs(s: number): string {
  const v = s * 1000;
  return `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(1)} ms`;
}

export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} kB`;
  return `${n} B`;
}
