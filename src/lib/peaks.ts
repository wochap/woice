/** Bucket sizes of the Rust peak pyramid, in samples. */
export const LEVELS = [256, 1024, 4096, 16384] as const;
const HEADER = 5;

export interface Column {
  min: number;
  max: number;
  rms: number;
}

/**
 * Peak pyramid for one file, filled progressively from `stream_peaks` chunks.
 * Each level stores `[bucket][channel][min, max, rms]` as f32.
 */
export class PeakData {
  readonly levels: Float32Array[];
  readonly counts = [0, 0, 0, 0];
  /** Seconds of audio decoded so far. */
  decoded = 0;
  done = false;

  constructor(
    readonly channels: number,
    readonly sampleRate: number,
    readonly duration: number,
  ) {
    const base = Math.ceil((duration * sampleRate) / LEVELS[0]) + 64;
    this.levels = LEVELS.map(
      (l) => new Float32Array(Math.ceil((base * LEVELS[0]) / l) * channels * 3),
    );
  }

  /** Applies one binary chunk; see `PeakBuilder::encode` in media.rs. */
  apply(buf: ArrayBuffer) {
    const f = new Float32Array(buf);
    const [from, count, decoded, done, ch] = f;
    if (ch !== this.channels) return;
    let off = HEADER;
    LEVELS.forEach((l, li) => {
      const factor = l / LEVELS[0];
      const start = Math.floor(from / factor);
      const n = Math.ceil(count / factor);
      const len = n * ch * 3;
      this.ensure(li, (start + n) * ch * 3);
      this.levels[li].set(f.subarray(off, off + len), start * ch * 3);
      this.counts[li] = Math.max(this.counts[li], start + n);
      off += len;
    });
    this.decoded = decoded;
    this.done = done === 1;
  }

  private ensure(li: number, size: number) {
    const cur = this.levels[li];
    if (size <= cur.length) return;
    const next = new Float32Array(Math.max(size, cur.length * 2));
    next.set(cur);
    this.levels[li] = next;
  }

  /** Coarsest level whose bucket is at most `spp` samples; `-1` when finer than the base. */
  levelFor(spp: number): number {
    if (spp < LEVELS[0]) return -1;
    let li = 0;
    while (li + 1 < LEVELS.length && LEVELS[li + 1] <= spp) li++;
    return li;
  }

  /** Aggregate of `[t0, t1)` for `channel`, or all channels merged when `channel` is -1. */
  column(
    li: number,
    channel: number,
    t0: number,
    t1: number,
    out: Column,
  ): Column | null {
    const size = LEVELS[li];
    const b0 = Math.max(0, Math.floor((t0 * this.sampleRate) / size));
    const b1 = Math.min(
      this.counts[li],
      Math.max(b0 + 1, Math.ceil((t1 * this.sampleRate) / size)),
    );
    if (b0 >= b1) return null;
    const data = this.levels[li];
    const ch = this.channels;
    const c0 = channel < 0 ? 0 : channel;
    const c1 = channel < 0 ? ch : channel + 1;
    let min = Infinity;
    let max = -Infinity;
    let sq = 0;
    let n = 0;
    for (let b = b0; b < b1; b++) {
      for (let c = c0; c < c1; c++) {
        const i = (b * ch + c) * 3;
        if (data[i] < min) min = data[i];
        if (data[i + 1] > max) max = data[i + 1];
        sq += data[i + 2] * data[i + 2];
        n++;
      }
    }
    out.min = min;
    out.max = max;
    out.rms = Math.sqrt(sq / n);
    return out;
  }

  /** Absolute sample peak (linear) across channels in `[t0, t1]`, from the finest level. */
  peak(t0: number, t1: number): number {
    const data = this.levels[0];
    const ch = this.channels;
    const b0 = Math.max(0, Math.floor((t0 * this.sampleRate) / LEVELS[0]));
    const b1 = Math.min(
      this.counts[0],
      Math.ceil((t1 * this.sampleRate) / LEVELS[0]),
    );
    let p = 0;
    for (let i = b0 * ch * 3; i < b1 * ch * 3; i += 3) {
      const v = Math.max(-data[i], data[i + 1]);
      if (v > p) p = v;
    }
    return p;
  }
}

export const toDb = (linear: number) =>
  linear > 0 ? 20 * Math.log10(linear) : -Infinity;
