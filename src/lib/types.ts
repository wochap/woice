export type Format = "source" | "mp3" | "wav" | "flac" | "opus" | "m4a";
export type Quality = "original" | "high" | "small";
export type OnDone = "exit" | "stay";
export type FadeCurve = "linear" | "exp" | "s-curve";
export type NormalizeTarget = "-16lufs" | "-14lufs" | "-1dbfs";

export interface LaunchOptions {
  input: string | null;
  output: string | null;
  format: Format;
  quality: Quality;
  onDone: OnDone;
  declick: boolean;
  fadeCurve: FadeCurve;
  normalizeTarget: NormalizeTarget;
  verbose: boolean;
  inputExtensions: string[];
}

export interface MediaInfo {
  loadId: number;
  path: string;
  name: string;
  dir: string;
  size: number;
  codec: string;
  codecName: string;
  profile: string | null;
  sampleRate: number;
  channels: number;
  channelLayout: string;
  bitDepth: number | null;
  bitrate: number | null;
  duration: number;
  container: string;
  isVideoContainer: boolean;
  lossless: boolean;
  tags: Record<string, string>;
  previewUrl: string;
}

export interface LoadFailure {
  title: string;
  reason: string;
  detail: string;
  path: string;
  size: number | null;
}

/** Serialized `AppError` from the backend. */
export type AppError =
  { kind: "load"; message: LoadFailure } | { kind: string; message?: string };

export interface ExportRequest {
  loadId: number;
  inS: number;
  outS: number;
  fadeInMs: number;
  fadeOutMs: number;
  fadeCurve: FadeCurve;
  gainDb: number;
  normalize: NormalizeTarget | null;
  declick: boolean;
  format: Format;
  quality: Quality;
  output: string;
}

export interface ExportStep {
  label: string;
  state: "done" | "active" | "pending";
  note: string;
}

export interface ExportProgress {
  outName: string;
  formatLine: string;
  percent: number;
  steps: ExportStep[];
}

export interface ExportResult {
  path: string;
  size: number;
  formatLine: string;
  measuredLufs: number | null;
  actualStart: number | null;
  tookMs: number;
  streamCopy: boolean;
}

export interface Snap {
  requested: number;
  time: number;
  snapped: boolean;
}
