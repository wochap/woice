import { describe, expect, it } from "vitest";
import { LEVELS, PeakData, toDb } from "./peaks";

/** Builds a chunk the way media.rs encodes it, with constant peaks per level. */
function chunk(
  from: number,
  count: number,
  ch: number,
  v: (li: number, b: number, c: number) => [number, number, number],
  done = false,
) {
  const body: number[] = [from, count, 1, done ? 1 : 0, ch];
  LEVELS.forEach((l, li) => {
    const n = Math.ceil(count / (l / 256));
    for (let b = 0; b < n; b++)
      for (let c = 0; c < ch; c++) body.push(...v(li, b, c));
  });
  return new Float32Array(body).buffer;
}

describe("PeakData", () => {
  it("places chunks per level and tracks progress", () => {
    const p = new PeakData(2, 48000, 1);
    p.apply(
      chunk(0, 64, 2, (li, _b, c) => [-0.1 * (li + 1), 0.2 + c * 0.1, 0.05]),
    );
    expect(p.counts).toEqual([64, 16, 4, 1]);
    p.apply(chunk(64, 70, 2, () => [-0.9, 0.9, 0.5], true));
    expect(p.counts).toEqual([134, 34, 9, 3]);
    expect(p.done).toBe(true);
    const col = p.column(0, 1, 0, 0.1, { min: 0, max: 0, rms: 0 })!;
    expect(col.min).toBeCloseTo(-0.1);
    expect(col.max).toBeCloseTo(0.3);
  });
  it("merges channels and combines rms", () => {
    const p = new PeakData(2, 256, 4);
    p.apply(
      chunk(
        0,
        4,
        2,
        (_li, _b, c) => (c === 0 ? [-0.5, 0.1, 0.3] : [-0.2, 0.8, 0.4]),
        true,
      ),
    );
    const col = p.column(0, -1, 0, 4, { min: 0, max: 0, rms: 0 })!;
    expect(col.min).toBeCloseTo(-0.5);
    expect(col.max).toBeCloseTo(0.8);
    expect(col.rms).toBeCloseTo(Math.sqrt((0.09 + 0.16) / 2));
  });
  it("picks the coarsest level not wider than a pixel", () => {
    const p = new PeakData(1, 48000, 1);
    expect(p.levelFor(100)).toBe(-1);
    expect(p.levelFor(300)).toBe(0);
    expect(p.levelFor(2000)).toBe(1);
    expect(p.levelFor(1e6)).toBe(3);
  });
  it("finds the sample peak of a range", () => {
    const p = new PeakData(1, 256, 3);
    p.apply(
      chunk(
        0,
        3,
        1,
        (li, b) =>
          li === 0 && b === 1 ? [-0.83, 0.5, 0.2] : [-0.1, 0.1, 0.05],
        true,
      ),
    );
    expect(p.peak(0, 3)).toBeCloseTo(0.83);
    expect(p.peak(2, 3)).toBeCloseTo(0.1);
    expect(toDb(0.83)).toBeCloseTo(-1.62, 1);
  });
});
