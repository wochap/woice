import type { Doc } from "@/model/document";

export const HISTORY_CAP = 200;
/** Consecutive nudges of the same target within this window are one undo step. */
export const BURST_MS = 600;

/** Snapshot undo/redo over the serialisable document. */
export interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
  /** Key and time of the last commit, for coalescing nudge bursts. */
  burst: { key: string; at: number } | null;
}

export function reset(doc: Doc): History {
  return { past: [], present: doc, future: [], burst: null };
}

export function commit(
  h: History,
  next: Doc,
  burstKey?: string,
  now = Date.now(),
): History {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  const burst = burstKey ? { key: burstKey, at: now } : null;
  if (burstKey && h.burst?.key === burstKey && now - h.burst.at <= BURST_MS) {
    return { ...h, present: next, future: [], burst };
  }
  const past = [...h.past, h.present];
  if (past.length > HISTORY_CAP) past.splice(0, past.length - HISTORY_CAP);
  return { past, present: next, future: [], burst };
}

export function undo(h: History): History {
  if (!canUndo(h)) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    burst: null,
  };
}

export function redo(h: History): History {
  if (!canRedo(h)) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    burst: null,
  };
}

export const canUndo = (h: History | null) => !!h && h.past.length > 0;
export const canRedo = (h: History | null) => !!h && h.future.length > 0;
