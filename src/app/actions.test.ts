import { beforeEach, describe, expect, it } from "vitest";
import { keyAction } from "@/lib/shortcuts";
import { canUndo } from "@/store/history";
import { useDocument } from "@/store/document";
import { usePlayback } from "@/store/playback";
import { useUi } from "@/store/ui";
import { loadDoc, media } from "@/test/fixtures";
import * as a from "./actions";
import { currentMode, perform } from "./perform";

const press = (key: string, mods: Partial<KeyboardEvent> = {}) => {
  const action = keyAction(
    { key, ctrlKey: false, shiftKey: false, altKey: false, ...mods },
    currentMode(),
  );
  if (action) perform(action);
  return action;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("loading", () => {
  it("starts with In 0 and Out = duration, and clears history", async () => {
    const { doc } = await loadDoc(media({ duration: 222.18 }));
    expect([doc().in, doc().out]).toEqual([0, 222.18]);
    expect(canUndo(useDocument.getState().history)).toBe(false);
    expect(doc().output).toBe("/home/u/Podcasts/ep117/ep117_coldopen-trim.m4a");
  });
  it("shows the error state for an unreadable file", async () => {
    const { mockBackend } = await import("@/test/fixtures");
    const { useMedia } = await import("@/store/media");
    mockBackend({
      load_input: () => {
        throw {
          kind: "load",
          message: {
            title: "Can’t read x.m4a",
            reason: "r",
            detail: "ffprobe: moov atom not found",
            path: "/d/x.m4a",
            size: 10,
          },
        };
      },
    });
    await a.openFile("/d/x.m4a");
    expect(useMedia.getState().status).toBe("error");
    expect(useMedia.getState().failure!.detail).toContain(
      "moov atom not found",
    );
  });
});

describe("keyboard navigation", () => {
  beforeEach(async () => {
    await loadDoc(media({ duration: 100 }), {
      snap_zero_crossing: ({ t }) => ({
        requested: t,
        time: t,
        snapped: false,
      }),
    });
    useDocument.getState().edit((d) => ({ ...d, declick: false }));
  });
  const ph = () => usePlayback.getState().playhead;
  it("moves the playhead by the nudge sizes and jumps", () => {
    press("5");
    expect(ph()).toBe(50);
    press("ArrowRight");
    expect(ph()).toBeCloseTo(50.1);
    press("ArrowLeft", { altKey: true });
    expect(ph()).toBeCloseTo(50.09);
    press("ArrowRight", { shiftKey: true });
    expect(ph()).toBeCloseTo(51.09);
    press("PageUp");
    expect(ph()).toBeCloseTo(41.09);
    press("End");
    expect(ph()).toBe(100);
    press("Home");
    expect(ph()).toBe(0);
  });
  it("sets In and Out at the playhead, clamped", async () => {
    press("6");
    press("i");
    await flush();
    expect(useDocument.getState().doc!.in).toBe(60);
    press("3");
    press("o");
    await flush();
    // Out cannot cross In: it stops 10 ms after it.
    expect(useDocument.getState().doc!.out).toBeCloseTo(60.01);
  });
  it("Tab cycles playhead → In → Out → playhead and shows handle mode", async () => {
    press("Tab");
    expect(useUi.getState().focus).toBe("in");
    expect(currentMode()).toBe("handle-in");
    press("Tab");
    await flush();
    expect(useUi.getState().focus).toBe("out");
    press("Tab");
    await flush();
    expect(useUi.getState().focus).toBe("playhead");
  });
  it("Esc reverts a nudged handle without an undo step", async () => {
    useDocument.getState().edit((d) => ({ ...d, in: 2.74 }));
    const steps = useDocument.getState().history!.past.length;
    press("Tab");
    for (let i = 0; i < 4; i++) press("ArrowRight");
    expect(useDocument.getState().doc!.in).toBeCloseTo(3.14);
    expect(ph()).toBe(0);
    press("Escape");
    expect(useDocument.getState().doc!.in).toBe(2.74);
    expect(useUi.getState().focus).toBe("playhead");
    expect(useDocument.getState().history!.past.length).toBe(steps);
  });
  it("Home/End move the focused handle to its targets; Enter confirms without exporting", async () => {
    usePlayback.setState({ playhead: 40 });
    press("Tab");
    press("End");
    expect(useDocument.getState().doc!.in).toBe(40);
    const action = press("Enter");
    expect(action).toEqual({ type: "confirmHandle" });
    await flush();
    expect(useUi.getState().overlay).toBeNull();
    expect(useDocument.getState().history!.present.in).toBe(40);
    press("Tab");
    press("Tab");
    await flush();
    // Out → playhead, kept 10 ms after In.
    press("Home");
    expect(useDocument.getState().doc!.out).toBeCloseTo(40.01);
  });
  it("Ctrl+Z undoes the last document change but not zoom", async () => {
    const { useView } = await import("@/store/view");
    press("5");
    press("i");
    await flush();
    press("=", { ctrlKey: true });
    const span = useView.getState().span;
    press("z", { ctrlKey: true });
    expect(useDocument.getState().doc!.in).toBe(0);
    expect(useView.getState().span).toBe(span);
  });
});

describe("auto de-click", () => {
  it("turning it on snaps In and Out as one undo step", async () => {
    await loadDoc(media({ duration: 10 }), {
      snap_zero_crossing: ({ t }) => ({
        requested: t,
        time: (t as number) - 0.0021,
        snapped: true,
      }),
    });
    useDocument
      .getState()
      .edit((d) => ({ ...d, declick: false, in: 6.4021, out: 9 }));
    await a.setDeclick(true);
    const d = useDocument.getState().doc!;
    expect(d.in).toBeCloseTo(6.4);
    expect(d.out).toBeCloseTo(8.9979);
    expect(useUi.getState().snap?.edge).toBeDefined();
    useDocument.getState().undo();
    expect(useDocument.getState().doc!.in).toBeCloseTo(6.4021);
    expect(useDocument.getState().doc!.declick).toBe(false);
  });
  it("keeps the requested time when there is no crossing nearby", async () => {
    await loadDoc(media({ duration: 10 }), {
      snap_zero_crossing: ({ t }) => ({
        requested: t,
        time: t,
        snapped: false,
      }),
    });
    usePlayback.setState({ playhead: 6.4 });
    await a.setIn();
    expect(useDocument.getState().doc!.in).toBe(6.4);
  });
  it("snaps a dragged handle once on release", async () => {
    let calls = 0;
    await loadDoc(media({ duration: 10 }), {
      snap_zero_crossing: ({ t }) => (
        calls++,
        { requested: t, time: 2.5, snapped: true }
      ),
    });
    const steps = useDocument.getState().history!.past.length;
    for (const t of [1, 2, 2.49]) a.dragHandle("in", t);
    expect(calls).toBe(0);
    await a.endHandleDrag("in");
    expect(calls).toBe(1);
    expect(useDocument.getState().doc!.in).toBe(2.5);
    expect(useDocument.getState().history!.past.length).toBe(steps + 1);
  });
});

describe("normalize and export settings", () => {
  beforeEach(() => loadDoc());
  it("N toggles normalize at the last target", () => {
    useDocument
      .getState()
      .edit((d) => ({ ...d, gainDb: 3, normalizeTarget: "-14lufs" }));
    press("n");
    expect(useDocument.getState().doc!.normalize).toBe(true);
    expect(useDocument.getState().doc!.normalizeTarget).toBe("-14lufs");
  });
  it("format changes update the default path extension", () => {
    a.setFormat("mp3");
    expect(useDocument.getState().doc!.output).toBe(
      "/home/u/Podcasts/ep117/ep117_coldopen-trim.mp3",
    );
  });
  it("blocks exporting over the source", () => {
    useDocument
      .getState()
      .edit((d) => ({
        ...d,
        output: "/home/u/Podcasts/ep117/../ep117/ep117_coldopen.m4a",
      }));
    expect(a.outputError()).toBe("Choose a different file than the source");
  });
  it("sends gain 0 when normalize is on", async () => {
    const { mockBackend } = await import("@/test/fixtures");
    let sent: Record<string, unknown> | null = null;
    mockBackend({
      start_export: ({ request }) => {
        sent = request as Record<string, unknown>;
        return {
          path: "/o.mp3",
          size: 1,
          formatLine: "",
          measuredLufs: null,
          actualStart: null,
          tookMs: 1,
          streamCopy: false,
        };
      },
    });
    useDocument.getState().edit((d) => ({ ...d, gainDb: 3, normalize: true }));
    const { useMedia } = await import("@/store/media");
    useMedia.setState((s) => ({
      launch: { ...(s.launch ?? ({} as never)), onDone: "stay" },
    }));
    await a.runExport();
    expect(sent!.gainDb).toBe(0);
    expect(sent!.normalize).toBe("-16lufs");
    expect(useUi.getState().overlay).toBe("done");
  });
});

describe("proxy fallback", () => {
  it("swaps to the FLAC proxy on a decode error and keeps the position", async () => {
    await loadDoc(media(), {
      make_proxy: () => "http://127.0.0.1:1/media?load=1&proxy=1",
    });
    const { useMedia } = await import("@/store/media");
    const el = document.createElement("audio");
    a.registerAudio(el);
    usePlayback.setState({ playhead: 42, playing: true });
    await a.onAudioError();
    expect(useMedia.getState().previewUrl).toContain("proxy=1");
    a.onAudioLoaded();
    expect(el.currentTime).toBe(42);
    expect(el.play).toHaveBeenCalled();
    // Only one proxy attempt per load.
    await a.onAudioError();
    a.registerAudio(null);
  });
});
