import {
  isTextField,
  keyAction,
  type Action,
  type Mode,
} from "@/lib/shortcuts";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { useUi } from "@/store/ui";
import { useView } from "@/store/view";
import { usePlayback } from "@/store/playback";
import * as a from "./actions";

export function currentMode(): Mode {
  const { overlay, focus } = useUi.getState();
  if (overlay) return overlay;
  if (useMedia.getState().status !== "ready") return "empty";
  if (focus === "in") return "handle-in";
  if (focus === "out") return "handle-out";
  return "editor";
}

export function perform(action: Action) {
  switch (action.type) {
    case "togglePlay":
      return a.togglePlay();
    case "playSelection":
      return a.playSelection();
    case "toggleLoop":
      return a.toggleLoop();
    case "nudge":
      return a.nudge(action.delta);
    case "seek":
      return a.seekTo(action.to);
    case "tenth":
      return a.seek(
        ((useMedia.getState().info?.duration ?? 0) * action.n) / 10,
      );
    case "setIn":
      return void a.setIn();
    case "setOut":
      return void a.setOut();
    case "cycleFocus":
      return void a.cycleFocus();
    case "confirmHandle":
      return void a.confirmHandle();
    case "revertHandle":
      return a.revertHandle();
    case "zoom":
      return a.zoomBy(action.factor);
    case "fit":
      return useView.getState().fit();
    case "zoomSelection":
      return a.zoomToSelection();
    case "undo":
      return useDocument.getState().undo();
    case "redo":
      return useDocument.getState().redo();
    case "toggleNormalize":
      return a.toggleNormalize();
    case "export":
      return void a.runExport();
    case "escape":
      if (useUi.getState().drawer) useUi.setState({ drawer: false });
      else if (usePlayback.getState().playing) a.pause();
      return;
    case "open":
      return void a.openDialogAndLoad();
    case "quit":
      return void a.quit();
    case "help":
      return useUi.setState((s) => ({
        overlay: s.overlay === "help" ? null : "help",
      }));
    case "cancelExport":
      return void a.cancelExport();
    case "keepEditing":
      return useUi.setState({ overlay: null, result: null });
    case "reveal":
      return void a.revealResult();
  }
}

/** Global key handler: ignores text fields, never lets Alt+arrow navigate the webview. */
export function onKeyDown(e: KeyboardEvent) {
  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
    e.preventDefault();
  const field = isTextField(document.activeElement);
  // Sliders and segmented radios keep their own arrow keys.
  const role = (document.activeElement as HTMLElement | null)?.getAttribute?.(
    "role",
  );
  if (
    !field &&
    (role === "slider" ||
      (document.activeElement as HTMLInputElement | null)?.type === "radio") &&
    e.key.startsWith("Arrow")
  )
    return;
  const action = keyAction(e, currentMode(), field);
  if (!action) return;
  e.preventDefault();
  e.stopPropagation();
  perform(action);
}
