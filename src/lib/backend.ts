import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  ExportRequest,
  ExportResult,
  LaunchOptions,
  MediaInfo,
  Snap,
} from "./types";

export const takeLaunchOptions = () =>
  invoke<LaunchOptions>("take_launch_options");
export const exitApplication = () => invoke<void>("exit_application");
export const revealPath = (path: string) =>
  invoke<void>("reveal_path", { path });
export const loadInput = (path: string, loadId: number) =>
  invoke<MediaInfo>("load_input", { path, loadId });
export const makeProxy = (loadId: number) =>
  invoke<string>("make_proxy", { loadId });
export const snapZeroCrossing = (loadId: number, t: number) =>
  invoke<Snap>("snap_zero_crossing", { loadId, t });
export const startExport = (request: ExportRequest) =>
  invoke<ExportResult>("start_export", { request });
export const cancelExport = () => invoke<void>("cancel_export");

/** Streams peak chunks (raw f32 buffers) until the decode finishes. */
export function streamPeaks(
  loadId: number,
  onChunk: (buf: ArrayBuffer) => void,
) {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = onChunk;
  return invoke<void>("stream_peaks", { loadId, onChunk: channel });
}

export interface SampleWindow {
  startFrame: number;
  stride: number;
  frames: number;
  /** Interleaved samples. */
  data: Float32Array;
}
/** Raw samples of `[start, end]`, decimated to at most `maxFrames` frames. */
export async function readSamples(
  loadId: number,
  start: number,
  end: number,
  maxFrames: number,
): Promise<SampleWindow> {
  const buf = await invoke<ArrayBuffer>("read_samples", {
    loadId,
    start,
    end,
    maxFrames,
  });
  const f = new Float32Array(buf);
  return { startFrame: f[0], stride: f[1], frames: f[2], data: f.subarray(3) };
}
