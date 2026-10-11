use crate::error::{AppError, LoadFailure};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    hash::{Hash, Hasher},
    io::Read,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::ipc::{Channel, InvokeResponseBody};

pub const INPUT_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "aiff", "aif", "mp4", "m4v", "mkv",
    "webm", "mov",
];
const VIDEO_FAMILIES: &[&str] = &["mp4", "matroska", "webm", "mov"];
const LOSSLESS_CODECS: &[&str] = &["flac", "alac", "wavpack", "ape", "tta", "truehd", "mlp"];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub load_id: u64,
    pub path: String,
    pub name: String,
    pub dir: String,
    pub size: u64,
    /// Display codec, e.g. `AAC-LC`, `FLAC`, `MP3`.
    pub codec: String,
    /// ffprobe codec name, e.g. `aac`, `pcm_s24le`.
    pub codec_name: String,
    pub profile: Option<String>,
    pub sample_rate: u32,
    pub channels: u32,
    pub channel_layout: String,
    pub bit_depth: Option<u32>,
    pub bitrate: Option<u64>,
    pub duration: f64,
    /// ffprobe format name, e.g. `mov,mp4,m4a,3gp,3g2,mj2`.
    pub container: String,
    pub is_video_container: bool,
    pub lossless: bool,
    pub tags: BTreeMap<String, String>,
    pub preview_url: String,
}

#[derive(Deserialize)]
struct Probe {
    #[serde(default)]
    streams: Vec<ProbeStream>,
    format: Option<ProbeFormat>,
}
#[derive(Deserialize)]
struct ProbeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    profile: Option<String>,
    sample_rate: Option<String>,
    channels: Option<u32>,
    channel_layout: Option<String>,
    sample_fmt: Option<String>,
    bits_per_raw_sample: Option<String>,
    bits_per_sample: Option<u32>,
    bit_rate: Option<String>,
    duration: Option<String>,
    #[serde(default)]
    tags: BTreeMap<String, String>,
}
#[derive(Deserialize)]
struct ProbeFormat {
    format_name: Option<String>,
    duration: Option<String>,
    bit_rate: Option<String>,
    #[serde(default)]
    tags: BTreeMap<String, String>,
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string())
}
fn failure(
    path: &Path,
    size: Option<u64>,
    title: String,
    reason: &str,
    detail: String,
) -> LoadFailure {
    LoadFailure {
        title,
        reason: reason.into(),
        detail,
        path: path.display().to_string(),
        size,
    }
}
/// First meaningful stderr line without the `[demuxer @ 0x…]` prefix.
fn tool_message(stderr: &str) -> String {
    stderr
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .map(|l| match (l.starts_with('['), l.find("] ")) {
            (true, Some(i)) => l[i + 2..].to_owned(),
            _ => l.to_owned(),
        })
        .unwrap_or_else(|| "unknown error".into())
}
fn unreadable_reason(detail: &str) -> &'static str {
    if detail.contains("moov atom not found") {
        "The file’s index is missing, so there is no audio stream to decode. It may be truncated — still downloading or copying — or saved by an app that crashed."
    } else if detail.contains("Invalid data found") {
        "The file’s data isn’t in a format woice can decode, or it is damaged."
    } else if detail.contains("Permission denied") {
        "woice isn’t allowed to read this file."
    } else {
        "ffprobe could not read the file."
    }
}
pub fn display_codec(codec: &str, profile: Option<&str>) -> String {
    match codec {
        "aac" => match profile {
            Some("LC") | None => "AAC-LC".into(),
            Some(p) => p.to_owned(),
        },
        "mp3" => "MP3".into(),
        "flac" => "FLAC".into(),
        "opus" => "Opus".into(),
        "vorbis" => "Vorbis".into(),
        "alac" => "ALAC".into(),
        c if c.starts_with("pcm_") => "PCM".into(),
        c => c.to_ascii_uppercase(),
    }
}
pub fn is_lossless(codec: &str) -> bool {
    codec.starts_with("pcm_") || LOSSLESS_CODECS.contains(&codec)
}
fn bit_depth(s: &ProbeStream, codec: &str) -> Option<u32> {
    if !is_lossless(codec) {
        return None;
    }
    let raw = s
        .bits_per_raw_sample
        .as_deref()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|v| *v > 0);
    raw.or(s.bits_per_sample.filter(|v| *v > 0))
        .or_else(|| match s.sample_fmt.as_deref()? {
            "s16" | "s16p" => Some(16),
            "s32" | "s32p" | "flt" | "fltp" => Some(32),
            "dbl" | "dblp" => Some(64),
            "u8" | "u8p" => Some(8),
            _ => None,
        })
}
fn layout_name(channels: u32, layout: Option<&str>) -> String {
    match (channels, layout) {
        (1, _) => "mono".into(),
        (2, _) => "stereo".into(),
        (_, Some(l)) if !l.is_empty() && l != "unknown" => l.to_owned(),
        (n, _) => format!("{n} ch"),
    }
}
/// Parses ffprobe JSON into `MediaInfo`; `stderr` is used when nothing usable was found.
fn parse_probe(json: &str, path: &Path, size: u64) -> Result<MediaInfo, LoadFailure> {
    let name = file_name(path);
    let probe: Probe = serde_json::from_str(json).map_err(|e| {
        failure(
            path,
            Some(size),
            format!("Can’t read {name}"),
            "ffprobe returned unexpected output.",
            e.to_string(),
        )
    })?;
    let format = probe.format.ok_or_else(|| {
        failure(
            path,
            Some(size),
            format!("Can’t read {name}"),
            "ffprobe could not read the file.",
            "no format information".into(),
        )
    })?;
    let Some(mut stream) = probe
        .streams
        .into_iter()
        .find(|s| s.codec_type.as_deref() == Some("audio"))
    else {
        return Err(failure(
            path,
            Some(size),
            format!("No audio stream in {name}"),
            "The file opened, but it contains no audio track to trim.",
            "ffprobe: no audio stream".into(),
        ));
    };
    let codec_name = stream.codec_name.clone().unwrap_or_default();
    let parse_f = |v: &Option<String>| v.as_deref().and_then(|v| v.parse::<f64>().ok());
    let duration = parse_f(&stream.duration)
        .or_else(|| parse_f(&format.duration))
        .filter(|d| d.is_finite() && *d > 0.0)
        .ok_or_else(|| {
            failure(
                path,
                Some(size),
                format!("Can’t read {name}"),
                "The audio stream has no duration; the file may be truncated.",
                "ffprobe: unknown duration".into(),
            )
        })?;
    let sample_rate = stream
        .sample_rate
        .as_deref()
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let channels = stream.channels.unwrap_or(0);
    if sample_rate == 0 || channels == 0 {
        return Err(failure(
            path,
            Some(size),
            format!("Can’t read {name}"),
            "The audio stream’s sample rate or channels are unknown.",
            "ffprobe: incomplete stream parameters".into(),
        ));
    }
    let container = format.format_name.unwrap_or_default();
    let family = container_family(&container, path);
    let depth = bit_depth(&stream, &codec_name);
    let mut tags = format.tags;
    for (k, v) in std::mem::take(&mut stream.tags) {
        tags.entry(k).or_insert(v);
    }
    let tags = tags
        .into_iter()
        .map(|(k, v)| (k.to_ascii_lowercase(), v))
        .collect();
    let lossless = is_lossless(&codec_name);
    Ok(MediaInfo {
        load_id: 0,
        path: path.display().to_string(),
        name,
        dir: path
            .parent()
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        size,
        codec: display_codec(&codec_name, stream.profile.as_deref()),
        bit_depth: depth,
        bitrate: stream
            .bit_rate
            .as_deref()
            .or(format.bit_rate.as_deref())
            .and_then(|v| v.parse().ok()),
        channel_layout: layout_name(channels, stream.channel_layout.as_deref()),
        profile: stream.profile,
        is_video_container: VIDEO_FAMILIES.contains(&family),
        codec_name,
        sample_rate,
        channels,
        duration,
        container,
        lossless,
        tags,
        preview_url: String::new(),
    })
}
/// Short container family: `mp4`, `matroska`, `webm`, `mov`, or the ffprobe name.
fn container_family<'a>(format_name: &'a str, path: &Path) -> &'a str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    if format_name.starts_with("mov,mp4") {
        match ext.as_str() {
            "mov" => "mov",
            "mp4" | "m4v" => "mp4",
            _ => "m4a",
        }
    } else if format_name.starts_with("matroska") {
        if ext == "webm" {
            "webm"
        } else {
            "matroska"
        }
    } else {
        format_name.split(',').next().unwrap_or(format_name)
    }
}
pub fn probe(path: &Path) -> Result<MediaInfo, LoadFailure> {
    let name = file_name(path);
    let meta = match std::fs::metadata(path) {
        Ok(m) if m.is_file() => m,
        Ok(_) => {
            return Err(failure(
                path,
                None,
                format!("Can’t open {name}"),
                "This is not a regular file.",
                "not a file".into(),
            ))
        }
        Err(e) => {
            return Err(failure(
                path,
                None,
                format!("Can’t open {name}"),
                "The file doesn’t exist or can’t be accessed.",
                e.to_string(),
            ))
        }
    };
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
        ])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| {
            failure(
                path,
                Some(meta.len()),
                format!("Can’t read {name}"),
                "ffprobe is not available.",
                e.to_string(),
            )
        })?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        let detail = tool_message(&stderr);
        return Err(failure(
            path,
            Some(meta.len()),
            format!("Can’t read {name}"),
            unreadable_reason(&detail),
            format!("ffprobe: {detail}"),
        ));
    }
    parse_probe(&String::from_utf8_lossy(&out.stdout), path, meta.len())
}

// ---------- state ----------

pub struct Loaded {
    pub id: u64,
    pub source: PathBuf,
    pub preview: PathBuf,
    pub info: MediaInfo,
}
#[derive(Default)]
pub struct MediaState {
    pub current: Mutex<Option<Loaded>>,
    /// Newest requested load; work for older ids stops.
    pub active: AtomicU64,
    pub media_base: Mutex<String>,
}
impl MediaState {
    fn with<T>(&self, load_id: u64, f: impl FnOnce(&Loaded) -> T) -> Result<T, AppError> {
        let guard = self
            .current
            .lock()
            .map_err(|_| AppError::Internal("media state poisoned".into()))?;
        match guard.as_ref() {
            Some(l) if l.id == load_id => Ok(f(l)),
            _ => Err(AppError::StaleLoad),
        }
    }
    fn is_active(&self, load_id: u64) -> bool {
        self.active.load(Ordering::SeqCst) == load_id
    }
}
pub fn cleanup(state: &MediaState) {
    state.active.store(u64::MAX, Ordering::SeqCst);
}
fn preview_url(base: &str, id: u64, proxy: bool) -> String {
    format!("{base}?load={id}{}", if proxy { "&proxy=1" } else { "" })
}

#[tauri::command]
pub async fn load_input(
    state: tauri::State<'_, MediaState>,
    path: String,
    load_id: u64,
) -> Result<MediaInfo, AppError> {
    state.active.store(load_id, Ordering::SeqCst);
    let p = PathBuf::from(&path);
    let p = std::path::absolute(&p).unwrap_or(p);
    let probed = tauri::async_runtime::spawn_blocking({
        let p = p.clone();
        move || probe(&p)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;
    let mut info = probed.map_err(|f| {
        tracing::warn!(path = %f.path, detail = %f.detail, "load failed");
        AppError::Load(f)
    })?;
    if !state.is_active(load_id) {
        return Err(AppError::StaleLoad);
    }
    info.load_id = load_id;
    let base = state
        .media_base
        .lock()
        .map(|b| b.clone())
        .unwrap_or_default();
    info.preview_url = preview_url(&base, load_id, false);
    tracing::info!(path = %info.path, codec = %info.codec, rate = info.sample_rate, channels = info.channels, duration = info.duration, "loaded");
    *state
        .current
        .lock()
        .map_err(|_| AppError::Internal("media state poisoned".into()))? = Some(Loaded {
        id: load_id,
        source: p.clone(),
        preview: p,
        info: info.clone(),
    });
    Ok(info)
}

// ---------- peaks ----------

pub const LEVELS: [usize; 4] = [256, 1024, 4096, 16384];
/// Base buckets per coarsest bucket; chunks are emitted on this alignment.
const ALIGN: usize = LEVELS[3] / LEVELS[0];

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Peak {
    pub min: f32,
    pub max: f32,
    pub rms: f32,
}
#[derive(Debug, Clone, Copy)]
struct Acc {
    min: f32,
    max: f32,
    sumsq: f64,
    n: usize,
}
impl Acc {
    const EMPTY: Acc = Acc {
        min: f32::INFINITY,
        max: f32::NEG_INFINITY,
        sumsq: 0.0,
        n: 0,
    };
    fn push(&mut self, v: f32) {
        self.min = self.min.min(v);
        self.max = self.max.max(v);
        self.sumsq += (v as f64) * (v as f64);
        self.n += 1;
    }
    fn peak(&self) -> Peak {
        if self.n == 0 {
            return Peak {
                min: 0.0,
                max: 0.0,
                rms: 0.0,
            };
        }
        Peak {
            min: self.min,
            max: self.max,
            rms: (self.sumsq / self.n as f64).sqrt() as f32,
        }
    }
}
/// Folds `factor` consecutive buckets into one; a trailing partial group is folded too.
pub fn fold(src: &[Peak], factor: usize) -> Vec<Peak> {
    src.chunks(factor)
        .map(|g| {
            let mut min = f32::INFINITY;
            let mut max = f32::NEG_INFINITY;
            let mut sq = 0.0f64;
            for p in g {
                min = min.min(p.min);
                max = max.max(p.max);
                sq += (p.rms as f64).powi(2);
            }
            Peak {
                min,
                max,
                rms: (sq / g.len() as f64).sqrt() as f32,
            }
        })
        .collect()
}
/// Builds base-level (256-sample) buckets per channel from interleaved samples.
pub struct PeakBuilder {
    channels: usize,
    acc: Vec<Acc>,
    in_bucket: usize,
    /// Base buckets, `[bucket][channel]` flattened.
    pub base: Vec<Peak>,
    pub frames: u64,
}
impl PeakBuilder {
    pub fn new(channels: usize) -> Self {
        Self {
            channels,
            acc: vec![Acc::EMPTY; channels],
            in_bucket: 0,
            base: Vec::new(),
            frames: 0,
        }
    }
    pub fn push_interleaved(&mut self, samples: &[f32]) {
        for frame in samples.chunks_exact(self.channels) {
            for (a, v) in self.acc.iter_mut().zip(frame) {
                a.push(*v);
            }
            self.in_bucket += 1;
            self.frames += 1;
            if self.in_bucket == LEVELS[0] {
                self.close_bucket();
            }
        }
    }
    fn close_bucket(&mut self) {
        for a in &mut self.acc {
            self.base.push(a.peak());
            *a = Acc::EMPTY;
        }
        self.in_bucket = 0;
    }
    pub fn finish(&mut self) {
        if self.in_bucket > 0 {
            self.close_bucket();
        }
    }
    pub fn buckets(&self) -> usize {
        self.base.len() / self.channels
    }
    /// One channel's base buckets in `[from, to)`.
    fn channel(&self, ch: usize, from: usize, to: usize) -> Vec<Peak> {
        (from..to)
            .map(|b| self.base[b * self.channels + ch])
            .collect()
    }
    /// Encodes base buckets `[from, to)` and their folds as little-endian f32:
    /// header `[from, count, decodedSeconds, done, channels]`, then for each level
    /// `ceil(count / factor)` buckets × channels × `(min, max, rms)`.
    pub fn encode(&self, from: usize, to: usize, sample_rate: u32, done: bool) -> Vec<u8> {
        let ch = self.channels;
        let mut out: Vec<f32> = vec![
            from as f32,
            (to - from) as f32,
            self.frames as f32 / sample_rate.max(1) as f32,
            if done { 1.0 } else { 0.0 },
            ch as f32,
        ];
        for level in LEVELS {
            let factor = level / LEVELS[0];
            let per_ch: Vec<Vec<Peak>> = (0..ch)
                .map(|c| fold(&self.channel(c, from, to), factor))
                .collect();
            let n = per_ch.first().map_or(0, Vec::len);
            for b in 0..n {
                for p in per_ch.iter().map(|v| v[b]) {
                    out.extend([p.min, p.max, p.rms]);
                }
            }
        }
        out.iter().flat_map(|v| v.to_le_bytes()).collect()
    }
}
/// Reads interleaved f32le PCM and calls `emit(bytes)` with chunks aligned to the coarsest
/// level, throttled to `every`. Stops early when `keep_going` turns false.
pub fn stream_pyramid(
    mut reader: impl Read,
    channels: usize,
    sample_rate: u32,
    every: Duration,
    keep_going: impl Fn() -> bool,
    mut emit: impl FnMut(Vec<u8>),
) -> std::io::Result<bool> {
    let mut builder = PeakBuilder::new(channels);
    let mut buf = vec![0u8; 64 * 1024 * channels];
    let mut carry: Vec<u8> = Vec::new();
    let mut emitted = 0usize;
    let mut last = Instant::now();
    loop {
        if !keep_going() {
            return Ok(false);
        }
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        carry.extend_from_slice(&buf[..n]);
        let whole = carry.len() / 4 * 4;
        let samples: Vec<f32> = carry[..whole]
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect();
        carry.drain(..whole);
        // Keep partial frames for the next read.
        let frames = samples.len() / channels * channels;
        builder.push_interleaved(&samples[..frames]);
        if frames < samples.len() {
            let rest: Vec<u8> = samples[frames..]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect();
            carry.splice(0..0, rest);
        }
        let ready = builder.buckets() / ALIGN * ALIGN;
        if ready > emitted && last.elapsed() >= every {
            emit(builder.encode(emitted, ready, sample_rate, false));
            emitted = ready;
            last = Instant::now();
        }
    }
    builder.finish();
    emit(builder.encode(emitted, builder.buckets(), sample_rate, true));
    Ok(true)
}
fn decoder(path: &Path) -> std::io::Result<Child> {
    Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-v", "error", "-i"])
        .arg(path)
        .args([
            "-map",
            "0:a:0",
            "-vn",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "-",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
}
#[tauri::command]
pub async fn stream_peaks(
    app: tauri::AppHandle,
    load_id: u64,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<(), AppError> {
    use tauri::Manager;
    let (path, channels, rate) = {
        let state = app.state::<MediaState>();
        state.with(load_id, |l| {
            (
                l.source.clone(),
                l.info.channels as usize,
                l.info.sample_rate,
            )
        })?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<MediaState>();
        let mut child = decoder(&path).map_err(|e| AppError::Decode(e.to_string()))?;
        let stdout = child.stdout.take().expect("piped stdout");
        let result = stream_pyramid(
            stdout,
            channels,
            rate,
            Duration::from_millis(100),
            || state.is_active(load_id),
            |bytes| {
                let _ = on_chunk.send(InvokeResponseBody::Raw(bytes));
            },
        );
        match result {
            Ok(true) => {
                let out = child
                    .wait_with_output()
                    .map_err(|e| AppError::Decode(e.to_string()))?;
                if !out.status.success() {
                    return Err(AppError::Decode(tool_message(&String::from_utf8_lossy(
                        &out.stderr,
                    ))));
                }
                Ok(())
            }
            Ok(false) => {
                let _ = child.kill();
                let _ = child.wait();
                Err(AppError::StaleLoad)
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                Err(AppError::Decode(e.to_string()))
            }
        }
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?
}

// ---------- sample windows ----------

/// Decodes `frames` interleaved frames starting at `start_frame`, sample-accurately.
pub fn decode_window(
    path: &Path,
    start_frame: u64,
    frames: u64,
    sample_rate: u32,
    channels: usize,
) -> Result<Vec<f32>, AppError> {
    let start = start_frame as f64 / sample_rate as f64;
    let mut cmd = Command::new("ffmpeg");
    cmd.args(["-hide_banner", "-nostdin", "-v", "error"]);
    if start_frame > 0 {
        cmd.args(["-ss", &format!("{start:.9}")]);
    }
    let out = cmd
        .arg("-i")
        .arg(path)
        .args(["-map", "0:a:0", "-vn"])
        .args(["-af", &format!("atrim=end_sample={frames}")])
        .args(["-f", "f32le", "-acodec", "pcm_f32le", "-"])
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::Decode(e.to_string()))?;
    if !out.status.success() {
        return Err(AppError::Decode(tool_message(&String::from_utf8_lossy(
            &out.stderr,
        ))));
    }
    let mut v: Vec<f32> = out
        .stdout
        .chunks_exact(4)
        .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .collect();
    v.resize(frames as usize * channels, 0.0);
    Ok(v)
}
fn frame_range(start: f64, end: f64, rate: u32, duration: f64) -> (u64, u64) {
    let total = (duration * rate as f64).round() as u64;
    let a = ((start.max(0.0) * rate as f64).floor() as u64).min(total);
    let b = ((end.max(0.0) * rate as f64).ceil() as u64).clamp(a, total);
    (a, b - a)
}
/// Returns little-endian f32: `[startFrame, stride, frames]` then interleaved samples
/// (every `stride`-th frame when the window holds more than `max_frames`).
#[tauri::command]
pub async fn read_samples(
    state: tauri::State<'_, MediaState>,
    load_id: u64,
    start: f64,
    end: f64,
    max_frames: u64,
) -> Result<tauri::ipc::Response, AppError> {
    let (path, rate, ch, dur) = state.with(load_id, |l| {
        (
            l.source.clone(),
            l.info.sample_rate,
            l.info.channels as usize,
            l.info.duration,
        )
    })?;
    let (first, n) = frame_range(start, end, rate, dur);
    let data =
        tauri::async_runtime::spawn_blocking(move || decode_window(&path, first, n, rate, ch))
            .await
            .map_err(|e| AppError::Internal(e.to_string()))??;
    let stride = n.div_ceil(max_frames.max(1)).max(1) as usize;
    let mut out: Vec<f32> = vec![first as f32, stride as f32, 0.0];
    let mut count = 0;
    for frame in data.chunks_exact(ch).step_by(stride) {
        out.extend_from_slice(frame);
        count += 1;
    }
    out[2] = count as f32;
    Ok(tauri::ipc::Response::new(
        out.iter()
            .flat_map(|v| v.to_le_bytes())
            .collect::<Vec<u8>>(),
    ))
}

// ---------- zero crossings ----------

pub const SNAP_WINDOW: f64 = 0.010;
/// Nearest sign change of `summed` to index `target`, linearly interpolated, in fractional samples.
pub fn nearest_crossing(summed: &[f32], target: f64) -> Option<f64> {
    let mut best: Option<f64> = None;
    for i in 0..summed.len().saturating_sub(1) {
        let (a, b) = (summed[i], summed[i + 1]);
        let pos = if a == 0.0 {
            i as f64
        } else if (a > 0.0 && b < 0.0) || (a < 0.0 && b > 0.0) {
            i as f64 + (a / (a - b)) as f64
        } else {
            continue;
        };
        if best.is_none_or(|p| (pos - target).abs() < (p - target).abs()) {
            best = Some(pos);
        }
    }
    best
}
/// Sums interleaved channels into one signal.
pub fn sum_channels(interleaved: &[f32], channels: usize) -> Vec<f32> {
    interleaved
        .chunks_exact(channels)
        .map(|f| f.iter().sum())
        .collect()
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snap {
    pub requested: f64,
    pub time: f64,
    pub snapped: bool,
}
pub fn snap_in(
    path: &Path,
    t: f64,
    rate: u32,
    channels: usize,
    duration: f64,
) -> Result<Snap, AppError> {
    let (first, n) = frame_range(t - SNAP_WINDOW, t + SNAP_WINDOW, rate, duration);
    let data = decode_window(path, first, n, rate, channels)?;
    let summed = sum_channels(&data, channels);
    let target = t * rate as f64 - first as f64;
    Ok(match nearest_crossing(&summed, target) {
        Some(pos) => Snap {
            requested: t,
            time: ((first as f64 + pos) / rate as f64).clamp(0.0, duration),
            snapped: true,
        },
        None => Snap {
            requested: t,
            time: t,
            snapped: false,
        },
    })
}
#[tauri::command]
pub async fn snap_zero_crossing(
    state: tauri::State<'_, MediaState>,
    load_id: u64,
    t: f64,
) -> Result<Snap, AppError> {
    let (path, rate, ch, dur) = state.with(load_id, |l| {
        (
            l.source.clone(),
            l.info.sample_rate,
            l.info.channels as usize,
            l.info.duration,
        )
    })?;
    tauri::async_runtime::spawn_blocking(move || snap_in(&path, t, rate, ch, dur))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?
}

// ---------- proxy ----------

pub fn cache_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_CACHE_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| directories::BaseDirs::new().map(|b| b.home_dir().join(".cache")))
        .map(|b| b.join("woice"))
}
pub fn proxy_key(path: &Path) -> std::io::Result<String> {
    let meta = std::fs::metadata(path)?;
    let mtime = meta
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut h);
    mtime.hash(&mut h);
    meta.len().hash(&mut h);
    Ok(format!("{:016x}", h.finish()))
}
pub fn make_proxy_file(source: &Path, dir: &Path) -> Result<PathBuf, AppError> {
    std::fs::create_dir_all(dir)?;
    let target = dir.join(format!("{}.flac", proxy_key(source)?));
    if target.is_file() {
        return Ok(target);
    }
    let tmp = dir.join(format!(".{}.tmp.flac", proxy_key(source)?));
    let out = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-v", "error", "-y", "-i"])
        .arg(source)
        .args([
            "-map",
            "0:a:0",
            "-vn",
            "-c:a",
            "flac",
            "-compression_level",
            "0",
        ])
        .arg(&tmp)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::Decode(e.to_string()))?;
    if !out.status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::Decode(tool_message(&String::from_utf8_lossy(
            &out.stderr,
        ))));
    }
    std::fs::rename(&tmp, &target)?;
    Ok(target)
}
/// Transcodes the loaded audio to a cached FLAC and serves it instead of the original.
#[tauri::command]
pub async fn make_proxy(
    state: tauri::State<'_, MediaState>,
    load_id: u64,
) -> Result<String, AppError> {
    let source = state.with(load_id, |l| l.source.clone())?;
    let dir =
        cache_dir().ok_or_else(|| AppError::Internal("cannot resolve cache directory".into()))?;
    let proxy = tauri::async_runtime::spawn_blocking(move || make_proxy_file(&source, &dir))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))??;
    let mut guard = state
        .current
        .lock()
        .map_err(|_| AppError::Internal("media state poisoned".into()))?;
    match guard.as_mut() {
        Some(l) if l.id == load_id => {
            tracing::info!(proxy = %proxy.display(), "serving FLAC proxy");
            l.preview = proxy;
        }
        _ => return Err(AppError::StaleLoad),
    }
    let base = state
        .media_base
        .lock()
        .map(|b| b.clone())
        .unwrap_or_default();
    Ok(preview_url(&base, load_id, true))
}

#[cfg(test)]
pub mod tests {
    use super::*;
    pub fn fixtures() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
    }
    /// Fixtures come from `scripts/fixtures.sh`; tests that need them are skipped without them.
    pub fn fixture(name: &str) -> Option<PathBuf> {
        let p = fixtures().join(name);
        if p.is_file() {
            Some(p)
        } else {
            eprintln!("skipping: fixture {name} missing, run scripts/fixtures.sh");
            None
        }
    }
    #[test]
    fn display_codecs() {
        assert_eq!(display_codec("aac", Some("LC")), "AAC-LC");
        assert_eq!(display_codec("aac", Some("HE-AAC")), "HE-AAC");
        assert_eq!(display_codec("pcm_s24le", None), "PCM");
        assert_eq!(display_codec("opus", None), "Opus");
        assert!(is_lossless("pcm_s16le") && is_lossless("flac") && !is_lossless("mp3"));
    }
    #[test]
    fn tool_message_strips_demuxer_prefix() {
        assert_eq!(
            tool_message("[mov,mp4,m4a,3gp,3g2,mj2 @ 0x5581] moov atom not found\n/x.m4a: Invalid data found when processing input\n"),
            "moov atom not found"
        );
    }
    #[test]
    fn parse_probe_without_audio_is_a_named_error() {
        let json = r#"{"streams":[{"codec_type":"video","codec_name":"h264"}],"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"10"}}"#;
        let e = parse_probe(json, Path::new("/v/talk.mp4"), 10).unwrap_err();
        assert_eq!(e.title, "No audio stream in talk.mp4");
    }
    #[test]
    fn parse_probe_reads_first_audio_stream() {
        let json = r#"{"streams":[{"codec_type":"video","codec_name":"h264"},{"codec_type":"audio","codec_name":"aac","profile":"LC","sample_rate":"48000","channels":2,"channel_layout":"stereo","sample_fmt":"fltp","bit_rate":"192000","duration":"222.180000"},{"codec_type":"audio","codec_name":"mp3","sample_rate":"44100","channels":1}],"format":{"format_name":"mov,mp4,m4a,3gp,3g2,mj2","duration":"222.2","tags":{"title":"Cold open"}}}"#;
        let i = parse_probe(json, Path::new("/v/talk.mp4"), 10).unwrap();
        assert_eq!(i.codec, "AAC-LC");
        assert_eq!(i.sample_rate, 48000);
        assert_eq!(i.channel_layout, "stereo");
        assert_eq!(i.bitrate, Some(192000));
        assert_eq!(i.bit_depth, None);
        assert!((i.duration - 222.18).abs() < 1e-9);
        assert!(i.is_video_container);
        assert_eq!(i.tags.get("title").map(String::as_str), Some("Cold open"));
    }
    #[test]
    fn layouts() {
        assert_eq!(layout_name(1, Some("mono")), "mono");
        assert_eq!(layout_name(6, Some("5.1(side)")), "5.1(side)");
        assert_eq!(layout_name(3, None), "3 ch");
    }
    #[test]
    fn container_families() {
        assert_eq!(
            container_family("mov,mp4,m4a,3gp,3g2,mj2", Path::new("a.m4a")),
            "m4a"
        );
        assert_eq!(
            container_family("mov,mp4,m4a,3gp,3g2,mj2", Path::new("a.MOV")),
            "mov"
        );
        assert_eq!(
            container_family("matroska,webm", Path::new("a.webm")),
            "webm"
        );
        assert_eq!(
            container_family("matroska,webm", Path::new("a.mkv")),
            "matroska"
        );
        assert_eq!(container_family("ogg", Path::new("a.opus")), "ogg");
    }
    #[test]
    fn fold_combines_min_max_and_rms() {
        let src = [
            Peak {
                min: -0.5,
                max: 0.2,
                rms: 0.3,
            },
            Peak {
                min: -0.1,
                max: 0.9,
                rms: 0.4,
            },
            Peak {
                min: -0.2,
                max: 0.1,
                rms: 0.0,
            },
        ];
        let f = fold(&src, 2);
        assert_eq!(f.len(), 2);
        assert_eq!((f[0].min, f[0].max), (-0.5, 0.9));
        assert!((f[0].rms - 0.353_553_4).abs() < 1e-6);
        assert_eq!(f[1], src[2]);
    }
    #[test]
    fn sine_rms_is_0_707_of_amplitude() {
        let rate = 48000.0;
        let a = 0.5f32;
        let samples: Vec<f32> = (0..48000 * 2)
            .map(|i| a * (2.0 * std::f32::consts::PI * 440.0 * (i / 2) as f32 / rate).sin())
            .collect();
        let mut b = PeakBuilder::new(2);
        b.push_interleaved(&samples);
        b.finish();
        let coarse = fold(&b.channel(0, 0, b.buckets()), 64);
        for p in &coarse[..coarse.len() - 1] {
            assert!(
                (p.rms - std::f32::consts::FRAC_1_SQRT_2 * a).abs() < 0.005,
                "{}",
                p.rms
            );
            assert!((p.max - a).abs() < 0.01 && (p.min + a).abs() < 0.01);
        }
    }
    #[test]
    fn pyramid_stream_emits_aligned_chunks_and_done() {
        let ch = 2;
        let frames = LEVELS[3] * 3 + 1000;
        let samples: Vec<u8> = (0..frames * ch)
            .flat_map(|i| (((i % 200) as f32 / 100.0) - 1.0).to_le_bytes())
            .collect();
        let mut chunks = vec![];
        stream_pyramid(
            &samples[..],
            ch,
            48000,
            Duration::ZERO,
            || true,
            |b| chunks.push(b),
        )
        .unwrap();
        let header = |b: &Vec<u8>| -> Vec<f32> {
            b.chunks_exact(4)
                .take(5)
                .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
                .collect()
        };
        let last = header(chunks.last().unwrap());
        assert_eq!(last[3], 1.0);
        let total: f32 = chunks.iter().map(|c| header(c)[1]).sum();
        assert_eq!(total as usize, frames.div_ceil(256));
        for c in &chunks[..chunks.len() - 1] {
            let h = header(c);
            assert_eq!(h[0] as usize % ALIGN, 0);
            assert_eq!(h[1] as usize % ALIGN, 0);
        }
        // Body length matches the declared levels.
        for c in &chunks {
            let h = header(c);
            let n = h[1] as usize;
            let body: usize = LEVELS.iter().map(|l| n.div_ceil(l / 256) * ch * 3).sum();
            assert_eq!(c.len() / 4, 5 + body);
        }
    }
    #[test]
    fn pyramid_stream_stops_when_superseded() {
        let samples = vec![0u8; 4 * 100_000];
        let mut n = 0;
        let ok =
            stream_pyramid(&samples[..], 1, 48000, Duration::ZERO, || false, |_| n += 1).unwrap();
        assert!(!ok);
        assert_eq!(n, 0);
    }
    #[test]
    fn crossing_is_interpolated_and_nearest() {
        // Sign changes between 2→3 (at 2.5) and 7→8 (at 7.25).
        let s = [1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, -1.0, 3.0, 3.0];
        assert!((nearest_crossing(&s, 2.0).unwrap() - 2.5).abs() < 1e-9);
        assert!((nearest_crossing(&s, 7.0).unwrap() - 7.25).abs() < 1e-9);
        assert_eq!(nearest_crossing(&[1.0, 2.0, 3.0, 0.5], 1.0), None);
        assert_eq!(nearest_crossing(&[0.4, 0.0, 0.3], 0.0), Some(1.0));
    }
    #[test]
    fn summed_channels_can_cancel() {
        assert_eq!(sum_channels(&[0.5, -0.5, 0.25, 0.25], 2), vec![0.0, 0.5]);
    }
    #[test]
    fn frame_ranges_clamp_to_the_file() {
        assert_eq!(frame_range(1.0, 1.01, 48000, 10.0), (48000, 480));
        assert_eq!(frame_range(-1.0, 0.5, 100, 1.0), (0, 50));
        assert_eq!(frame_range(0.9, 2.0, 100, 1.0), (90, 10));
    }
    #[test]
    fn probe_fixtures() {
        let Some(m4a) = fixture("stereo-aac.m4a") else {
            return;
        };
        let i = probe(&m4a).unwrap();
        assert_eq!(
            (i.codec.as_str(), i.sample_rate, i.channels),
            ("AAC-LC", 48000, 2)
        );
        assert!((i.duration - 10.0).abs() < 0.05, "{}", i.duration);
        assert!(!i.is_video_container);
        let i = probe(&fixture("stereo-24.flac").unwrap()).unwrap();
        assert_eq!(
            (i.codec.as_str(), i.bit_depth, i.lossless),
            ("FLAC", Some(24), true)
        );
        let i = probe(&fixture("stereo-video.mp4").unwrap()).unwrap();
        assert!(i.is_video_container);
        assert_eq!(i.codec, "AAC-LC");
        let i = probe(&fixture("surround-5.1.flac").unwrap()).unwrap();
        assert_eq!(i.channels, 6);
        let e = probe(&fixture("truncated.m4a").unwrap()).unwrap_err();
        assert_eq!(e.title, "Can’t read truncated.m4a");
        assert!(e.detail.contains("moov atom not found"), "{}", e.detail);
        let e = probe(&fixture("video-only.mp4").unwrap()).unwrap_err();
        assert_eq!(e.title, "No audio stream in video-only.mp4");
        let e = probe(&fixtures().join("missing.mp3")).unwrap_err();
        assert!(e.title.starts_with("Can’t open"));
        assert_eq!(e.size, None);
    }
    #[test]
    fn window_read_is_sample_exact() {
        let Some(wav) = fixture("stereo-16.wav") else {
            return;
        };
        let all = decode_window(&wav, 0, 48000 * 2, 48000, 2).unwrap();
        let win = decode_window(&wav, 48000, 480, 48000, 2).unwrap();
        assert_eq!(win.len(), 480 * 2);
        assert_eq!(&win[..], &all[48000 * 2..48480 * 2]);
    }
    #[test]
    fn snapping_on_a_sine_finds_a_crossing_within_the_window() {
        let Some(wav) = fixture("sine-mono.wav") else {
            return;
        };
        // 100 Hz sine at 48 kHz crosses zero every 5 ms, starting at 0.
        let s = snap_in(&wav, 1.0021, 48000, 1, 10.0).unwrap();
        assert!(s.snapped);
        assert!((s.time - 1.0).abs() < 1e-4, "{}", s.time);
    }
    #[test]
    fn proxy_is_cached_flac() {
        let Some(src) = fixture("mono.opus") else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let p = make_proxy_file(&src, dir.path()).unwrap();
        assert_eq!(p.extension().unwrap(), "flac");
        assert_eq!(probe(&p).unwrap().codec, "FLAC");
        let again = make_proxy_file(&src, dir.path()).unwrap();
        assert_eq!(p, again);
    }
}
