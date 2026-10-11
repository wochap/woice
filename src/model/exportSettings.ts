import type { Format, MediaInfo, Quality } from "@/lib/types";

export const FORMATS: { value: Format; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "mp3", label: "MP3" },
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "opus", label: "Opus" },
  { value: "m4a", label: "M4A" },
];
export const QUALITIES: { value: Quality; label: string }[] = [
  { value: "original", label: "Original" },
  { value: "high", label: "High" },
  { value: "small", label: "Small" },
];

type Codec = "mp3" | "aac" | "opus" | "vorbis" | "flac" | "alac" | "pcm";
const CODEC_LABEL: Record<Codec, string> = {
  mp3: "MP3",
  aac: "AAC",
  opus: "Opus",
  vorbis: "Vorbis",
  flac: "FLAC",
  alac: "ALAC",
  pcm: "WAV",
};
const MP3_RATES = [
  32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const VIDEO_EXT: Record<string, string> = {
  aac: "m4a",
  opus: "opus",
  vorbis: "ogg",
  mp3: "mp3",
  flac: "flac",
};

/** Mirrors `resolve_target` in export.rs. */
export interface Target {
  streamCopy: boolean;
  codec: Codec;
  ext: string;
  kbps: number | null;
  depth: number | null;
  rate: number;
  stereoDownmix: boolean;
}

function sourceCodec(info: MediaInfo): Codec {
  const c = info.codecName;
  if (
    c === "mp3" ||
    c === "aac" ||
    c === "opus" ||
    c === "vorbis" ||
    c === "alac"
  )
    return c;
  if (c.startsWith("pcm_")) return "pcm";
  return "flac";
}
function extOf(path: string): string | null {
  const name = path.split("/").pop() ?? "";
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : null;
}
export function sourceExtension(info: MediaInfo): string {
  const ext = extOf(info.path);
  if (!info.isVideoContainer && ext) return ext;
  if (info.codecName.startsWith("pcm_")) return "wav";
  return VIDEO_EXT[info.codecName] ?? "mka";
}
const isLossless = (c: Codec) => c === "flac" || c === "alac" || c === "pcm";
const srcKbps = (info: MediaInfo) =>
  info.lossless || !info.bitrate ? null : Math.round(info.bitrate / 1000);

function lossyKbps(codec: Codec, q: Quality, info: MediaInfo): number {
  const mono = info.channels === 1;
  const src = srcKbps(info);
  if (codec === "mp3" && q === "original")
    return (src && MP3_RATES.find((r) => r >= src)) || 320;
  if (codec === "opus")
    return q === "original"
      ? 192
      : q === "high"
        ? mono
          ? 64
          : 128
        : mono
          ? 32
          : 64;
  if (q === "original") return src ? Math.min(src, 256) : 256;
  return q === "high" ? (mono ? 128 : 192) : mono ? 64 : 128;
}

export function resolveTarget(
  format: Format,
  q: Quality,
  processing: boolean,
  info: MediaInfo,
): Target {
  const map: Record<Exclude<Format, "source">, Codec> = {
    mp3: "mp3",
    wav: "pcm",
    flac: "flac",
    opus: "opus",
    m4a: "aac",
  };
  const codec = format === "source" ? sourceCodec(info) : map[format];
  const ext = format === "source" ? sourceExtension(info) : format;
  const t: Target = {
    streamCopy: format === "source" && !processing,
    codec,
    ext,
    kbps: null,
    depth: null,
    rate: info.sampleRate,
    stereoDownmix: false,
  };
  if (t.streamCopy) return t;
  if (isLossless(codec)) {
    const src = info.lossless && info.bitDepth ? info.bitDepth : 16;
    const d = q === "original" ? src : 16;
    t.depth = codec === "pcm" ? d : Math.min(d, 24);
    if (q === "small" && info.sampleRate > 44100) t.rate = 44100;
  } else {
    t.kbps = lossyKbps(codec, q, info);
    if (codec === "mp3") {
      t.stereoDownmix = info.channels > 2;
      if (info.sampleRate > 48000) t.rate = 48000;
    }
  }
  return t;
}

/** Estimated output bitrate in kbps. */
export function estimateKbps(t: Target, info: MediaInfo): number {
  if (t.streamCopy) return info.bitrate ? info.bitrate / 1000 : 0;
  if (t.kbps) return t.kbps;
  const ch = t.stereoDownmix ? 2 : info.channels;
  const pcm = ((t.depth ?? 16) * t.rate * ch) / 1000;
  if (t.codec === "pcm") return pcm;
  // Compressed lossless: scale the source's own ratio, else assume 60 %.
  if (info.lossless && info.bitrate && !info.codecName.startsWith("pcm_")) {
    const srcPcm =
      ((info.bitDepth ?? 16) * info.sampleRate * info.channels) / 1000;
    return (info.bitrate / 1000) * (pcm / srcPcm);
  }
  return pcm * 0.6;
}

const kLabel = (k: number, approx: boolean) =>
  `${approx ? "≈" : ""}${Math.round(k)} k`;

/** Sublabel under each tier: bitrate for lossy, estimated bitrate for lossless. */
export function tierSublabel(
  format: Format,
  q: Quality,
  info: MediaInfo,
): string {
  const t = resolveTarget(format, q, true, info);
  return kLabel(estimateKbps(t, info), !t.kbps);
}

/** `MP3 128 kbps`, `FLAC 24-bit`, `WAV 16-bit · 44.1 kHz`. */
export function targetLabel(t: Target, info: MediaInfo): string {
  if (t.streamCopy) return `${info.codec} · stream copy`;
  let s = CODEC_LABEL[t.codec];
  if (t.kbps) s += ` ${t.kbps} kbps`;
  if (t.depth) s += ` ${t.depth}-bit`;
  if (t.rate !== info.sampleRate) s += ` · ${t.rate / 1000} kHz`;
  return s;
}

/** Note after Est. size: `FLAC 24-bit`, `MP3 CBR mono`. */
export function tierNote(t: Target, info: MediaInfo): string {
  if (t.streamCopy) return "stream copy";
  if (t.kbps)
    return `${CODEC_LABEL[t.codec]}${t.codec === "mp3" ? " CBR" : ""} ${t.stereoDownmix ? "stereo" : info.channelLayout}`;
  return `${CODEC_LABEL[t.codec]} ${t.depth}-bit`;
}

export interface Processing {
  fadeInMs: number;
  fadeOutMs: number;
  gainDb: number;
  normalize: boolean;
  declick: boolean;
}
export const isProcessing = (p: Processing) =>
  p.fadeInMs > 0 ||
  p.fadeOutMs > 0 ||
  p.gainDb !== 0 ||
  p.normalize ||
  p.declick;

export interface Hint {
  tone: "copy" | "encode";
  text: string;
  sub: string;
}
const shortCodec = (info: MediaInfo) =>
  info.codecName === "aac"
    ? "AAC"
    : info.codecName.startsWith("pcm_")
      ? "PCM"
      : info.codec;

export function exportHint(
  format: Format,
  q: Quality,
  p: Processing,
  info: MediaInfo,
): Hint {
  const t = resolveTarget(format, q, isProcessing(p), info);
  if (t.streamCopy)
    return {
      tone: "copy",
      text: "Source → lossless stream copy",
      sub: `${info.codec} · cut at packet boundaries`,
    };
  const causes = [
    p.normalize && "Normalize",
    !p.normalize && p.gainDb !== 0 && "Gain",
    (p.fadeInMs > 0 || p.fadeOutMs > 0) && "Fades",
    p.declick && "De-click",
  ].filter(Boolean) as string[];
  const text = causes.length
    ? `${causes
        .slice(0, 2)
        .map((c, i) => (i ? c.toLowerCase() : c))
        .join(" + ")} on → will re-encode`
    : `${FORMATS.find((f) => f.value === format)!.label} selected → will re-encode`;
  const to = isLossless(t.codec)
    ? CODEC_LABEL[t.codec]
    : `${CODEC_LABEL[t.codec]} ${t.kbps} kbps`;
  const lossless =
    info.lossless && isLossless(t.codec) ? " · stays lossless" : "";
  return {
    tone: "encode",
    text,
    sub: `${shortCodec(info)} → ${to}${lossless}`,
  };
}

export function defaultOutput(info: MediaInfo, ext: string): string {
  const stem = info.name.includes(".")
    ? info.name.slice(0, info.name.lastIndexOf("."))
    : info.name;
  return `${info.dir}/${stem}-trim.${ext}`;
}
export function withExtension(path: string, ext: string): string {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return (dot > slash + 1 ? path.slice(0, dot) : path) + "." + ext;
}
export function formatForExtension(path: string): Format | null {
  const e = extOf(path);
  return e && ["mp3", "wav", "flac", "opus", "m4a"].includes(e)
    ? (e as Format)
    : null;
}
/** Last two segments: `…/ep117/ep117_coldopen-trim.mp3`. */
export function shortPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}
/** Abbreviates the home directory to `~`. */
export function tildify(path: string, home: string | null): string {
  if (!home) return path;
  const h = home.replace(/\/$/, "");
  return path === h
    ? "~"
    : path.startsWith(h + "/")
      ? `~${path.slice(h.length)}`
      : path;
}
/** Normalised comparison of two absolute paths. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) =>
    p
      .split("/")
      .reduce<string[]>((acc, s) => {
        if (s === "..") acc.pop();
        else if (s && s !== ".") acc.push(s);
        return acc;
      }, [])
      .join("/");
  return norm(a) === norm(b);
}
