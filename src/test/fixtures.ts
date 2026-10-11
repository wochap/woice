import { invoke } from "@tauri-apps/api/core";
import { vi } from "vitest";
import { PeakData } from "@/lib/peaks";
import type { MediaInfo } from "@/lib/types";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { usePlayback } from "@/store/playback";
import { useUi } from "@/store/ui";
import { useView } from "@/store/view";

export function media(over: Partial<MediaInfo> = {}): MediaInfo {
  return {
    loadId: 1,
    path: "/home/u/Podcasts/ep117/ep117_coldopen.m4a",
    name: "ep117_coldopen.m4a",
    dir: "/home/u/Podcasts/ep117",
    size: 5_000_000,
    codec: "AAC-LC",
    codecName: "aac",
    profile: "LC",
    sampleRate: 48000,
    channels: 1,
    channelLayout: "mono",
    bitDepth: null,
    bitrate: 192000,
    duration: 222.18,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    isVideoContainer: false,
    lossless: false,
    tags: {},
    previewUrl: "http://127.0.0.1:1/media?load=1",
    ...over,
  };
}

type Handler = (args: Record<string, unknown>) => unknown;
/** Routes mocked `invoke` calls by command name. */
export function mockBackend(handlers: Record<string, Handler>) {
  vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) => {
    const h = handlers[cmd];
    if (!h) return undefined;
    return h((args ?? {}) as Record<string, unknown>);
  });
}

/** Loads `info` through the real `openFile` with a mocked backend. */
export async function loadDoc(
  info = media(),
  extra: Record<string, Handler> = {},
) {
  mockBackend({
    load_input: () => info,
    stream_peaks: () => new Promise(() => {}),
    ...extra,
  });
  useUi.setState({
    focus: "playhead",
    focusEntry: null,
    overlay: null,
    snap: null,
    windowWidth: 1280,
  });
  usePlayback.setState({ playhead: 0, playing: false, loop: false });
  const { openFile } = await import("@/app/actions");
  await openFile(info.path);
  const peaks = useMedia.getState().peaks as PeakData;
  peaks.done = true;
  useView.getState().setWidth(980);
  return { doc: () => useDocument.getState().doc! };
}
