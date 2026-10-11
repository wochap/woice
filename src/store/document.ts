import { create } from "zustand";
import type { Doc } from "@/model/document";
import * as H from "./history";

interface DocumentState {
  /** Live document; differs from `history.present` only during a drag or handle edit. */
  doc: Doc | null;
  history: H.History | null;
  /** Replaces the document and clears undo history (new file). */
  load(doc: Doc): void;
  /** Shows a transient change without recording a step (drags, handle mode). */
  preview(update: (d: Doc) => Doc): void;
  /** Records the live document as one step; `burstKey` coalesces nudge bursts. */
  commit(burstKey?: string): void;
  /** Applies and records in one go. */
  edit(update: (d: Doc) => Doc, burstKey?: string): void;
  /** Drops transient changes. */
  revert(): void;
  undo(): void;
  redo(): void;
}

export const useDocument = create<DocumentState>()((set, get) => ({
  doc: null,
  history: null,
  load(doc) {
    set({ doc, history: H.reset(doc) });
  },
  preview(update) {
    const { doc } = get();
    if (doc) set({ doc: update(doc) });
  },
  commit(burstKey) {
    const { doc, history } = get();
    if (!doc || !history) return;
    const next = H.commit(history, doc, burstKey);
    set({ history: next, doc: next.present });
  },
  edit(update, burstKey) {
    get().preview(update);
    get().commit(burstKey);
  },
  revert() {
    const { history } = get();
    if (history) set({ doc: history.present });
  },
  undo() {
    const { history } = get();
    if (!history || !H.canUndo(history)) return;
    const next = H.undo(history);
    set({ history: next, doc: next.present });
  },
  redo() {
    const { history } = get();
    if (!history || !H.canRedo(history)) return;
    const next = H.redo(history);
    set({ history: next, doc: next.present });
  },
}));
