import { describe, expect, it } from "vitest";
import type { MediaInfo } from "@/lib/types";
import {
  defaultOutput,
  estimateKbps,
  exportHint,
  formatForExtension,
  resolveTarget,
  samePath,
  shortPath,
  sourceExtension,
  tierNote,
  tierSublabel,
  tildify,
  withExtension,
} from "./exportSettings";

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
    previewUrl: "",
    ...over,
  };
}
const flac = media({
  path: "/m/t.flac",
  name: "t.flac",
  codec: "FLAC",
  codecName: "flac",
  sampleRate: 96000,
  channels: 2,
  channelLayout: "stereo",
  bitDepth: 24,
  bitrate: 3_000_000,
  lossless: true,
});
const off = {
  fadeInMs: 0,
  fadeOutMs: 0,
  gainDb: 0,
  normalize: false,
  declick: false,
};

describe("export settings", () => {
  it("resolves lossy tiers like export.rs", () => {
    expect(resolveTarget("mp3", "original", true, media()).kbps).toBe(192);
    expect(resolveTarget("mp3", "high", true, media()).kbps).toBe(128);
    expect(resolveTarget("mp3", "small", true, media()).kbps).toBe(64);
    expect(resolveTarget("opus", "small", true, media()).kbps).toBe(32);
    expect(
      resolveTarget("m4a", "original", true, media({ bitrate: 320000 })).kbps,
    ).toBe(256);
    expect(tierSublabel("mp3", "high", media())).toBe("128 k");
  });
  it("resolves lossless tiers", () => {
    const small = resolveTarget("flac", "small", true, flac);
    expect([small.depth, small.rate]).toEqual([16, 44100]);
    expect(resolveTarget("flac", "original", true, flac).depth).toBe(24);
    expect(estimateKbps(resolveTarget("wav", "high", true, flac), flac)).toBe(
      16 * 96 * 2,
    );
    expect(tierSublabel("flac", "original", flac)).toBe("≈3000 k");
    expect(tierNote(resolveTarget("flac", "original", true, flac), flac)).toBe(
      "FLAC 24-bit",
    );
    expect(tierNote(resolveTarget("mp3", "high", true, media()), media())).toBe(
      "MP3 CBR mono",
    );
  });
  it("maps Source from video containers to an audio-only extension", () => {
    const v = media({
      path: "/v/talk.mp4",
      name: "talk.mp4",
      dir: "/v",
      isVideoContainer: true,
    });
    expect(sourceExtension(v)).toBe("m4a");
    expect(defaultOutput(v, sourceExtension(v))).toBe("/v/talk-trim.m4a");
    expect(sourceExtension(media({ ...v, codecName: "ac3" }))).toBe("mka");
    expect(
      sourceExtension(media({ path: "/a/b.AIFF", codecName: "pcm_s16be" })),
    ).toBe("aiff");
  });
  it("hints stream copy only without processing", () => {
    expect(exportHint("source", "original", off, media())).toMatchObject({
      tone: "copy",
      text: "Source → lossless stream copy",
    });
    const h = exportHint(
      "mp3",
      "high",
      { ...off, normalize: true, fadeInMs: 350, gainDb: 3 },
      media(),
    );
    expect(h).toEqual({
      tone: "encode",
      text: "Normalize + fades on → will re-encode",
      sub: "AAC → MP3 128 kbps",
    });
    const g = exportHint(
      "source",
      "original",
      { ...off, gainDb: -1.5, fadeInMs: 4000, declick: true },
      flac,
    );
    expect(g.text).toBe("Gain + fades on → will re-encode");
    expect(g.sub).toBe("FLAC → FLAC · stays lossless");
    expect(exportHint("wav", "original", off, media()).text).toBe(
      "WAV selected → will re-encode",
    );
  });
  it("derives and updates output paths", () => {
    const p = defaultOutput(media(), "m4a");
    expect(p).toBe("/home/u/Podcasts/ep117/ep117_coldopen-trim.m4a");
    expect(withExtension(p, "mp3")).toBe(
      "/home/u/Podcasts/ep117/ep117_coldopen-trim.mp3",
    );
    expect(withExtension("/a.b/clip", "flac")).toBe("/a.b/clip.flac");
    expect(shortPath(p)).toBe("…/ep117/ep117_coldopen-trim.m4a");
    expect(tildify("/home/u/Podcasts/ep117", "/home/u")).toBe(
      "~/Podcasts/ep117",
    );
    expect(tildify("/home/uu/x", "/home/u")).toBe("/home/uu/x");
    expect(formatForExtension("/x/y.MP3")).toBe("mp3");
    expect(formatForExtension("/x/y.ogg")).toBeNull();
    expect(samePath("/a/b/../c/./d.wav", "/a/c/d.wav")).toBe(true);
  });
});
