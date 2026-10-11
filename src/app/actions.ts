import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import * as backend from "@/lib/backend";
import { PeakData } from "@/lib/peaks";
import type {
  AppError,
  ExportProgress,
  Format,
  LoadFailure,
  MediaInfo,
} from "@/lib/types";
import {
  withFadeIn,
  withFadeOut,
  withIn,
  withOut,
  type Doc,
} from "@/model/document";
import {
  defaultOutput,
  formatForExtension,
  resolveTarget,
  samePath,
  sourceExtension,
  withExtension,
} from "@/model/exportSettings";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { usePlayback } from "@/store/playback";
import { useUi, type Focus } from "@/store/ui";
import { ZOOM_STEP, useView } from "@/store/view";

// ---------- audio element ----------

let audio: HTMLAudioElement | null = null;
let proxied = false;
export function registerAudio(el: HTMLAudioElement | null) {
  audio = el;
}
export const getAudio = () => audio;

const duration = () => useMedia.getState().info?.duration ?? 0;
const clampT = (t: number) => Math.min(duration(), Math.max(0, t));

export function seek(t: number) {
  const v = clampT(t);
  usePlayback.setState({ playhead: v });
  if (audio) audio.currentTime = v;
  if (usePlayback.getState().playing) useView.getState().reveal(v);
}
export function pause() {
  audio?.pause();
  usePlayback.setState({ playing: false, selectionOnly: false });
}
export function togglePlay() {
  if (!audio || useMedia.getState().status !== "ready") return;
  if (usePlayback.getState().playing) return pause();
  const { playhead } = usePlayback.getState();
  if (playhead >= duration() - 0.001) seek(0);
  usePlayback.setState({ playing: true, selectionOnly: false });
  void audio.play().catch(() => usePlayback.setState({ playing: false }));
}
export function playSelection() {
  const doc = useDocument.getState().doc;
  if (!audio || !doc) return;
  seek(doc.in);
  usePlayback.setState({ playing: true, selectionOnly: true });
  void audio.play().catch(() => usePlayback.setState({ playing: false }));
}
export function toggleLoop() {
  usePlayback.setState((s) => ({ loop: !s.loop }));
}
export function setVolume(v: number) {
  const volume = Math.min(1, Math.max(0, v));
  usePlayback.setState({ volume });
  if (audio) audio.volume = volume;
}
/** Per-frame playback step: follows `currentTime`, loops or stops at Out. */
export function tickPlayback() {
  const doc = useDocument.getState().doc;
  const p = usePlayback.getState();
  if (!audio || !p.playing || !doc) return;
  let t = audio.currentTime;
  if ((p.loop || p.selectionOnly) && t >= doc.out - 0.01 && t < doc.out + 0.5) {
    if (p.loop) {
      audio.currentTime = doc.in;
      t = doc.in;
    } else {
      audio.pause();
      audio.currentTime = doc.out;
      usePlayback.setState({
        playing: false,
        selectionOnly: false,
        playhead: doc.out,
      });
      return;
    }
  }
  if (t >= duration()) {
    audio.pause();
    usePlayback.setState({ playing: false, playhead: duration() });
    return;
  }
  usePlayback.setState({ playhead: t });
  const v = useView.getState();
  if (v.span < v.duration && (t < v.start || t > v.start + v.span)) {
    useView.getState().set({ start: t - v.span * 0.05, span: v.span });
  }
}
/** Position to restore once the swapped-in proxy has loaded. */
let resume: { t: number; play: boolean } | null = null;
/** The webview could not decode the original: switch to a FLAC proxy, keeping the position. */
export async function onAudioError() {
  const { loadId, status } = useMedia.getState();
  if (!audio || proxied || status !== "ready") return;
  proxied = true;
  const { playhead, playing } = usePlayback.getState();
  try {
    const url = await backend.makeProxy(loadId);
    if (useMedia.getState().loadId !== loadId) return;
    resume = { t: playhead, play: playing };
    useMedia.setState({ previewUrl: url });
  } catch (e) {
    console.error("proxy failed", e);
    usePlayback.setState({ playing: false });
  }
}
export function onAudioLoaded() {
  if (!audio || !resume) return;
  audio.currentTime = resume.t;
  if (resume.play)
    void audio.play().catch(() => usePlayback.setState({ playing: false }));
  resume = null;
}

// ---------- loading ----------

let launchOutputPending = true;

function initialDoc(info: MediaInfo): Doc {
  const launch = useMedia.getState().launch;
  const format = launch?.format ?? "source";
  const quality = launch?.quality ?? "original";
  const output = launchOutputPending && launch?.output ? launch.output : null;
  launchOutputPending = false;
  const ext = resolveTarget(format, quality, false, info).ext;
  return {
    in: 0,
    out: info.duration,
    fadeIn: 0,
    fadeOut: 0,
    fadeCurve: launch?.fadeCurve ?? "s-curve",
    gainDb: 0,
    normalize: false,
    normalizeTarget: launch?.normalizeTarget ?? "-16lufs",
    declick: launch?.declick ?? true,
    format,
    quality,
    output:
      output ??
      defaultOutput(info, format === "source" ? sourceExtension(info) : ext),
    outputIsDefault: !output,
  };
}

function failureOf(e: unknown, path: string): LoadFailure {
  const err = e as AppError;
  if (err && err.kind === "load") return err.message as LoadFailure;
  const name = path.split("/").pop() ?? path;
  return {
    title: `Can’t read ${name}`,
    reason: "woice could not open this file.",
    detail: typeof err?.message === "string" ? err.message : String(e),
    path,
    size: null,
  };
}

export async function openFile(path: string) {
  const loadId = useMedia.getState().loadId + 1;
  pause();
  proxied = false;
  resume = null;
  useMedia.setState({
    status: "loading",
    loadId,
    info: null,
    failure: null,
    peaks: null,
    previewUrl: null,
  });
  usePlayback.setState({ playhead: 0, playing: false, selectionOnly: false });
  useUi.setState({
    focus: "playhead",
    focusEntry: null,
    snap: null,
    overlay: null,
    exportError: null,
  });
  let info: MediaInfo;
  try {
    info = await backend.loadInput(path, loadId);
  } catch (e) {
    if (useMedia.getState().loadId !== loadId) return;
    if ((e as AppError)?.kind === "stale_load") return;
    useMedia.setState({ status: "error", failure: failureOf(e, path) });
    useDocument.setState({ doc: null, history: null });
    return;
  }
  if (useMedia.getState().loadId !== loadId) return;
  const peaks = new PeakData(info.channels, info.sampleRate, info.duration);
  useDocument.getState().load(initialDoc(info));
  useView.getState().reset(info.duration, info.sampleRate);
  useMedia.setState({
    status: "ready",
    info,
    peaks,
    peaksVersion: 0,
    previewUrl: info.previewUrl,
  });
  backend
    .streamPeaks(loadId, (buf) => {
      if (useMedia.getState().loadId !== loadId) return;
      peaks.apply(buf);
      useMedia.setState((s) => ({ peaksVersion: s.peaksVersion + 1 }));
    })
    .catch((e) => {
      if (
        (e as AppError)?.kind === "stale_load" ||
        useMedia.getState().loadId !== loadId
      )
        return;
      console.error("peaks failed", e);
      peaks.done = true;
      useMedia.setState((s) => ({ peaksVersion: s.peaksVersion + 1 }));
    });
}

export async function openDialogAndLoad() {
  const exts = useMedia.getState().launch?.inputExtensions ?? [];
  const picked = await openDialog({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Audio and video",
        extensions: exts.flatMap((e) => [e, e.toUpperCase()]),
      },
    ],
  });
  if (typeof picked === "string") await openFile(picked);
}

// ---------- trim edits ----------

/** Snaps `t` to the nearest zero crossing when de-click is on (or `force`). */
async function snapped(
  t: number,
  edge: "in" | "out",
  force = false,
): Promise<number> {
  const doc = useDocument.getState().doc;
  const { loadId } = useMedia.getState();
  if (!doc || (!doc.declick && !force) || t <= 0 || t >= duration()) return t;
  try {
    const s = await backend.snapZeroCrossing(loadId, t);
    if (s.snapped)
      useUi.setState({
        snap: { requested: t, time: s.time, edge, key: String(Date.now()) },
      });
    return s.time;
  } catch {
    return t;
  }
}
const place = (d: Doc, edge: "in" | "out", t: number) =>
  edge === "in" ? withIn(d, t) : withOut(d, t, duration());

/** Commits a handle position (keys, fields, steppers), snapping when de-click is on. */
export async function commitHandle(
  edge: "in" | "out",
  t: number,
  burstKey?: string,
) {
  const v = await snapped(t, edge);
  useDocument.getState().edit((d) => place(d, edge, v), burstKey);
}
/** Live handle position during a drag; no history step. */
export function dragHandle(edge: "in" | "out", t: number) {
  useDocument.getState().preview((d) => place(d, edge, t));
}
/** Drag release: snap and record one step. */
export async function endHandleDrag(edge: "in" | "out") {
  const doc = useDocument.getState().doc;
  if (!doc) return;
  const v = await snapped(edge === "in" ? doc.in : doc.out, edge);
  useDocument.getState().preview((d) => place(d, edge, v));
  useDocument.getState().commit();
}
export const setIn = () => commitHandle("in", usePlayback.getState().playhead);
export const setOut = () =>
  commitHandle("out", usePlayback.getState().playhead);

export async function setDeclick(on: boolean) {
  const doc = useDocument.getState().doc;
  if (!doc) return;
  if (!on)
    return useDocument.getState().edit((d) => ({ ...d, declick: false }));
  const [a, b] = await Promise.all([
    snapped(doc.in, "in", true),
    snapped(doc.out, "out", true),
  ]);
  useDocument
    .getState()
    .edit((d) => withOut(withIn({ ...d, declick: true }, a), b, duration()));
}
export function setFadeIn(ms: number, commit = true) {
  const s = useDocument.getState();
  if (commit) s.edit((d) => withFadeIn(d, ms));
  else s.preview((d) => withFadeIn(d, ms));
}
export function setFadeOut(ms: number, commit = true) {
  const s = useDocument.getState();
  if (commit) s.edit((d) => withFadeOut(d, ms));
  else s.preview((d) => withFadeOut(d, ms));
}
export function toggleNormalize() {
  useDocument.getState().edit((d) => ({ ...d, normalize: !d.normalize }));
}

// ---------- focus / handle mode ----------

const ORDER: Focus[] = ["playhead", "in", "out"];
export function setFocus(focus: Focus) {
  const doc = useDocument.getState().doc;
  if (!doc) return;
  useUi.setState({
    focus,
    focusEntry: focus === "playhead" ? null : doc[focus],
  });
}
export async function confirmHandle() {
  const { focus } = useUi.getState();
  const doc = useDocument.getState().doc;
  if (focus !== "playhead" && doc) {
    const entry = useUi.getState().focusEntry;
    if (entry !== doc[focus]) {
      const v = await snapped(doc[focus], focus);
      useDocument.getState().preview((d) => place(d, focus, v));
    }
    useDocument.getState().commit();
  }
  useUi.setState({ focus: "playhead", focusEntry: null });
}
export function revertHandle() {
  useDocument.getState().revert();
  useUi.setState({ focus: "playhead", focusEntry: null });
}
export async function cycleFocus() {
  const { focus } = useUi.getState();
  const next = ORDER[(ORDER.indexOf(focus) + 1) % ORDER.length];
  if (focus !== "playhead") {
    const doc = useDocument.getState().doc;
    if (doc && useUi.getState().focusEntry !== doc[focus]) {
      const v = await snapped(doc[focus], focus);
      useDocument.getState().preview((d) => place(d, focus, v));
    }
    useDocument.getState().commit();
  }
  setFocus(next);
}
/** Moves the focused handle (preview) or the playhead. */
export function nudge(delta: number) {
  const { focus } = useUi.getState();
  const doc = useDocument.getState().doc;
  if (!doc) return;
  if (focus === "playhead")
    return seek(usePlayback.getState().playhead + delta);
  useDocument.getState().preview((d) => place(d, focus, d[focus] + delta));
  useView.getState().reveal(useDocument.getState().doc![focus]);
}
export function seekTo(to: "start" | "end" | "playhead") {
  const { focus } = useUi.getState();
  const ph = usePlayback.getState().playhead;
  const target = to === "start" ? 0 : to === "end" ? duration() : ph;
  if (focus === "playhead") return seek(target);
  useDocument.getState().preview((d) => place(d, focus, target));
}

// ---------- view ----------

export function zoomBy(factor: number) {
  useView.getState().zoomAt(usePlayback.getState().playhead, factor);
}
export const zoomIn = () => zoomBy(ZOOM_STEP);
export const zoomOut = () => zoomBy(1 / ZOOM_STEP);
export function zoomToSelection() {
  const doc = useDocument.getState().doc;
  if (doc) useView.getState().show(doc.in, doc.out);
}

// ---------- export ----------

export function setFormat(format: Format) {
  const info = useMedia.getState().info;
  useDocument.getState().edit((d) => {
    if (!info || !d.outputIsDefault) return { ...d, format };
    const ext = format === "source" ? sourceExtension(info) : format;
    return { ...d, format, output: withExtension(d.output, ext) };
  });
}
export async function chooseOutput() {
  const doc = useDocument.getState().doc;
  if (!doc) return;
  const picked = await saveDialog({ defaultPath: doc.output });
  if (!picked) return;
  const f = formatForExtension(picked);
  useDocument
    .getState()
    .edit((d) => ({
      ...d,
      output: picked,
      outputIsDefault: false,
      format: f ?? d.format,
    }));
}
export function outputError(): string | null {
  const doc = useDocument.getState().doc;
  const info = useMedia.getState().info;
  if (doc && info && samePath(doc.output, info.path))
    return "Choose a different file than the source";
  return null;
}
export async function runExport() {
  const doc = useDocument.getState().doc;
  const { info, loadId, launch } = useMedia.getState();
  if (!doc || !info || useUi.getState().overlay) return;
  if (outputError()) return;
  pause();
  useUi.setState({
    overlay: "export",
    exportError: null,
    result: null,
    progress: {
      outName: doc.output.split("/").pop() ?? doc.output,
      formatLine: "",
      percent: 0,
      steps: [],
    } satisfies ExportProgress,
  });
  try {
    const result = await backend.startExport({
      loadId,
      inS: doc.in,
      outS: doc.out,
      fadeInMs: doc.fadeIn,
      fadeOutMs: doc.fadeOut,
      fadeCurve: doc.fadeCurve,
      gainDb: doc.normalize ? 0 : doc.gainDb,
      normalize: doc.normalize ? doc.normalizeTarget : null,
      declick: doc.declick,
      format: doc.format,
      quality: doc.quality,
      output: doc.output,
    });
    if ((launch?.onDone ?? "exit") === "exit") {
      await backend.exitApplication();
      return;
    }
    useUi.setState({ overlay: "done", result, progress: null });
  } catch (e) {
    const err = e as AppError;
    useUi.setState({
      overlay: null,
      progress: null,
      exportError:
        err?.kind === "cancelled"
          ? null
          : typeof err?.message === "string"
            ? err.message
            : String(e),
    });
  }
}
export const cancelExport = () => backend.cancelExport();
export async function revealResult() {
  const r = useUi.getState().result;
  if (r) await backend.revealPath(r.path).catch((e) => console.error(e));
}
export const quit = () => backend.exitApplication();
