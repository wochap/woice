import { describe, expect, it } from "vitest";
import { clampView, minSpanFor, viewFor, zoomAround } from "./view";

describe("view math", () => {
  it("zooms around a point keeping it under the pointer", () => {
    const v = { start: 0, span: 200 };
    const z = zoomAround(v, 90, 2, 200, 0.001);
    expect(z.span).toBe(100);
    // 90 s was at 45 % of the window and stays there.
    expect((90 - z.start) / z.span).toBeCloseTo(0.45);
  });
  it("clamps to the file and to 2 px per sample", () => {
    const min = minSpanFor(1000, 48000);
    expect(min).toBeCloseTo(1000 / 96000);
    expect(
      zoomAround({ start: 0, span: 1 }, 0.5, 1e6, 200, min).span,
    ).toBeCloseTo(min);
    expect(zoomAround({ start: 0, span: 100 }, 50, 0.01, 200, min)).toEqual({
      start: 0,
      span: 200,
    });
    expect(clampView({ start: 190, span: 20 }, 200, min)).toEqual({
      start: 180,
      span: 20,
    });
    expect(clampView({ start: -5, span: 20 }, 200, min).start).toBe(0);
  });
  it("frames a selection with 5 % margin", () => {
    const v = viewFor(10, 19, 200, 0.001);
    expect(v.span).toBeCloseTo(10);
    expect(v.start).toBeCloseTo(9.5);
  });
});
