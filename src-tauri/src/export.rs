use crate::{
    app::LaunchState,
    config::{FadeCurve, Format, NormalizeTarget, Quality},
    error::AppError,
    media::{MediaInfo, MediaState},
};
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Instant,
};

/// De-click micro-fade length at each cut edge.
pub const MICRO_FADE: f64 = 0.005;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub load_id: u64,
    pub in_s: f64,
    pub out_s: f64,
    pub fade_in_ms: f64,
    pub fade_out_ms: f64,
    pub fade_curve: FadeCurve,
    pub gain_db: f64,
    pub normalize: Option<NormalizeTarget>,
    pub declick: bool,
    pub format: Format,
    pub quality: Quality,
    pub output: String,
}
impl ExportRequest {
    pub fn processing(&self) -> bool {
        self.fade_in_ms > 0.0
            || self.fade_out_ms > 0.0
            || self.gain_db != 0.0
            || self.normalize.is_some()
            || self.declick
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
    Mp3,
    Aac,
    Opus,
    Vorbis,
    Flac,
    Alac,
    /// PCM with big-endian samples (AIFF) when `true`.
    Pcm {
        big_endian: bool,
        float: bool,
    },
}
impl Codec {
    pub fn lossless(self) -> bool {
        matches!(self, Self::Flac | Self::Alac | Self::Pcm { .. })
    }
    fn label(self) -> &'static str {
        match self {
            Self::Mp3 => "MP3",
            Self::Aac => "AAC",
            Self::Opus => "Opus",
            Self::Vorbis => "Vorbis",
            Self::Flac => "FLAC",
            Self::Alac => "ALAC",
            Self::Pcm { .. } => "WAV",
        }
    }
}
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub stream_copy: bool,
    pub codec: Codec,
    pub ext: String,
    pub bitrate_k: Option<u32>,
    pub bit_depth: Option<u32>,
    /// Output sample rate when it differs from the source.
    pub resample: Option<u32>,
    pub downmix_stereo: bool,
}

const MP3_RATES: [u32; 14] = [
    32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];

fn source_kbps(info: &MediaInfo) -> Option<u32> {
    if info.lossless {
        return None;
    }
    info.bitrate.map(|b| (b as f64 / 1000.0).round() as u32)
}
fn lossy_kbps(codec: Codec, quality: Quality, info: &MediaInfo) -> u32 {
    let mono = info.channels == 1;
    match (codec, quality) {
        (Codec::Mp3, Quality::Original) => source_kbps(info)
            .and_then(|k| MP3_RATES.iter().copied().find(|r| *r >= k))
            .unwrap_or(320),
        (Codec::Opus, Quality::Original) => 192,
        (Codec::Opus, Quality::High) => {
            if mono {
                64
            } else {
                128
            }
        }
        (Codec::Opus, Quality::Small) => {
            if mono {
                32
            } else {
                64
            }
        }
        (_, Quality::Original) => source_kbps(info).map_or(256, |k| k.min(256)),
        (_, Quality::High) => {
            if mono {
                128
            } else {
                192
            }
        }
        (_, Quality::Small) => {
            if mono {
                64
            } else {
                128
            }
        }
    }
}
/// Source bit depth for lossless targets: 16 for lossy sources.
fn source_depth(info: &MediaInfo) -> u32 {
    info.bit_depth.filter(|_| info.lossless).unwrap_or(16)
}
fn source_codec(info: &MediaInfo) -> Codec {
    match info.codec_name.as_str() {
        "mp3" => Codec::Mp3,
        "aac" => Codec::Aac,
        "opus" => Codec::Opus,
        "vorbis" => Codec::Vorbis,
        "alac" => Codec::Alac,
        c if c.starts_with("pcm_") => Codec::Pcm {
            big_endian: c.ends_with("be"),
            float: c.starts_with("pcm_f"),
        },
        _ => Codec::Flac,
    }
}
/// Audio-only container for Source exports from video containers or unknown codecs.
pub fn source_extension(info: &MediaInfo) -> String {
    let input_ext = Path::new(&info.path)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    if !info.is_video_container {
        if let Some(e) = input_ext {
            return e;
        }
    }
    match info.codec_name.as_str() {
        "aac" => "m4a",
        "opus" => "opus",
        "vorbis" => "ogg",
        "mp3" => "mp3",
        "flac" => "flac",
        c if c.starts_with("pcm_") => "wav",
        _ => "mka",
    }
    .into()
}
pub fn resolve_target(
    format: Format,
    quality: Quality,
    processing: bool,
    info: &MediaInfo,
) -> Target {
    let (codec, ext) = match format {
        Format::Source => (source_codec(info), source_extension(info)),
        Format::Mp3 => (Codec::Mp3, "mp3".into()),
        Format::Wav => (
            Codec::Pcm {
                big_endian: false,
                float: false,
            },
            "wav".into(),
        ),
        Format::Flac => (Codec::Flac, "flac".into()),
        Format::Opus => (Codec::Opus, "opus".into()),
        Format::M4a => (Codec::Aac, "m4a".into()),
    };
    let stream_copy = format == Format::Source && !processing;
    let mut t = Target {
        stream_copy,
        codec,
        ext,
        bitrate_k: None,
        bit_depth: None,
        resample: None,
        downmix_stereo: false,
    };
    if stream_copy {
        return t;
    }
    if codec.lossless() {
        let src = source_depth(info);
        let depth = match quality {
            Quality::Original => src,
            _ => 16,
        };
        t.bit_depth = Some(match codec {
            Codec::Flac | Codec::Alac => depth.min(24),
            _ => depth,
        });
        if let Codec::Pcm { big_endian, .. } = codec {
            // Only an Original float source stays float.
            let float = quality == Quality::Original && info.codec_name.starts_with("pcm_f");
            t.codec = Codec::Pcm { big_endian, float };
        }
        if quality == Quality::Small && info.sample_rate > 44100 {
            t.resample = Some(44100);
        }
    } else {
        t.bitrate_k = Some(lossy_kbps(codec, quality, info));
        if codec == Codec::Mp3 {
            t.downmix_stereo = info.channels > 2;
            if info.sample_rate > 48000 {
                t.resample = Some(48000);
            }
        }
    }
    t
}
fn pcm_codec(depth: u32, big_endian: bool, float: bool) -> String {
    let e = if big_endian { "be" } else { "le" };
    match (float, depth) {
        (true, 64) => format!("pcm_f64{e}"),
        (true, _) => format!("pcm_f32{e}"),
        (false, 24) => format!("pcm_s24{e}"),
        (false, 32) => format!("pcm_s32{e}"),
        (false, 8) => "pcm_u8".into(),
        _ => format!("pcm_s16{e}"),
    }
}
pub fn encoder_args(t: &Target, channels: u32) -> Vec<String> {
    let s = |v: &[&str]| v.iter().map(|x| x.to_string()).collect::<Vec<_>>();
    let br = || format!("{}k", t.bitrate_k.unwrap_or(192));
    let depth = t.bit_depth.unwrap_or(16);
    let mut a = match t.codec {
        Codec::Mp3 => vec!["-c:a".into(), "libmp3lame".into(), "-b:a".into(), br()],
        Codec::Aac => vec!["-c:a".into(), "aac".into(), "-b:a".into(), br()],
        Codec::Opus => {
            let mut v = vec!["-c:a".into(), "libopus".into(), "-b:a".into(), br()];
            if channels > 2 {
                v.extend(s(&["-mapping_family", "1"]));
            }
            v
        }
        Codec::Vorbis => vec!["-c:a".into(), "libvorbis".into(), "-b:a".into(), br()],
        Codec::Flac if depth > 16 => s(&[
            "-c:a",
            "flac",
            "-sample_fmt",
            "s32",
            "-bits_per_raw_sample",
            "24",
        ]),
        Codec::Flac => s(&["-c:a", "flac", "-sample_fmt", "s16"]),
        Codec::Alac if depth > 16 => s(&[
            "-c:a",
            "alac",
            "-sample_fmt",
            "s32p",
            "-bits_per_raw_sample",
            "24",
        ]),
        Codec::Alac => s(&["-c:a", "alac", "-sample_fmt", "s16p"]),
        Codec::Pcm { big_endian, float } => {
            vec!["-c:a".into(), pcm_codec(depth, big_endian, float)]
        }
    };
    if t.downmix_stereo {
        a.extend(s(&["-ac", "2"]));
    }
    if matches!(t.ext.as_str(), "m4a" | "mp4" | "mov") {
        a.extend(s(&["-movflags", "+faststart"]));
    }
    a
}
fn afade_curve(c: FadeCurve) -> &'static str {
    match c {
        FadeCurve::Linear => "tri",
        FadeCurve::Exp => "cub",
        FadeCurve::SCurve => "hsin",
    }
}
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Loudness {
    pub input_i: f64,
    pub input_tp: f64,
    pub input_lra: f64,
    pub input_thresh: f64,
    pub target_offset: f64,
}
pub fn sample_range(req: &ExportRequest, info: &MediaInfo) -> (u64, u64) {
    let r = info.sample_rate as f64;
    let total = (info.duration * r).round() as u64;
    let s = ((req.in_s.max(0.0) * r).round() as u64).min(total);
    let e = ((req.out_s * r).round() as u64).clamp(s, total);
    (s, e)
}
/// Effective fade lengths in seconds: the sum is clamped to the duration and de-click
/// replaces any fade shorter than 5 ms with a half-sine micro-fade.
pub fn fades(req: &ExportRequest, dur: f64) -> [(f64, &'static str); 2] {
    let fi = (req.fade_in_ms / 1000.0).clamp(0.0, dur);
    let fo = (req.fade_out_ms / 1000.0).clamp(0.0, dur - fi);
    let curve = afade_curve(req.fade_curve);
    let edge = |f: f64| {
        if req.declick && f < MICRO_FADE {
            (MICRO_FADE.min(dur / 2.0), "hsin")
        } else {
            (f, curve)
        }
    };
    [edge(fi), edge(fo)]
}
fn pre_chain(req: &ExportRequest, info: &MediaInfo) -> (Vec<String>, f64) {
    let (s, e) = sample_range(req, info);
    let dur = (e - s) as f64 / info.sample_rate as f64;
    let mut f = vec![
        format!("atrim=start_sample={s}:end_sample={e}"),
        "asetpts=PTS-STARTPTS".into(),
    ];
    let [(fi, ci), (fo, co)] = fades(req, dur);
    if fi > 0.0 {
        f.push(format!("afade=t=in:st=0:d={fi:.6}:curve={ci}"));
    }
    if fo > 0.0 {
        f.push(format!(
            "afade=t=out:st={:.6}:d={fo:.6}:curve={co}",
            dur - fo
        ));
    }
    (f, dur)
}
fn lufs_target(t: NormalizeTarget) -> Option<f64> {
    match t {
        NormalizeTarget::Lufs16 => Some(-16.0),
        NormalizeTarget::Lufs14 => Some(-14.0),
        NormalizeTarget::Peak1 => None,
    }
}
/// The render filter graph: trim, fades, de-click, then gain or normalize, then resample.
pub fn filter_chain(
    req: &ExportRequest,
    info: &MediaInfo,
    t: &Target,
    measured: Option<&Loudness>,
) -> String {
    let (mut f, _) = pre_chain(req, info);
    let out_rate = t.resample.unwrap_or(info.sample_rate);
    let mut resample = t.resample.is_some();
    match (req.normalize, measured) {
        (Some(n), Some(m)) => match lufs_target(n) {
            Some(i) => {
                f.push(format!(
                    "loudnorm=I={i}:TP=-1:LRA=11:measured_I={:.2}:measured_TP={:.2}:measured_LRA={:.2}:measured_thresh={:.2}:offset={:.2}:linear=true:print_format=none",
                    m.input_i, m.input_tp, m.input_lra, m.input_thresh, m.target_offset
                ));
                // loudnorm upsamples to 192 kHz internally.
                resample = true;
            }
            None => f.push(format!("volume={:.2}dB", -1.0 - m.input_tp)),
        },
        (Some(_), None) => {}
        (None, _) if req.gain_db != 0.0 => f.push(format!("volume={:.1}dB", req.gain_db)),
        (None, _) => {}
    }
    if resample {
        f.push(format!("aresample={out_rate}"));
    }
    f.join(",")
}
/// `level` is `info` for passes whose filter reports on stderr (loudnorm JSON).
fn base_args(level: &str) -> Vec<String> {
    [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-v",
        level,
        "-nostats",
        "-progress",
        "pipe:1",
    ]
    .map(String::from)
    .to_vec()
}
pub fn measure_args(req: &ExportRequest, info: &MediaInfo) -> Vec<String> {
    let (mut f, _) = pre_chain(req, info);
    f.push("loudnorm=I=-16:TP=-1:LRA=11:print_format=json".into());
    let mut a = base_args("info");
    a.extend([
        "-i".into(),
        info.path.clone(),
        "-map".into(),
        "0:a:0".into(),
        "-vn".into(),
    ]);
    a.extend([
        "-af".into(),
        f.join(","),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);
    a
}
pub fn render_args(
    req: &ExportRequest,
    info: &MediaInfo,
    t: &Target,
    measured: Option<&Loudness>,
    out: &Path,
) -> Vec<String> {
    let mut a = base_args("error");
    a.extend(["-i".into(), info.path.clone()]);
    a.extend([
        "-map".into(),
        "0:a:0".into(),
        "-vn".into(),
        "-sn".into(),
        "-dn".into(),
    ]);
    a.extend(["-af".into(), filter_chain(req, info, t, measured)]);
    a.extend(encoder_args(t, info.channels));
    a.extend(["-map_metadata".into(), "0".into()]);
    a.push(out.display().to_string());
    a
}
pub fn copy_args(req: &ExportRequest, info: &MediaInfo, t: &Target, out: &Path) -> Vec<String> {
    let mut a = base_args("error");
    a.extend([
        "-ss".into(),
        format!("{:.6}", req.in_s),
        "-i".into(),
        info.path.clone(),
    ]);
    a.extend(["-t".into(), format!("{:.6}", req.out_s - req.in_s)]);
    a.extend([
        "-map".into(),
        "0:a:0".into(),
        "-vn".into(),
        "-sn".into(),
        "-dn".into(),
        "-c".into(),
        "copy".into(),
    ]);
    if matches!(t.ext.as_str(), "m4a" | "mp4" | "mov") {
        a.extend(["-movflags".into(), "+faststart".into()]);
    }
    a.extend(["-map_metadata".into(), "0".into()]);
    a.push(out.display().to_string());
    a
}
pub fn parse_loudnorm(stderr: &str) -> Option<Loudness> {
    let start = stderr.rfind('{')?;
    let end = stderr[start..].find('}')? + start + 1;
    let v: serde_json::Value = serde_json::from_str(&stderr[start..end]).ok()?;
    let f = |k: &str| v.get(k)?.as_str()?.trim().parse::<f64>().ok();
    Some(Loudness {
        input_i: f("input_i")?,
        input_tp: f("input_tp")?,
        input_lra: f("input_lra")?,
        input_thresh: f("input_thresh")?,
        target_offset: f("target_offset").unwrap_or(0.0),
    })
}

// ---------- labels ----------

pub fn tc(s: f64) -> String {
    let ms = (s.abs() * 1000.0).round() as u64;
    format!(
        "{}{}:{:02}.{:03}",
        if s < 0.0 { "−" } else { "" },
        ms / 60000,
        ms % 60000 / 1000,
        ms % 1000
    )
}
fn layout(info: &MediaInfo, t: &Target) -> String {
    if t.downmix_stereo {
        "stereo".into()
    } else {
        info.channel_layout.clone()
    }
}
pub fn target_label(t: &Target, info: &MediaInfo) -> String {
    if t.stream_copy {
        return format!("{} · stream copy", info.codec);
    }
    let mut s = t.codec.label().to_owned();
    if let Some(k) = t.bitrate_k {
        s.push_str(&format!(" {k} kbps"));
    }
    if let Some(d) = t.bit_depth {
        s.push_str(&format!(" {d}-bit"));
    }
    if let Some(r) = t.resample {
        s.push_str(&format!(" {} kHz", r as f64 / 1000.0));
    }
    s
}
fn lufs_text(v: f64) -> String {
    format!("{}{:.1} LUFS", if v < 0.0 { "−" } else { "" }, v.abs())
}

// ---------- runner ----------

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Step {
    pub label: String,
    /// `done`, `active` or `pending`.
    pub state: &'static str,
    pub note: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub out_name: String,
    pub format_line: String,
    pub percent: f64,
    pub steps: Vec<Step>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub size: u64,
    pub format_line: String,
    pub measured_lufs: Option<f64>,
    pub actual_start: Option<f64>,
    pub took_ms: u64,
    pub stream_copy: bool,
}
#[derive(Default)]
pub struct Cancel {
    cancelled: AtomicBool,
    pid: Mutex<Option<u32>>,
}
impl Cancel {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = self.pid.lock().ok().and_then(|g| *g) {
            unsafe {
                libc::kill(pid as i32, libc::SIGKILL);
            }
        }
    }
    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}
fn step_labels(req: &ExportRequest, info: &MediaInfo, t: &Target) -> Vec<String> {
    let target = target_label(t, info);
    if t.stream_copy {
        return vec!["Copy audio packets".into(), "Write file".into()];
    }
    if let Some(n) = req.normalize {
        let what = if n == NormalizeTarget::Peak1 {
            "peak"
        } else {
            "loudness"
        };
        return vec![
            format!("Measure {what} (pass 1 of 2)"),
            format!("Render + encode {}", t.codec.label()),
            "Write tags & file".into(),
        ];
    }
    let mut ops = vec![];
    if req.gain_db != 0.0 {
        ops.push("gain");
    }
    if req.fade_in_ms > 0.0 || req.fade_out_ms > 0.0 {
        ops.push("fades");
    }
    if req.declick {
        ops.push("de-click");
    }
    let middle = if ops.is_empty() {
        format!("Convert to {target}")
    } else {
        format!("Apply {}", ops.join(", "))
    };
    vec![
        format!("Decode {}", info.codec),
        middle,
        format!("Encode {} · write file", t.codec.label()),
    ]
}
struct Tracker<'a> {
    labels: Vec<String>,
    notes: Vec<String>,
    active: usize,
    started: Instant,
    step_started: Instant,
    progress: Progress,
    emit: &'a mut dyn FnMut(&Progress),
}
impl Tracker<'_> {
    fn emit(&mut self, percent: f64, active_note: String) {
        self.progress.percent = percent.clamp(0.0, 100.0);
        self.progress.steps = self
            .labels
            .iter()
            .enumerate()
            .map(|(i, l)| Step {
                label: l.clone(),
                state: match i.cmp(&self.active) {
                    std::cmp::Ordering::Less => "done",
                    std::cmp::Ordering::Equal => "active",
                    std::cmp::Ordering::Greater => "pending",
                },
                note: if i < self.active {
                    self.notes[i].clone()
                } else if i == self.active {
                    active_note.clone()
                } else {
                    String::new()
                },
            })
            .collect();
        (self.emit)(&self.progress);
    }
    fn advance(&mut self, to: usize) {
        while self.active < to {
            let took = self.step_started.elapsed().as_secs_f64();
            self.notes[self.active] = format!("{}:{:04.1}", (took / 60.0) as u64, took % 60.0);
            self.active += 1;
            self.step_started = Instant::now();
        }
    }
}
/// Runs ffmpeg, reporting `out_time_us` as a fraction of `dur`; returns stderr.
fn run_ffmpeg(
    args: &[String],
    dur: f64,
    cancel: &Cancel,
    mut on: impl FnMut(f64),
) -> Result<String, AppError> {
    if cancel.is_cancelled() {
        return Err(AppError::Cancelled);
    }
    tracing::debug!(?args, "ffmpeg");
    let mut child = Command::new("ffmpeg")
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Export(format!("cannot start ffmpeg: {e}")))?;
    *cancel
        .pid
        .lock()
        .map_err(|_| AppError::Internal("poisoned".into()))? = Some(child.id());
    let mut stderr = child.stderr.take().expect("piped stderr");
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });
    for line in BufReader::new(child.stdout.take().expect("piped stdout")).lines() {
        let Ok(line) = line else { break };
        if let Some(us) = line
            .strip_prefix("out_time_us=")
            .and_then(|v| v.trim().parse::<f64>().ok())
        {
            on((us / 1e6 / dur.max(1e-6)).clamp(0.0, 1.0));
        }
    }
    let status = child.wait()?;
    *cancel
        .pid
        .lock()
        .map_err(|_| AppError::Internal("poisoned".into()))? = None;
    let stderr = err_reader.join().unwrap_or_default();
    if cancel.is_cancelled() {
        return Err(AppError::Cancelled);
    }
    if !status.success() {
        let msg = stderr
            .lines()
            .rev()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("ffmpeg failed");
        return Err(AppError::Export(msg.trim().to_owned()));
    }
    Ok(stderr)
}
fn probe_duration(path: &Path) -> Result<f64, AppError> {
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type:format=duration",
            "-of",
            "json",
        ])
        .arg(path)
        .stdin(Stdio::null())
        .output()?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap_or_default();
    let has_audio = v["streams"].as_array().is_some_and(|s| !s.is_empty());
    if !out.status.success() || !has_audio {
        return Err(AppError::Export(
            "the written file has no audio stream".into(),
        ));
    }
    v["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse().ok())
        .ok_or_else(|| AppError::Export("the written file has no duration".into()))
}
/// Measures integrated loudness of a file.
pub fn measure_file(path: &Path) -> Result<Loudness, AppError> {
    let out = Command::new("ffmpeg")
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(path)
        .args([
            "-map",
            "0:a:0",
            "-af",
            "loudnorm=print_format=json",
            "-f",
            "null",
            "-",
        ])
        .stdin(Stdio::null())
        .output()?;
    parse_loudnorm(&String::from_utf8_lossy(&out.stderr))
        .ok_or_else(|| AppError::Export("loudness measurement failed".into()))
}
/// Start of the packet at or before `t` in the first audio stream.
pub fn packet_start(path: &Path, t: f64) -> Option<f64> {
    let out = Command::new("ffprobe")
        .args(["-v", "error", "-select_streams", "a:0", "-read_intervals"])
        .arg(format!("{}%+2", (t - 1.0).max(0.0)))
        .args(["-show_entries", "packet=pts_time", "-of", "csv=p=0"])
        .arg(path)
        .stdin(Stdio::null())
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter_map(|l| l.trim().trim_end_matches(',').parse::<f64>().ok())
        .filter(|p| *p <= t + 1e-6)
        .fold(None, |a: Option<f64>, p| Some(a.map_or(p, |a| a.max(p))))
}
pub fn same_file(a: &Path, b: &Path) -> bool {
    let canon = |p: &Path| {
        p.canonicalize()
            .ok()
            .or_else(|| Some(p.parent()?.canonicalize().ok()?.join(p.file_name()?)))
    };
    match (canon(a), canon(b)) {
        (Some(x), Some(y)) => x == y,
        _ => a == b,
    }
}
fn temp_path(out: &Path) -> PathBuf {
    let name = out
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = out
        .extension()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    out.with_file_name(format!(".{name}.woice-tmp.{ext}"))
}
pub fn run_export(
    req: &ExportRequest,
    info: &MediaInfo,
    cancel: &Cancel,
    emit: &mut dyn FnMut(&Progress),
) -> Result<ExportResult, AppError> {
    let started = Instant::now();
    let out = PathBuf::from(&req.output);
    if same_file(&out, Path::new(&info.path)) {
        return Err(AppError::Destination(
            "Choose a different file than the source".into(),
        ));
    }
    let dir = out
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    if !dir.is_dir() {
        return Err(AppError::Destination(format!(
            "{} does not exist",
            dir.display()
        )));
    }
    let t = resolve_target(req.format, req.quality, req.processing(), info);
    let (s, e) = sample_range(req, info);
    let expected = (e - s) as f64 / info.sample_rate as f64;
    if expected < 0.01 {
        return Err(AppError::Export(
            "the selection is shorter than 10 ms".into(),
        ));
    }
    let labels = step_labels(req, info, &t);
    let format_line = format!(
        "{} · {} · {}",
        target_label(&t, info),
        layout(info, &t),
        tc(expected)
    );
    let mut tracker = Tracker {
        notes: vec![String::new(); labels.len()],
        labels,
        active: 0,
        started,
        step_started: Instant::now(),
        progress: Progress {
            out_name: out
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
            format_line: format_line.clone(),
            percent: 0.0,
            steps: vec![],
        },
        emit,
    };
    tracker.emit(0.0, "0%".into());
    let tmp = temp_path(&out);
    let result = (|| -> Result<(Option<f64>, Option<f64>), AppError> {
        if t.stream_copy {
            run_ffmpeg(&copy_args(req, info, &t, &tmp), expected, cancel, |f| {
                tracker.emit(f * 95.0, format!("{:.0}%", f * 100.0))
            })?;
            tracker.advance(1);
            tracker.emit(97.0, String::new());
            let d = probe_duration(&tmp)?;
            if (d - expected).abs() > 0.5 {
                return Err(AppError::Export(format!(
                    "validation failed: duration {d:.3} s, expected {expected:.3} s"
                )));
            }
            return Ok((None, packet_start(Path::new(&info.path), req.in_s)));
        }
        let measured = match req.normalize {
            Some(_) => {
                let stderr = run_ffmpeg(&measure_args(req, info), expected, cancel, |f| {
                    tracker.emit(f * 40.0, format!("{:.0}%", f * 100.0))
                })?;
                tracker.advance(1);
                Some(
                    parse_loudnorm(&stderr)
                        .ok_or_else(|| AppError::Export("loudness measurement failed".into()))?,
                )
            }
            None => None,
        };
        let (from, span) = if measured.is_some() {
            (40.0, 55.0)
        } else {
            (0.0, 95.0)
        };
        let mut decoded = measured.is_some();
        run_ffmpeg(
            &render_args(req, info, &t, measured.as_ref(), &tmp),
            expected,
            cancel,
            |f| {
                if !decoded && f > 0.0 {
                    tracker.advance(1);
                    decoded = true;
                }
                tracker.emit(from + f * span, format!("{:.0}%", f * 100.0))
            },
        )?;
        tracker.advance(tracker.labels.len() - 1);
        tracker.emit(97.0, String::new());
        let d = probe_duration(&tmp)?;
        if (d - expected).abs() > 0.05 {
            return Err(AppError::Export(format!(
                "validation failed: duration {d:.3} s, expected {expected:.3} s"
            )));
        }
        let lufs = match req.normalize {
            Some(_) => Some(measure_file(&tmp)?.input_i),
            None => None,
        };
        Ok((lufs, None))
    })();
    let (lufs, actual_start) = match result {
        Ok(v) => v,
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            return Err(e);
        }
    };
    if cancel.is_cancelled() {
        let _ = std::fs::remove_file(&tmp);
        return Err(AppError::Cancelled);
    }
    std::fs::rename(&tmp, &out).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })?;
    tracker.advance(tracker.labels.len());
    tracker.emit(100.0, String::new());
    let size = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(0);
    let abs = std::path::absolute(&out).unwrap_or(out);
    Ok(ExportResult {
        path: abs.display().to_string(),
        size,
        format_line: match lufs {
            Some(l) => format!("{format_line} · {}", lufs_text(l)),
            None => format_line,
        },
        measured_lufs: lufs,
        actual_start,
        took_ms: tracker.started.elapsed().as_millis() as u64,
        stream_copy: t.stream_copy,
    })
}

#[derive(Default)]
pub struct ExportState {
    busy: AtomicBool,
    cancel: Mutex<Option<std::sync::Arc<Cancel>>>,
}
#[tauri::command]
pub async fn start_export(
    app: tauri::AppHandle,
    request: ExportRequest,
) -> Result<ExportResult, AppError> {
    use tauri::{Emitter, Manager};
    let info = {
        let media = app.state::<MediaState>();
        let guard = media
            .current
            .lock()
            .map_err(|_| AppError::Internal("poisoned".into()))?;
        match guard.as_ref() {
            Some(l) if l.id == request.load_id => l.info.clone(),
            _ => return Err(AppError::StaleLoad),
        }
    };
    let state = app.state::<ExportState>();
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err(AppError::ExportBusy);
    }
    let cancel = std::sync::Arc::new(Cancel::default());
    if let Ok(mut g) = state.cancel.lock() {
        *g = Some(cancel.clone());
    }
    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        run_export(&request, &info, &cancel, &mut |p| {
            let _ = handle.emit("export-progress", p);
        })
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;
    let state = app.state::<ExportState>();
    state.busy.store(false, Ordering::SeqCst);
    if let Ok(mut g) = state.cancel.lock() {
        *g = None;
    }
    match &result {
        Ok(r) => {
            tracing::info!(path = %r.path, took_ms = r.took_ms, "exported");
            crate::lifecycle::write_success(Path::new(&r.path))?;
            app.state::<LaunchState>()
                .succeeded
                .store(true, Ordering::SeqCst);
        }
        Err(e) => tracing::warn!("export failed: {e}"),
    }
    result
}
#[tauri::command]
pub fn cancel_export(state: tauri::State<'_, ExportState>) {
    if let Some(c) = state.cancel.lock().ok().and_then(|g| g.clone()) {
        c.cancel();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::{probe, tests::fixture};
    fn info(codec: &str, rate: u32, ch: u32, depth: Option<u32>, kbps: Option<u64>) -> MediaInfo {
        MediaInfo {
            load_id: 1,
            path: format!("/m/song.{}", if codec == "aac" { "m4a" } else { codec }),
            name: "song".into(),
            dir: "/m".into(),
            size: 1,
            codec: crate::media::display_codec(codec, None),
            codec_name: codec.into(),
            profile: None,
            sample_rate: rate,
            channels: ch,
            channel_layout: if ch == 1 {
                "mono".into()
            } else {
                "stereo".into()
            },
            bit_depth: depth,
            bitrate: kbps.map(|k| k * 1000),
            duration: 10.0,
            container: String::new(),
            is_video_container: false,
            lossless: crate::media::is_lossless(codec),
            tags: Default::default(),
            preview_url: String::new(),
        }
    }
    fn req(format: Format, quality: Quality) -> ExportRequest {
        ExportRequest {
            load_id: 1,
            in_s: 1.0,
            out_s: 2.0,
            fade_in_ms: 0.0,
            fade_out_ms: 0.0,
            fade_curve: FadeCurve::SCurve,
            gain_db: 0.0,
            normalize: None,
            declick: false,
            format,
            quality,
            output: "/tmp/out".into(),
        }
    }
    #[test]
    fn lossy_tiers() {
        let aac = info("aac", 48000, 1, None, Some(150));
        let k = |f, q, i: &MediaInfo| resolve_target(f, q, true, i).bitrate_k.unwrap();
        assert_eq!(k(Format::Mp3, Quality::Original, &aac), 160);
        assert_eq!(k(Format::Mp3, Quality::High, &aac), 128);
        assert_eq!(k(Format::Mp3, Quality::Small, &aac), 64);
        assert_eq!(k(Format::Opus, Quality::Original, &aac), 192);
        assert_eq!(k(Format::Opus, Quality::High, &aac), 64);
        assert_eq!(k(Format::Opus, Quality::Small, &aac), 32);
        assert_eq!(k(Format::M4a, Quality::Original, &aac), 150);
        let st = info("aac", 48000, 2, None, Some(400));
        assert_eq!(k(Format::M4a, Quality::Original, &st), 256);
        assert_eq!(k(Format::M4a, Quality::High, &st), 192);
        assert_eq!(k(Format::M4a, Quality::Small, &st), 128);
        assert_eq!(
            k(
                Format::Mp3,
                Quality::Original,
                &info("flac", 44100, 2, Some(16), Some(900))
            ),
            320
        );
    }
    #[test]
    fn lossless_tiers() {
        let src = info("flac", 96000, 2, Some(24), None);
        let t = resolve_target(Format::Flac, Quality::Small, true, &src);
        assert_eq!((t.bit_depth, t.resample), (Some(16), Some(44100)));
        let t = resolve_target(Format::Flac, Quality::High, true, &src);
        assert_eq!((t.bit_depth, t.resample), (Some(16), None));
        let t = resolve_target(Format::Wav, Quality::Original, true, &src);
        assert_eq!((t.bit_depth, t.resample), (Some(24), None));
        assert_eq!(encoder_args(&t, 2), ["-c:a", "pcm_s24le"]);
        let t = resolve_target(Format::Flac, Quality::Original, true, &src);
        assert_eq!(
            encoder_args(&t, 2),
            [
                "-c:a",
                "flac",
                "-sample_fmt",
                "s32",
                "-bits_per_raw_sample",
                "24"
            ]
        );
    }
    #[test]
    fn source_container_mapping_for_video() {
        let mut v = info("aac", 48000, 2, None, Some(128));
        v.path = "/v/talk.mp4".into();
        v.is_video_container = true;
        assert_eq!(source_extension(&v), "m4a");
        for (codec, ext) in [
            ("opus", "opus"),
            ("vorbis", "ogg"),
            ("mp3", "mp3"),
            ("flac", "flac"),
            ("pcm_s16le", "wav"),
            ("ac3", "mka"),
        ] {
            v.codec_name = codec.into();
            assert_eq!(source_extension(&v), ext, "{codec}");
        }
        assert_eq!(
            source_extension(&info("mp3", 44100, 2, None, Some(128))),
            "mp3"
        );
    }
    #[test]
    fn stream_copy_only_without_processing() {
        let i = info("mp3", 44100, 2, None, Some(128));
        assert!(resolve_target(Format::Source, Quality::Original, false, &i).stream_copy);
        assert!(!resolve_target(Format::Source, Quality::Original, true, &i).stream_copy);
        assert!(!resolve_target(Format::Mp3, Quality::Original, false, &i).stream_copy);
        let mut r = req(Format::Source, Quality::Original);
        assert!(!r.processing());
        r.declick = true;
        assert!(r.processing());
    }
    #[test]
    fn mp3_downmixes_surround_and_caps_rate() {
        let i = info("flac", 96000, 6, Some(24), None);
        let t = resolve_target(Format::Mp3, Quality::High, true, &i);
        assert!(t.downmix_stereo);
        assert_eq!(t.resample, Some(48000));
        assert_eq!(
            encoder_args(&t, 6),
            ["-c:a", "libmp3lame", "-b:a", "192k", "-ac", "2"]
        );
        let t = resolve_target(Format::Flac, Quality::Original, true, &i);
        assert!(!t.downmix_stereo);
    }
    #[test]
    fn filter_chain_orders_trim_fades_gain() {
        let i = info("pcm_s16le", 48000, 2, Some(16), None);
        let mut r = req(Format::Wav, Quality::Original);
        r.fade_in_ms = 200.0;
        r.fade_out_ms = 300.0;
        r.fade_curve = FadeCurve::Exp;
        r.gain_db = 3.0;
        let t = resolve_target(r.format, r.quality, true, &i);
        assert_eq!(
            filter_chain(&r, &i, &t, None),
            "atrim=start_sample=48000:end_sample=96000,asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.200000:curve=cub,afade=t=out:st=0.700000:d=0.300000:curve=cub,volume=3.0dB"
        );
    }
    #[test]
    fn declick_adds_micro_fades_only_where_no_longer_fade_exists() {
        let i = info("pcm_s16le", 48000, 1, Some(16), None);
        let mut r = req(Format::Wav, Quality::Original);
        r.declick = true;
        r.fade_in_ms = 100.0;
        r.fade_curve = FadeCurve::Linear;
        let t = resolve_target(r.format, r.quality, true, &i);
        let c = filter_chain(&r, &i, &t, None);
        assert!(c.contains("afade=t=in:st=0:d=0.100000:curve=tri"), "{c}");
        assert!(
            c.contains("afade=t=out:st=0.995000:d=0.005000:curve=hsin"),
            "{c}"
        );
    }
    #[test]
    fn fade_sum_is_clamped() {
        let mut r = req(Format::Wav, Quality::Original);
        r.fade_in_ms = 1500.0;
        r.fade_out_ms = 1000.0;
        let [(fi, _), (fo, _)] = fades(&r, 2.0);
        assert_eq!((fi, fo), (1.5, 0.5));
    }
    #[test]
    fn normalize_ignores_gain_and_uses_measurement() {
        let i = info("aac", 48000, 1, None, Some(192));
        let mut r = req(Format::Mp3, Quality::High);
        r.gain_db = 3.0;
        r.normalize = Some(NormalizeTarget::Lufs16);
        let t = resolve_target(r.format, r.quality, true, &i);
        let m = Loudness {
            input_i: -20.0,
            input_tp: -3.0,
            input_lra: 5.0,
            input_thresh: -30.0,
            target_offset: 0.2,
        };
        let c = filter_chain(&r, &i, &t, Some(&m));
        assert!(!c.contains("volume"), "{c}");
        assert!(
            c.contains("loudnorm=I=-16:TP=-1:LRA=11:measured_I=-20.00:measured_TP=-3.00"),
            "{c}"
        );
        assert!(c.ends_with("aresample=48000"), "{c}");
        r.normalize = Some(NormalizeTarget::Peak1);
        assert!(filter_chain(&r, &i, &t, Some(&m)).ends_with("volume=2.00dB"));
        let a = measure_args(&r, &i);
        assert!(a
            .iter()
            .any(|x| x.ends_with("loudnorm=I=-16:TP=-1:LRA=11:print_format=json")));
    }
    #[test]
    fn render_and_copy_args() {
        let i = info("aac", 48000, 2, None, Some(192));
        let r = req(Format::Source, Quality::Original);
        let t = resolve_target(r.format, r.quality, false, &i);
        let a = copy_args(&r, &i, &t, Path::new("/o/x.m4a"));
        let s = a.join(" ");
        assert!(s.contains("-ss 1.000000 -i /m/song.m4a -t 1.000000 -map 0:a:0 -vn -sn -dn -c copy -movflags +faststart -map_metadata 0 /o/x.m4a"), "{s}");
        let r = req(Format::Opus, Quality::Small);
        let t = resolve_target(r.format, r.quality, true, &i);
        let s = render_args(&r, &i, &t, None, Path::new("/o/x.opus")).join(" ");
        assert!(
            s.contains("-c:a libopus -b:a 64k -map_metadata 0 /o/x.opus"),
            "{s}"
        );
    }
    #[test]
    fn loudnorm_json_is_parsed() {
        let s = "[Parsed_loudnorm_0 @ 0x1] \n{\n\t\"input_i\" : \"-23.54\",\n\t\"input_tp\" : \"-6.10\",\n\t\"input_lra\" : \"1.20\",\n\t\"input_thresh\" : \"-33.80\",\n\t\"output_i\" : \"-16.0\",\n\t\"target_offset\" : \"0.30\"\n}\n";
        assert_eq!(
            parse_loudnorm(s).unwrap(),
            Loudness {
                input_i: -23.54,
                input_tp: -6.10,
                input_lra: 1.2,
                input_thresh: -33.8,
                target_offset: 0.3
            }
        );
    }
    #[test]
    fn labels() {
        assert_eq!(tc(215.375), "3:35.375");
        let i = info("aac", 48000, 1, None, Some(192));
        let t = resolve_target(Format::Mp3, Quality::High, true, &i);
        assert_eq!(target_label(&t, &i), "MP3 128 kbps");
        let mut r = req(Format::Mp3, Quality::High);
        r.normalize = Some(NormalizeTarget::Lufs16);
        assert_eq!(
            step_labels(&r, &i, &t),
            [
                "Measure loudness (pass 1 of 2)",
                "Render + encode MP3",
                "Write tags & file"
            ]
        );
        r.normalize = None;
        r.fade_in_ms = 10.0;
        r.declick = true;
        assert_eq!(step_labels(&r, &i, &t)[1], "Apply fades, de-click");
        assert_eq!(lufs_text(-16.04), "−16.0 LUFS");
    }
    #[test]
    fn output_equal_to_input_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("a.wav");
        std::fs::write(&src, b"x").unwrap();
        let mut i = info("pcm_s16le", 48000, 1, Some(16), None);
        i.path = src.display().to_string();
        let mut r = req(Format::Wav, Quality::Original);
        r.output = dir.path().join("./a.wav").display().to_string();
        let e = run_export(&r, &i, &Cancel::default(), &mut |_| {}).unwrap_err();
        assert!(
            matches!(e, AppError::Destination(m) if m == "Choose a different file than the source")
        );
    }

    // ---------- integration tests on fixtures ----------

    fn export_fixture(
        name: &str,
        r: &mut ExportRequest,
        out: &str,
    ) -> Option<(tempfile::TempDir, ExportResult)> {
        let src = fixture(name)?;
        let mut i = probe(&src).unwrap();
        i.load_id = 1;
        let dir = tempfile::tempdir().unwrap();
        r.output = dir.path().join(out).display().to_string();
        let mut steps = vec![];
        let res = run_export(r, &i, &Cancel::default(), &mut |p| steps.push(p.clone())).unwrap();
        assert_eq!(steps.last().unwrap().percent, 100.0);
        assert!(steps
            .last()
            .unwrap()
            .steps
            .iter()
            .all(|s| s.state == "done"));
        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains("woice-tmp"))
            .collect();
        assert!(leftovers.is_empty());
        Some((dir, res))
    }
    fn frames(path: &str) -> u64 {
        let out = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "a:0",
                "-count_packets",
                "-show_entries",
                "stream=duration_ts,sample_rate,bits_per_sample,bits_per_raw_sample,codec_name",
                "-of",
                "json",
                path,
            ])
            .output()
            .unwrap();
        let v: serde_json::Value = serde_json::from_slice(&out.stdout).unwrap();
        v["streams"][0]["duration_ts"].as_u64().unwrap()
    }
    #[test]
    fn wav_export_is_sample_exact() {
        let mut r = req(Format::Wav, Quality::Original);
        let Some((_d, res)) = export_fixture("stereo-16.wav", &mut r, "out.wav") else {
            return;
        };
        assert_eq!(frames(&res.path), 48000);
        assert!(
            res.format_line
                .starts_with("WAV 16-bit · stereo · 0:01.000"),
            "{}",
            res.format_line
        );
    }
    #[test]
    fn flac_small_is_16_bit_44_1() {
        let mut r = req(Format::Flac, Quality::Small);
        let Some((_d, res)) = export_fixture("hires-24-96.flac", &mut r, "out.flac") else {
            return;
        };
        let i = probe(Path::new(&res.path)).unwrap();
        assert_eq!((i.sample_rate, i.bit_depth), (44100, Some(16)));
    }
    #[test]
    fn lufs_normalize_hits_target() {
        let mut r = req(Format::Wav, Quality::Original);
        r.in_s = 0.5;
        r.out_s = 9.5;
        r.normalize = Some(NormalizeTarget::Lufs16);
        r.gain_db = 6.0;
        let Some((_d, res)) = export_fixture("stereo-16.wav", &mut r, "out.wav") else {
            return;
        };
        let m = measure_file(Path::new(&res.path)).unwrap();
        assert!((m.input_i + 16.0).abs() <= 0.5, "{}", m.input_i);
        assert!(res.measured_lufs.is_some());
        assert!(res.format_line.contains("LUFS"));
        assert_eq!(probe(Path::new(&res.path)).unwrap().sample_rate, 48000);
    }
    #[test]
    fn mp3_stream_copy_keeps_duration_and_reports_start() {
        let mut r = req(Format::Source, Quality::Original);
        r.in_s = 2.0;
        r.out_s = 6.0;
        let Some((_d, res)) = export_fixture("stereo.mp3", &mut r, "out.mp3") else {
            return;
        };
        assert!(res.stream_copy);
        let d = probe(Path::new(&res.path)).unwrap().duration;
        assert!((d - 4.0).abs() < 0.1, "{d}");
        let start = res.actual_start.unwrap();
        assert!(start <= 2.0 && start > 1.95, "{start}");
    }
    #[test]
    fn source_from_video_writes_audio_only_m4a() {
        let mut r = req(Format::Source, Quality::Original);
        r.declick = true;
        let Some((_d, res)) = export_fixture("stereo-video.mp4", &mut r, "out.m4a") else {
            return;
        };
        let i = probe(Path::new(&res.path)).unwrap();
        assert_eq!(i.codec, "AAC-LC");
        let out = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v",
                "-show_entries",
                "stream=index",
                "-of",
                "csv=p=0",
                &res.path,
            ])
            .output()
            .unwrap();
        assert!(out.stdout.is_empty());
    }
    #[test]
    fn cancel_leaves_no_file() {
        let Some(src) = fixture("stereo-16.wav") else {
            return;
        };
        let i = probe(&src).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mut r = req(Format::Opus, Quality::High);
        r.in_s = 0.0;
        r.out_s = 10.0;
        r.output = dir.path().join("out.opus").display().to_string();
        let cancel = std::sync::Arc::new(Cancel::default());
        let c2 = cancel.clone();
        let mut fired = false;
        let e = run_export(&r, &i, &cancel, &mut |_| {
            if !fired {
                fired = true;
                c2.cancel();
            }
        })
        .unwrap_err();
        assert!(matches!(e, AppError::Cancelled), "{e}");
        assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0);
    }
}
