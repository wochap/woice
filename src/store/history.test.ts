import { beforeEach, describe, expect, it } from "vitest";
import {
  withFadeIn,
  withFadeOut,
  withIn,
  withOut,
  type Doc,
} from "@/model/document";
import { useDocument } from "./document";
import * as H from "./history";

const DUR = 222.18;
export const baseDoc = (over: Partial<Doc> = {}): Doc => ({
  in: 0,
  out: DUR,
  fadeIn: 0,
  fadeOut: 0,
  fadeCurve: "s-curve",
  gainDb: 0,
  normalize: false,
  normalizeTarget: "-16lufs",
  declick: false,
  format: "source",
  quality: "original",
  output: "/x/a-trim.m4a",
  outputIsDefault: true,
  ...over,
});
const s = () => useDocument.getState();

describe("document model", () => {
  it("starts at 0 … duration and keeps 10 ms between handles", () => {
    const d = baseDoc({ out: 3 });
    expect(withIn(d, 5).in).toBeCloseTo(2.99);
    expect(withOut(d, -1, DUR).out).toBeCloseTo(0.01);
    expect(withOut(d, 999, DUR).out).toBe(DUR);
    expect(withIn(d, -4).in).toBe(0);
  });
  it("clamps fades to the selection", () => {
    const d = withFadeIn(baseDoc({ in: 0, out: 2 }), 1500);
    expect(withFadeOut(d, 1000).fadeOut).toBe(500);
    // Shrinking the range refits existing fades.
    const shrunk = withOut(withFadeOut(baseDoc({ out: 10 }), 4000), 2, DUR);
    expect(shrunk.fadeOut).toBe(2000);
  });
});

describe("history", () => {
  beforeEach(() => s().load(baseDoc()));
  it("records one step per drag (preview … commit)", () => {
    s().edit((d) => withOut(d, 222.18, DUR));
    s().load(baseDoc({ out: 222.18 }));
    for (const t of [221, 220, 219.5, 218.115])
      s().preview((d) => withOut(d, t, DUR));
    s().commit();
    expect(s().doc!.out).toBe(218.115);
    s().undo();
    expect(s().doc!.out).toBe(222.18);
    expect(H.canUndo(s().history)).toBe(false);
  });
  it("coalesces a nudge burst into one step", () => {
    s().edit((d) => withIn(d, 2.74));
    for (let i = 1; i <= 5; i++)
      s().edit((d) => withIn(d, d.in + 0.1), "nudge:in");
    expect(s().doc!.in).toBeCloseTo(3.24);
    s().undo();
    expect(s().doc!.in).toBeCloseTo(2.74);
  });
  it("does not coalesce bursts on different targets or after the window", () => {
    let h = H.reset(baseDoc());
    h = H.commit(h, baseDoc({ in: 1 }), "nudge:in", 0);
    h = H.commit(h, baseDoc({ in: 1, out: 5 }), "nudge:out", 100);
    h = H.commit(
      h,
      baseDoc({ in: 1, out: 6 }),
      "nudge:out",
      100 + H.BURST_MS + 1,
    );
    expect(h.past.length).toBe(3);
  });
  it("clears redo on a new edit and caps at 200 steps", () => {
    s().edit((d) => ({ ...d, gainDb: 1 }));
    s().undo();
    expect(H.canRedo(s().history)).toBe(true);
    s().edit((d) => ({ ...d, gainDb: 2 }));
    expect(H.canRedo(s().history)).toBe(false);
    for (let i = 0; i < 250; i++)
      s().edit((d) => ({ ...d, gainDb: (i % 48) / 2 - 12 + (i % 2) * 0.5 }));
    expect(s().history!.past.length).toBeLessThanOrEqual(H.HISTORY_CAP);
  });
  it("revert drops a preview without a step", () => {
    s().preview((d) => withIn(d, 3.14));
    s().revert();
    expect(s().doc!.in).toBe(0);
    expect(H.canUndo(s().history)).toBe(false);
  });
  it("ignores no-op commits", () => {
    s().edit((d) => d);
    expect(H.canUndo(s().history)).toBe(false);
  });
  it("load clears history", () => {
    s().edit((d) => ({ ...d, gainDb: 3 }));
    s().load(baseDoc());
    expect(H.canUndo(s().history)).toBe(false);
  });
});
