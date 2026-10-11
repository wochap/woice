import { describe, expect, it } from "vitest";
import {
  editorBar,
  handleBar,
  isTextField,
  keyAction,
  maxPriority,
  SHORTCUTS,
  type KeyLike,
} from "./shortcuts";

const key = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  key,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("registry and KeyBar", () => {
  it("holds every spec shortcut once", () => {
    const labels = SHORTCUTS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(
      SHORTCUTS.filter((s) => s.short).map((s) => `${s.short}:${s.priority}`),
    ).toEqual([
      "Play:1",
      "Play sel.:2",
      "Loop:3",
      "Nudge:2",
      "Set In:1",
      "Set Out:1",
      "Focus handle:2",
      "Zoom:3",
      "Fit:4",
      "Zoom sel.:4",
      "Undo:5",
      "Normalize:5",
      "Export:1",
      "Shortcuts:1",
    ]);
  });
  it("filters by width", () => {
    expect([1400, 1280, 1000, 760, 640].map(maxPriority)).toEqual([
      5, 4, 3, 2, 1,
    ]);
    const at = (w: number) => editorBar(w).items.map((i) => i.label);
    expect(at(1280)).toEqual([
      "Play",
      "Play sel.",
      "Loop",
      "Nudge",
      "Set In",
      "Set Out",
      "Focus handle",
      "Zoom",
      "Fit",
      "Zoom sel.",
      "Export",
    ]);
    expect(at(1280)).not.toContain("Undo");
    expect(at(1000)).toEqual([
      "Play",
      "Play sel.",
      "Loop",
      "Nudge",
      "Set In",
      "Set Out",
      "Focus handle",
      "Zoom",
      "Export",
    ]);
    expect(at(640)).toEqual(["Play", "Set In", "Set Out", "Export"]);
    expect(editorBar(640).pinned.label).toBe("Shortcuts");
  });
  it("describes handle targets", () => {
    expect(handleBar("in").map((i) => i.label)).toContain("In → playhead");
    expect(handleBar("out").map((i) => i.label)).toContain("Out → end");
  });
});

describe("keyAction", () => {
  it("maps editor keys", () => {
    expect(keyAction(key(" "), "editor")).toEqual({ type: "togglePlay" });
    expect(keyAction(key(" ", { shiftKey: true }), "editor")).toEqual({
      type: "playSelection",
    });
    expect(keyAction(key("ArrowRight"), "editor")).toEqual({
      type: "nudge",
      delta: 0.1,
    });
    expect(keyAction(key("ArrowLeft", { altKey: true }), "editor")).toEqual({
      type: "nudge",
      delta: -0.01,
    });
    expect(keyAction(key("ArrowRight", { shiftKey: true }), "editor")).toEqual({
      type: "nudge",
      delta: 1,
    });
    expect(keyAction(key("PageUp"), "editor")).toEqual({
      type: "nudge",
      delta: -10,
    });
    expect(keyAction(key("7"), "editor")).toEqual({ type: "tenth", n: 7 });
    expect(keyAction(key("I"), "editor")).toEqual({ type: "setIn" });
    expect(keyAction(key("o"), "editor")).toEqual({ type: "setOut" });
    expect(keyAction(key("z", { ctrlKey: true }), "editor")).toEqual({
      type: "undo",
    });
    expect(
      keyAction(key("Z", { ctrlKey: true, shiftKey: true }), "editor"),
    ).toEqual({ type: "redo" });
    expect(keyAction(key("="), "editor")).toBeNull();
    expect(keyAction(key("=", { ctrlKey: true }), "editor")).toEqual({
      type: "zoom",
      factor: 1.5,
    });
    expect(keyAction(key("0", { ctrlKey: true }), "editor")).toEqual({
      type: "fit",
    });
    expect(keyAction(key("Enter"), "editor")).toEqual({ type: "export" });
  });
  it("routes navigation to the focused handle", () => {
    expect(keyAction(key("Home"), "handle-in")).toEqual({
      type: "seek",
      to: "start",
    });
    expect(keyAction(key("End"), "handle-in")).toEqual({
      type: "seek",
      to: "playhead",
    });
    expect(keyAction(key("Home"), "handle-out")).toEqual({
      type: "seek",
      to: "playhead",
    });
    expect(keyAction(key("End"), "handle-out")).toEqual({
      type: "seek",
      to: "end",
    });
    expect(keyAction(key("Enter"), "handle-in")).toEqual({
      type: "confirmHandle",
    });
    expect(keyAction(key("Escape"), "handle-out")).toEqual({
      type: "revertHandle",
    });
    expect(keyAction(key("3"), "handle-in")).toBeNull();
  });
  it("suppresses document shortcuts while a text field has focus", () => {
    for (const k of [
      key("1"),
      key("i"),
      key(" "),
      key("n"),
      key("z", { ctrlKey: true }),
      key("Enter"),
    ]) {
      expect(keyAction(k, "editor", true)).toBeNull();
    }
    const input = document.createElement("input");
    expect(isTextField(input)).toBe(true);
    input.type = "checkbox";
    expect(isTextField(input)).toBe(false);
    expect(isTextField(document.createElement("button"))).toBe(false);
  });
  it("limits the empty state and overlays", () => {
    expect(keyAction(key("o", { ctrlKey: true }), "empty")).toEqual({
      type: "open",
    });
    expect(keyAction(key(" "), "empty")).toBeNull();
    expect(keyAction(key("z", { ctrlKey: true }), "empty")).toBeNull();
    expect(keyAction(key("?"), "help")).toEqual({ type: "help" });
    expect(keyAction(key(" "), "help")).toBeNull();
    expect(keyAction(key("Escape"), "export")).toEqual({
      type: "cancelExport",
    });
    expect(keyAction(key("Enter"), "export")).toBeNull();
    expect(keyAction(key("Enter"), "done")).toEqual({ type: "reveal" });
    expect(keyAction(key("Escape"), "done")).toEqual({ type: "keepEditing" });
  });
});
