import { ticks, tickLabel } from "@/lib/time";
import type { Colors } from "@/lib/theme";
import type { Column, PeakData } from "@/lib/peaks";
import { gainCurve } from "@/model/fades";
import type { FadeCurve } from "@/lib/types";
import type { SampleWindow } from "@/lib/backend";

/** −0.04 dBFS: columns at or above get clip caps. */
export const CLIP = Math.pow(10, -0.04 / 20);
/** Lane inset from the lane edge to full scale. */
export const LANE_INSET = 16;

export interface Viewport {
  start: number;
  span: number;
}
const xOf = (v: Viewport, w: number) => (t: number) =>
  ((t - v.start) / v.span) * w;

export function drawRuler(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: Viewport,
  c: Colors,
) {
  const { step, ticks: list } = ticks(v.start, v.start + v.span, w);
  const X = xOf(v, w);
  g.font = '500 10px "JetBrains Mono Variable", ui-monospace, monospace';
  for (const { t, major } of list) {
    const x = Math.round(X(t));
    g.fillStyle = c.tick;
    g.globalAlpha = major ? 0.9 : 0.5;
    g.fillRect(x, major ? h - 9 : h - 4, 1, major ? 9 : 4);
    if (major) {
      g.globalAlpha = 1;
      g.fillStyle = c.label;
      g.fillText(tickLabel(t, step), x + 4, 12);
    }
  }
  g.globalAlpha = 1;
}

/** Lane count: one per channel for mono/stereo, one merged lane above two channels. */
export const laneCount = (channels: number) => (channels > 2 ? 1 : channels);

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface StageScene {
  view: Viewport;
  peaks: PeakData;
  inT: number;
  outT: number;
  fadeIn: number;
  fadeOut: number;
  curve: FadeCurve;
  loading: boolean;
  samples: SampleWindow | null;
  colors: Colors;
}

/** Bars (peak + RMS) or the sample line, lanes, clip caps, skeleton and fades. */
export function drawStage(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: StageScene,
) {
  const { view: v, peaks, colors: c } = s;
  const X = xOf(v, w);
  const lanes = laneCount(peaks.channels);
  const laneH = h / lanes;
  const xIn = X(s.inT);
  const xOut = X(s.outT);
  const limit = s.loading ? Math.min(w, Math.max(0, X(peaks.decoded))) : w;
  const spp = (v.span * peaks.sampleRate) / w;
  const li = peaks.levelFor(spp);
  const col: Column = { min: 0, max: 0, rms: 0 };
  for (let lane = 0; lane < lanes; lane++) {
    const ch = lanes === 1 && peaks.channels > 1 ? -1 : lane;
    const cy = laneH * (lane + 0.5);
    const A = laneH / 2 - LANE_INSET;
    g.globalAlpha = 0.5;
    g.fillStyle = c.mid;
    g.fillRect(0, Math.round(cy), w, 1);
    if (lane > 0) {
      g.globalAlpha = 0.35;
      g.fillStyle = c.tick;
      g.fillRect(0, Math.round(laneH * lane), w, 1);
    }
    g.globalAlpha = 1;
    if (s.samples && li < 0 && !s.loading) {
      drawSampleLane(g, w, h, s, ch, cy, A, xIn, xOut);
      continue;
    }
    const level = Math.max(0, li);
    const peakIn = new Path2D();
    const peakOut = new Path2D();
    const rmsIn = new Path2D();
    const rmsOut = new Path2D();
    const caps: number[] = [];
    for (let x = 0; x < limit; x++) {
      const t0 = v.start + (x / w) * v.span;
      const t1 = v.start + ((x + 1) / w) * v.span;
      if (!peaks.column(level, ch, t0, t1, col)) break;
      const pk = Math.min(1, Math.max(Math.abs(col.min), Math.abs(col.max)));
      const rms = Math.min(pk, col.rms);
      const inside = s.loading || (x + 0.5 >= xIn && x + 0.5 <= xOut);
      (inside ? peakIn : peakOut).rect(
        x,
        cy - pk * A,
        1,
        Math.max(1, 2 * pk * A),
      );
      (inside ? rmsIn : rmsOut).rect(
        x,
        cy - rms * A,
        1,
        Math.max(1, 2 * rms * A),
      );
      if (pk >= CLIP) caps.push(x);
    }
    for (const [path, color, alpha] of [
      [peakOut, c.dim, 0.38],
      [rmsOut, c.dim, 0.82],
      [peakIn, c.wave, 0.38],
      [rmsIn, c.wave, 0.82],
    ] as const) {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fill(path);
    }
    g.globalAlpha = 1;
    g.fillStyle = c.peak;
    for (const x of caps) {
      g.fillRect(x, cy - A - 1, 1, 3);
      g.fillRect(x, cy + A - 2, 1, 3);
    }
    if (s.loading) {
      g.fillStyle = c.skeleton;
      let x = limit + 8;
      let k = 0;
      while (x < w) {
        const sw = 26 + hash(k * 3.1 + lane) * 80;
        const sh = A * (0.22 + 0.5 * hash(k * 7.7 + lane * 3));
        g.beginPath();
        g.roundRect(x, cy - sh, Math.min(sw, w - x), sh * 2, 5);
        g.fill();
        x += sw + 6;
        k++;
      }
    }
  }
  if (s.loading) return;
  drawFades(g, w, h, s, X, li < 0 && !!s.samples);
}

function drawSampleLane(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: StageScene,
  ch: number,
  cy: number,
  A: number,
  xIn: number,
  xOut: number,
) {
  const win = s.samples!;
  const n = s.peaks.channels;
  const rate = s.peaks.sampleRate;
  const X = xOf(s.view, w);
  const path = new Path2D();
  let first = true;
  let lastX = 0;
  for (let i = 0; i < win.frames; i++) {
    let v = 0;
    if (ch < 0) {
      for (let c = 0; c < n; c++) v += win.data[i * n + c];
      v /= n;
    } else v = win.data[i * n + ch];
    const x = X((win.startFrame + i * win.stride) / rate);
    const y = cy - Math.max(-1, Math.min(1, v)) * A;
    if (first) {
      path.moveTo(x, y);
      first = false;
    } else path.lineTo(x, y);
    lastX = x;
  }
  const fill = new Path2D(path);
  fill.lineTo(lastX, cy);
  fill.lineTo(X(win.startFrame / rate), cy);
  fill.closePath();
  const seg = (x0: number, x1: number, color: string) => {
    x0 = Math.max(0, x0);
    x1 = Math.min(w, x1);
    if (x1 <= x0) return;
    g.save();
    g.beginPath();
    g.rect(x0, 0, x1 - x0, h);
    g.clip();
    g.fillStyle = color;
    g.globalAlpha = 0.13;
    g.fill(fill);
    g.globalAlpha = 1;
    g.strokeStyle = color;
    g.lineWidth = 1.6;
    g.lineJoin = "round";
    g.stroke(path);
    g.restore();
  };
  seg(0, xIn, s.colors.dim);
  seg(xIn, xOut, s.colors.wave);
  seg(xOut, w, s.colors.dim);
}

function drawFades(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: StageScene,
  X: (t: number) => number,
  samples: boolean,
) {
  const top = 3;
  const bot = h - 3;
  const fade = (a: number, b: number, dir: 1 | -1) => {
    const xa = Math.max(0, X(a));
    const xb = Math.min(w, X(b));
    if (xb <= xa) return;
    const pts: [number, number][] = [];
    for (let x = xa; x <= xb + 0.01; x += 1) {
      const px = Math.min(x, xb);
      const t = s.view.start + (px / w) * s.view.span;
      const u = (t - a) / (b - a);
      const gain = dir > 0 ? gainCurve(u, s.curve) : gainCurve(1 - u, s.curve);
      pts.push([px, top + (1 - gain) * (bot - top)]);
    }
    g.beginPath();
    g.moveTo(xa, top);
    for (const [x, y] of pts) g.lineTo(x, y);
    g.lineTo(xb, top);
    g.closePath();
    g.fillStyle = s.colors.fade;
    g.globalAlpha = samples ? 0.08 : 0.2;
    g.fill();
    g.globalAlpha = 0.95;
    g.strokeStyle = s.colors.fade;
    g.lineWidth = 1.5;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.globalAlpha = 1;
  };
  if (s.fadeIn > 0) fade(s.inT, s.inT + s.fadeIn / 1000, 1);
  if (s.fadeOut > 0) fade(s.outT - s.fadeOut / 1000, s.outT, -1);
}

/** Whole file, channels merged, kept region in the wave colour. */
export function drawOverview(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  peaks: PeakData,
  inT: number,
  outT: number,
  loading: boolean,
  c: Colors,
) {
  const cy = h / 2;
  const A = h / 2 - 4;
  const dur = peaks.duration;
  const li = Math.max(0, peaks.levelFor((dur * peaks.sampleRate) / w));
  const col: Column = { min: 0, max: 0, rms: 0 };
  const xIn = (inT / dur) * w;
  const xOut = (outT / dur) * w;
  const keep = new Path2D();
  const rest = new Path2D();
  let L = 0;
  for (let x = 0; x < w; x++) {
    if (!peaks.column(li, -1, (x / w) * dur, ((x + 1) / w) * dur, col)) break;
    const pk = Math.min(1, Math.max(Math.abs(col.min), Math.abs(col.max)));
    const inside = loading || (x + 0.5 >= xIn && x + 0.5 <= xOut);
    (inside ? keep : rest).rect(x, cy - pk * A, 1, Math.max(1, 2 * pk * A));
    L = x + 1;
  }
  g.fillStyle = c.dim;
  g.globalAlpha = 0.6;
  g.fill(rest);
  g.fillStyle = c.wave;
  g.globalAlpha = loading ? 0.8 : 0.85;
  g.fill(keep);
  if (loading && L < w - 4) {
    g.globalAlpha = 1;
    g.fillStyle = c.skeleton;
    g.fillRect(L + 4, cy - 3, w - L - 4, 6);
  }
  g.globalAlpha = 1;
}
