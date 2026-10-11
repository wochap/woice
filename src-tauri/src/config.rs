use crate::cli::Cli;
use clap::ValueEnum;
use directories::BaseDirs;
use serde::{Deserialize, Serialize};
use std::{
    ffi::OsString,
    fs, io,
    path::{Path, PathBuf},
};
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Format {
    /// Keep the source codec; stream copy when no processing is on.
    #[default]
    Source,
    Mp3,
    Wav,
    Flac,
    Opus,
    M4a,
}
impl Format {
    /// Fixed extension; Source depends on the input and has none.
    pub fn extension(self) -> Option<&'static str> {
        match self {
            Self::Source => None,
            Self::Mp3 => Some("mp3"),
            Self::Wav => Some("wav"),
            Self::Flac => Some("flac"),
            Self::Opus => Some("opus"),
            Self::M4a => Some("m4a"),
        }
    }
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_ascii_lowercase().as_str() {
            "mp3" => Some(Self::Mp3),
            "wav" => Some(Self::Wav),
            "flac" => Some(Self::Flac),
            "opus" => Some(Self::Opus),
            "m4a" => Some(Self::M4a),
            _ => None,
        }
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Quality {
    #[default]
    Original,
    High,
    Small,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, ValueEnum, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OnDone {
    #[default]
    Exit,
    Stay,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FadeCurve {
    Linear,
    Exp,
    #[default]
    SCurve,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum NormalizeTarget {
    #[default]
    #[serde(rename = "-16lufs")]
    Lufs16,
    #[serde(rename = "-14lufs")]
    Lufs14,
    #[serde(rename = "-1dbfs")]
    Peak1,
}
#[derive(Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FileConfig {
    pub format: Option<Format>,
    pub quality: Option<Quality>,
    pub on_done: Option<OnDone>,
    pub declick: Option<bool>,
    pub fade_curve: Option<FadeCurve>,
    pub normalize_target: Option<NormalizeTarget>,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Effective {
    pub format: Format,
    pub quality: Quality,
    pub on_done: OnDone,
    pub declick: bool,
    pub fade_curve: FadeCurve,
    pub normalize_target: NormalizeTarget,
    pub output: Option<PathBuf>,
}
fn path_from(xdg: Option<OsString>, home: Option<PathBuf>) -> Option<PathBuf> {
    xdg.filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| home.map(|h| h.join(".config")))
        .map(|base| base.join("woice").join("config.toml"))
}
pub fn path() -> Option<PathBuf> {
    path_from(
        std::env::var_os("XDG_CONFIG_HOME"),
        BaseDirs::new().map(|b| b.home_dir().to_path_buf()),
    )
}
pub fn load_from(path: &Path) -> Result<FileConfig, String> {
    let text = match fs::read_to_string(path) {
        Ok(v) => v,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(FileConfig::default()),
        Err(e) => return Err(format!("cannot read config {}: {e}", path.display())),
    };
    toml::from_str(&text).map_err(|e| format!("invalid config {}: {e}", path.display()))
}
/// Precedence, later wins: built-in default, config file, `-o` extension, explicit flag.
/// A `--format` flag that disagrees with a known `-o` extension is a usage error;
/// an `-o` without extension gets the flag's extension.
pub fn resolve(cli: &Cli, file: &FileConfig) -> Result<Effective, String> {
    let mut output = cli.output.clone();
    let extension = output
        .as_deref()
        .and_then(Path::extension)
        .and_then(|e| e.to_str())
        .map(str::to_owned);
    let from_ext = extension.as_deref().and_then(Format::from_extension);
    let format = match (cli.format, from_ext) {
        (Some(flag), Some(ext)) if flag != Format::Source && flag != ext => {
            return Err(format!(
                "the output extension .{} does not match --format {}",
                extension.unwrap_or_default(),
                flag.to_possible_value()
                    .map(|v| v.get_name().to_owned())
                    .unwrap_or_default()
            ))
        }
        (Some(flag), _) => flag,
        (None, Some(ext)) => ext,
        (None, None) => file.format.unwrap_or_default(),
    };
    if let (Some(out), Some(ext)) = (output.as_mut(), format.extension()) {
        match extension.as_deref() {
            None => {
                out.set_extension(ext);
            }
            Some(e) if Format::from_extension(e).is_none() && cli.format.is_some() => {
                return Err(format!(
                    "the output extension .{e} does not match --format {ext}"
                ))
            }
            _ => {}
        }
    }
    Ok(Effective {
        format,
        quality: cli.quality.or(file.quality).unwrap_or_default(),
        on_done: cli.on_done.or(file.on_done).unwrap_or_default(),
        declick: file.declick.unwrap_or(true),
        fade_curve: file.fade_curve.unwrap_or_default(),
        normalize_target: file.normalize_target.unwrap_or_default(),
        output,
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;
    fn cli(args: &[&str]) -> Cli {
        Cli::try_parse_from(std::iter::once("woice").chain(args.iter().copied())).unwrap()
    }
    fn file(text: &str) -> FileConfig {
        toml::from_str(text).unwrap()
    }
    #[test]
    fn path_prefers_xdg_then_home_config() {
        assert_eq!(
            path_from(Some("/x".into()), Some("/home/u".into())).unwrap(),
            PathBuf::from("/x/woice/config.toml")
        );
        assert_eq!(
            path_from(None, Some("/home/u".into())).unwrap(),
            PathBuf::from("/home/u/.config/woice/config.toml")
        );
        assert_eq!(
            path_from(Some("".into()), Some("/home/u".into())).unwrap(),
            PathBuf::from("/home/u/.config/woice/config.toml")
        );
    }
    #[test]
    fn load_reports_invalid_toml_unknown_keys_and_bad_values() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        assert_eq!(load_from(&path).unwrap(), FileConfig::default());
        for (text, needle) in [
            ("format = ", "invalid config"),
            ("formt = \"mp3\"", "formt"),
            ("quality = \"ultra\"", "ultra"),
            ("on_done = \"later\"", "later"),
            ("fade_curve = \"cubic\"", "cubic"),
            ("normalize_target = \"-20lufs\"", "-20lufs"),
        ] {
            fs::write(&path, text).unwrap();
            let e = load_from(&path).unwrap_err();
            assert!(e.contains(&path.display().to_string()), "{e}");
            assert!(e.contains(needle), "{e}");
        }
    }
    #[test]
    fn every_key_parses() {
        assert_eq!(
            file("format = \"flac\"\nquality = \"small\"\non_done = \"stay\"\ndeclick = false\nfade_curve = \"exp\"\nnormalize_target = \"-1dbfs\"\n"),
            FileConfig {
                format: Some(Format::Flac),
                quality: Some(Quality::Small),
                on_done: Some(OnDone::Stay),
                declick: Some(false),
                fade_curve: Some(FadeCurve::Exp),
                normalize_target: Some(NormalizeTarget::Peak1),
            }
        );
    }
    #[test]
    fn readme_example_parses() {
        let readme = include_str!("../../README.md");
        let example = readme
            .split("```toml\n")
            .nth(1)
            .and_then(|rest| rest.split("```").next())
            .expect("README has a toml example");
        toml::from_str::<FileConfig>(example).unwrap();
    }
    #[test]
    fn defaults() {
        let e = resolve(&cli(&[]), &FileConfig::default()).unwrap();
        assert_eq!(
            (
                e.format,
                e.quality,
                e.on_done,
                e.declick,
                e.fade_curve,
                e.normalize_target
            ),
            (
                Format::Source,
                Quality::Original,
                OnDone::Exit,
                true,
                FadeCurve::SCurve,
                NormalizeTarget::Lufs16
            )
        );
        assert_eq!(e.output, None);
    }
    #[test]
    fn config_overrides_default() {
        let e = resolve(&cli(&[]), &file("format = \"flac\"\nquality = \"high\"")).unwrap();
        assert_eq!((e.format, e.quality), (Format::Flac, Quality::High));
    }
    #[test]
    fn output_extension_overrides_config() {
        let e = resolve(&cli(&["-o", "out.mp3"]), &file("format = \"flac\"")).unwrap();
        assert_eq!(e.format, Format::Mp3);
        assert_eq!(e.output.unwrap(), PathBuf::from("out.mp3"));
        let e = resolve(&cli(&["-o", "out.MP3"]), &file("format = \"flac\"")).unwrap();
        assert_eq!(e.format, Format::Mp3);
    }
    #[test]
    fn unknown_output_extension_keeps_config_format() {
        let e = resolve(&cli(&["-o", "out.ogg"]), &file("format = \"source\"")).unwrap();
        assert_eq!(e.format, Format::Source);
        assert_eq!(e.output.unwrap(), PathBuf::from("out.ogg"));
    }
    #[test]
    fn flag_overrides_config() {
        let e = resolve(&cli(&["--format", "opus"]), &file("format = \"flac\"")).unwrap();
        assert_eq!(e.format, Format::Opus);
        assert_eq!(e.output, None);
        let e = resolve(&cli(&["--quality", "small"]), &file("quality = \"high\"")).unwrap();
        assert_eq!(e.quality, Quality::Small);
        let e = resolve(&cli(&["--on-done", "exit"]), &file("on_done = \"stay\"")).unwrap();
        assert_eq!(e.on_done, OnDone::Exit);
    }
    #[test]
    fn extension_conflicting_with_flag_is_an_error() {
        let e = resolve(
            &cli(&["-o", "out.mp3", "--format", "wav"]),
            &FileConfig::default(),
        )
        .unwrap_err();
        assert!(e.contains(".mp3") && e.contains("wav"), "{e}");
        assert!(resolve(
            &cli(&["-o", "out.ogg", "--format", "wav"]),
            &FileConfig::default()
        )
        .is_err());
    }
    #[test]
    fn matching_flag_and_extension_and_source_flag_are_accepted() {
        let e = resolve(
            &cli(&["-o", "out.wav", "--format", "wav"]),
            &FileConfig::default(),
        )
        .unwrap();
        assert_eq!(e.format, Format::Wav);
        let e = resolve(
            &cli(&["-o", "out.mp3", "--format", "source"]),
            &FileConfig::default(),
        )
        .unwrap();
        assert_eq!(e.format, Format::Source);
    }
    #[test]
    fn output_without_extension_gets_the_format_extension() {
        let e = resolve(
            &cli(&["-o", "dir/clip", "--format", "flac"]),
            &FileConfig::default(),
        )
        .unwrap();
        assert_eq!(e.output.unwrap(), PathBuf::from("dir/clip.flac"));
        let e = resolve(&cli(&["-o", "dir/clip"]), &file("format = \"m4a\"")).unwrap();
        assert_eq!(e.output.unwrap(), PathBuf::from("dir/clip.m4a"));
    }
}
