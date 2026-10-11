export type ShortcutGroup =
  "Playback" | "Navigate" | "Trim" | "View" | "Edit" | "Actions";
export interface Shortcut {
  group: ShortcutGroup;
  /** Key caps in order. */
  keys: string[];
  /** Long label for the `?` reference. */
  label: string;
  /** KeyBar label; items without one never show in the KeyBar. */
  short?: string;
  /** KeyBar priority 1 (always) … 5 (widest windows only). */
  priority?: 1 | 2 | 3 | 4 | 5;
}

export const GROUPS: ShortcutGroup[] = [
  "Playback",
  "Navigate",
  "Trim",
  "View",
  "Edit",
  "Actions",
];

/** Every shortcut woice binds; the KeyBar and the `?` reference render from here. */
export const SHORTCUTS: Shortcut[] = [
  {
    group: "Playback",
    keys: ["Space"],
    label: "Play / pause",
    short: "Play",
    priority: 1,
  },
  {
    group: "Playback",
    keys: ["Shift", "Space"],
    label: "Play selection",
    short: "Play sel.",
    priority: 2,
  },
  {
    group: "Playback",
    keys: ["L"],
    label: "Loop selection",
    short: "Loop",
    priority: 3,
  },
  {
    group: "Navigate",
    keys: ["←", "→"],
    label: "Nudge ±100 ms",
    short: "Nudge",
    priority: 2,
  },
  { group: "Navigate", keys: ["Alt", "←", "→"], label: "Fine nudge ±10 ms" },
  { group: "Navigate", keys: ["Shift", "←", "→"], label: "Coarse nudge ±1 s" },
  { group: "Navigate", keys: ["PgUp", "PgDn"], label: "Jump ±10 s" },
  { group: "Navigate", keys: ["Home", "End"], label: "File start / end" },
  {
    group: "Navigate",
    keys: ["0", "…", "9"],
    label: "Jump to tenths of the file",
  },
  {
    group: "Trim",
    keys: ["I"],
    label: "Set In at playhead",
    short: "Set In",
    priority: 1,
  },
  {
    group: "Trim",
    keys: ["O"],
    label: "Set Out at playhead",
    short: "Set Out",
    priority: 1,
  },
  {
    group: "Trim",
    keys: ["Tab"],
    label: "Cycle focus: playhead → In → Out",
    short: "Focus handle",
    priority: 2,
  },
  {
    group: "View",
    keys: ["Ctrl", "=", "−"],
    label: "Zoom in / out",
    short: "Zoom",
    priority: 3,
  },
  {
    group: "View",
    keys: ["Ctrl", "0"],
    label: "Fit whole file",
    short: "Fit",
    priority: 4,
  },
  {
    group: "View",
    keys: ["Z"],
    label: "Zoom to selection",
    short: "Zoom sel.",
    priority: 4,
  },
  { group: "View", keys: ["Ctrl", "Wheel"], label: "Zoom at pointer" },
  {
    group: "Edit",
    keys: ["Ctrl", "Z"],
    label: "Undo",
    short: "Undo",
    priority: 5,
  },
  { group: "Edit", keys: ["Ctrl", "Shift", "Z"], label: "Redo" },
  {
    group: "Edit",
    keys: ["N"],
    label: "Toggle normalize",
    short: "Normalize",
    priority: 5,
  },
  {
    group: "Actions",
    keys: ["Enter"],
    label: "Export",
    short: "Export",
    priority: 1,
  },
  { group: "Actions", keys: ["Esc"], label: "Cancel / close overlay" },
  { group: "Actions", keys: ["Ctrl", "O"], label: "Open file" },
  {
    group: "Actions",
    keys: ["?"],
    label: "This reference",
    short: "Shortcuts",
    priority: 1,
  },
  { group: "Actions", keys: ["Ctrl", "Q"], label: "Quit" },
];

export interface BarItem {
  keys: string[];
  label: string;
}

/** Highest KeyBar priority that fits the window width. */
export function maxPriority(width: number): number {
  if (width >= 1360) return 5;
  if (width >= 1240) return 4;
  if (width >= 1000) return 3;
  if (width >= 760) return 2;
  return 1;
}

/** KeyBar items for the editor; "? Shortcuts" is returned separately, pinned right. */
export function editorBar(width: number): {
  items: BarItem[];
  pinned: BarItem;
} {
  const max = maxPriority(width);
  const all = SHORTCUTS.filter((s) => s.short && s.priority! <= max);
  const pinned = SHORTCUTS.find((s) => s.short === "Shortcuts")!;
  return {
    items: all
      .filter((s) => s !== pinned)
      .map((s) => ({ keys: s.keys, label: s.short! })),
    pinned: { keys: pinned.keys, label: pinned.short! },
  };
}

export const EMPTY_BAR: BarItem[] = [
  { keys: ["Ctrl", "O"], label: "Open" },
  { keys: ["Ctrl", "Q"], label: "Quit" },
];

/** KeyBar in handle mode, after the `IN HANDLE` / `OUT HANDLE` badge. */
export function handleBar(handle: "in" | "out"): BarItem[] {
  const In = handle === "in";
  return [
    { keys: ["←", "→"], label: "±100 ms" },
    { keys: ["Alt"], label: "±10 ms" },
    { keys: ["Shift"], label: "±1 s" },
    { keys: ["Home"], label: In ? "In → start" : "Out → playhead" },
    { keys: ["End"], label: In ? "In → playhead" : "Out → end" },
    { keys: ["Tab"], label: In ? "Next: Out" : "Next: playhead" },
    { keys: ["Enter"], label: "Confirm" },
    { keys: ["Esc"], label: "Revert" },
  ];
}

// ---------- key dispatch ----------

export type Mode =
  "empty" | "editor" | "handle-in" | "handle-out" | "help" | "export" | "done";

export type Action =
  | { type: "togglePlay" }
  | { type: "playSelection" }
  | { type: "toggleLoop" }
  | { type: "nudge"; delta: number }
  | { type: "seek"; to: "start" | "end" | "playhead" }
  | { type: "tenth"; n: number }
  | { type: "setIn" }
  | { type: "setOut" }
  | { type: "cycleFocus" }
  | { type: "confirmHandle" }
  | { type: "revertHandle" }
  | { type: "zoom"; factor: number }
  | { type: "fit" }
  | { type: "zoomSelection" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "toggleNormalize" }
  | { type: "export" }
  | { type: "escape" }
  | { type: "open" }
  | { type: "quit" }
  | { type: "help" }
  | { type: "cancelExport" }
  | { type: "keepEditing" }
  | { type: "reveal" };

export interface KeyLike {
  key: string;
  code?: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey?: boolean;
}

/** True for focused inputs, textareas and editable content. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement).isContentEditable
  )
    return true;
  return (
    el instanceof HTMLInputElement &&
    !["checkbox", "radio", "range", "button"].includes(el.type)
  );
}

/** Maps a key press to an action for the current mode; `null` lets it through. */
export function keyAction(
  e: KeyLike,
  mode: Mode,
  inTextField = false,
): Action | null {
  const k = e.key;
  const ctrl = e.ctrlKey || !!e.metaKey;
  if (mode === "export")
    return k === "Escape" ? { type: "cancelExport" } : null;
  if (mode === "done") {
    if (k === "Escape") return { type: "keepEditing" };
    if (k === "Enter") return { type: "reveal" };
    return null;
  }
  if (mode === "help")
    return k === "Escape" || k === "?" ? { type: "help" } : null;
  // Text fields own their keys; Esc/Enter are handled by the field itself.
  if (inTextField) return null;
  if (ctrl && !e.altKey) {
    const lower = k.toLowerCase();
    if (lower === "o") return { type: "open" };
    if (lower === "q") return { type: "quit" };
    if (mode === "empty") return null;
    if (lower === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
    if (k === "=" || k === "+") return { type: "zoom", factor: 1.5 };
    if (k === "-" || k === "_") return { type: "zoom", factor: 1 / 1.5 };
    if (k === "0") return { type: "fit" };
    return null;
  }
  if (k === "?") return { type: "help" };
  if (mode === "empty") return k === "Escape" ? { type: "escape" } : null;
  const handle = mode === "handle-in" || mode === "handle-out";
  switch (k) {
    case " ":
      return e.shiftKey ? { type: "playSelection" } : { type: "togglePlay" };
    case "ArrowLeft":
    case "ArrowRight": {
      const step = e.altKey ? 0.01 : e.shiftKey ? 1 : 0.1;
      return { type: "nudge", delta: k === "ArrowLeft" ? -step : step };
    }
    case "PageUp":
      return { type: "nudge", delta: -10 };
    case "PageDown":
      return { type: "nudge", delta: 10 };
    case "Home":
      return { type: "seek", to: mode === "handle-out" ? "playhead" : "start" };
    case "End":
      return { type: "seek", to: mode === "handle-in" ? "playhead" : "end" };
    case "Tab":
      return { type: "cycleFocus" };
    case "Enter":
      return handle ? { type: "confirmHandle" } : { type: "export" };
    case "Escape":
      return handle ? { type: "revertHandle" } : { type: "escape" };
  }
  if (e.altKey) return null;
  if (/^[0-9]$/.test(k) && !handle) return { type: "tenth", n: Number(k) };
  switch (k.toLowerCase()) {
    case "l":
      return { type: "toggleLoop" };
    case "i":
      return { type: "setIn" };
    case "o":
      return { type: "setOut" };
    case "n":
      return { type: "toggleNormalize" };
    case "z":
      return { type: "zoomSelection" };
  }
  return null;
}
