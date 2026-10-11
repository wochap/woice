import { describe, expect, it } from "vitest";
import { clampFade, gainCurve } from "./fades";

describe("fades", () => {
  it("draws the export curves", () => {
    for (const c of ["linear", "exp", "s-curve"] as const) {
      expect(gainCurve(0, c)).toBe(0);
      expect(gainCurve(1, c)).toBe(1);
    }
    expect(gainCurve(0.5, "linear")).toBe(0.5);
    expect(gainCurve(0.5, "exp")).toBe(0.125);
    expect(gainCurve(0.5, "s-curve")).toBeCloseTo(0.5);
    expect(gainCurve(0.25, "s-curve")).toBeCloseTo(
      (1 - Math.cos(Math.PI / 4)) / 2,
    );
    expect(gainCurve(2, "linear")).toBe(1);
  });
  it("clamps the sum to the selection", () => {
    // 2 s selection, fade-in 1.5 s → fade-out of 1 s is clamped to 500 ms.
    expect(clampFade(1000, 1500, 2000)).toBe(500);
    expect(clampFade(300, 0, 2000)).toBe(300);
    expect(clampFade(-5, 0, 2000)).toBe(0);
  });
});
