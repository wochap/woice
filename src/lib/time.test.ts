import { describe, expect, it } from "vitest";
import {
  deltaMs,
  fadeLabel,
  formatBytes,
  formatTime,
  parseTime,
  spanLabel,
  tickLabel,
  tickStep,
  ticks,
  zoomLabel,
} from "./time";

describe("time", () => {
  it("formats m:ss.mmm", () => {
    expect(formatTime(0)).toBe("0:00.000");
    expect(formatTime(61.204)).toBe("1:01.204");
    expect(formatTime(222.18)).toBe("3:42.180");
    expect(formatTime(-0.0021)).toBe("−0:00.002");
    expect(formatTime(3600)).toBe("60:00.000");
  });
  it("parses times and rejects junk", () => {
    expect(parseTime("3:00.000")).toBe(180);
    expect(parseTime("0:02.74")).toBeCloseTo(2.74);
    expect(parseTime("12.5")).toBe(12.5);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("1:75")).toBeNull();
    expect(parseTime("abc")).toBeNull();
    expect(parseTime("")).toBeNull();
    expect(parseTime("-1")).toBeNull();
  });
  it("chooses tick steps so majors are ≥ 86 px apart", () => {
    expect(tickStep(247.5, 980)).toBe(30);
    expect(tickStep(0.2, 980)).toBe(0.02);
    expect(tickStep(3600, 980)).toBe(120);
    expect(tickStep(0.001, 1000)).toBe(0.001);
    for (const [span, w] of [
      [10, 500],
      [1, 1280],
      [0.05, 640],
    ]) {
      expect((tickStep(span, w) / span) * w).toBeGreaterThanOrEqual(86);
    }
  });
  it("labels by step size", () => {
    expect(tickLabel(120, 30)).toBe("2:00");
    expect(tickLabel(6.3, 0.1)).toBe("0:06.3");
    expect(tickLabel(6.35, 0.01)).toBe("0:06.350");
  });
  it("lists four minors between majors", () => {
    const { step, ticks: t } = ticks(0, 10, 1000);
    expect(step).toBe(1);
    expect(t.filter((x) => x.major).length).toBe(11);
    expect(t.length).toBe(51);
  });
  it("labels zoom, spans, fades and deltas", () => {
    expect(zoomLabel(1)).toBe("Fit");
    expect(zoomLabel(12.43)).toBe("12.4×");
    expect(zoomLabel(1238.2)).toBe("1 238×");
    expect(spanLabel(0.2)).toBe("200 ms window");
    expect(spanLabel(24)).toBe("24 s window");
    expect(spanLabel(222)).toBe("3:42 window");
    expect(fadeLabel(350)).toBe("350 ms");
    expect(fadeLabel(4000)).toBe("4.0 s");
    expect(deltaMs(-0.0021)).toBe("−2.1 ms");
    expect(formatBytes(18_400_000)).toBe("18.4 MB");
  });
});
