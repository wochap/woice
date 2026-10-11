use crate::config::{Effective, FadeCurve, Format, NormalizeTarget, OnDone, Quality};
use clap::{Parser, ValueEnum};
use serde::Serialize;
use std::path::PathBuf;
#[derive(Debug, Clone, Parser)]
#[command(
    name = "woice",
    version,
    about = "Trim one audio file precisely in a minimal Wayland UI"
)]
pub struct Cli {
    #[arg(value_name = "INPUT")]
    pub input: Option<PathBuf>,
    #[arg(short, long, value_name = "PATH")]
    pub output: Option<PathBuf>,
    #[arg(long, value_enum)]
    pub format: Option<Format>,
    #[arg(long, value_enum)]
    pub quality: Option<Quality>,
    #[arg(long, value_enum)]
    pub on_done: Option<OnDone>,
    #[arg(short, long)]
    pub verbose: bool,
    /// Print a shell completion script and exit
    #[arg(long, value_enum, value_name = "SHELL")]
    pub completions: Option<Shell>,
}
pub const COMPLETION_ZSH: &str = include_str!("../completions/_woice");
#[derive(Debug, Clone, Copy, PartialEq, Eq, ValueEnum)]
pub enum Shell {
    Zsh,
}
impl Shell {
    pub fn script(self) -> &'static str {
        match self {
            Shell::Zsh => COMPLETION_ZSH,
        }
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    pub input: Option<String>,
    pub output: Option<String>,
    pub format: Format,
    pub quality: Quality,
    pub on_done: OnDone,
    pub declick: bool,
    pub fade_curve: FadeCurve,
    pub normalize_target: NormalizeTarget,
    pub verbose: bool,
    pub input_extensions: Vec<String>,
}
impl LaunchOptions {
    pub fn new(cli: Cli, effective: Effective) -> Self {
        let absolute = |p: PathBuf| {
            std::path::absolute(&p)
                .unwrap_or(p)
                .to_string_lossy()
                .into_owned()
        };
        Self {
            input: cli.input.map(absolute),
            output: effective.output.map(absolute),
            format: effective.format,
            quality: effective.quality,
            on_done: effective.on_done,
            declick: effective.declick,
            fade_curve: effective.fade_curve,
            normalize_target: effective.normalize_target,
            verbose: cli.verbose,
            input_extensions: crate::media::INPUT_EXTENSIONS
                .iter()
                .map(|e| (*e).to_owned())
                .collect(),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_all_options() {
        let c = Cli::try_parse_from([
            "woice",
            "in.m4a",
            "-o",
            "out.mp3",
            "--format",
            "mp3",
            "--quality",
            "small",
            "--on-done",
            "stay",
            "-v",
        ])
        .unwrap();
        assert_eq!(c.input.as_deref(), Some(std::path::Path::new("in.m4a")));
        assert_eq!(c.output.as_deref(), Some(std::path::Path::new("out.mp3")));
        assert_eq!(c.format, Some(Format::Mp3));
        assert_eq!(c.quality, Some(Quality::Small));
        assert_eq!(c.on_done, Some(OnDone::Stay));
        assert!(c.verbose);
        for format in ["source", "mp3", "wav", "flac", "opus", "m4a"] {
            assert!(Cli::try_parse_from(["woice", "--format", format]).is_ok());
        }
        for quality in ["original", "high", "small"] {
            assert!(Cli::try_parse_from(["woice", "--quality", quality]).is_ok());
        }
        assert!(Cli::try_parse_from(["woice"]).unwrap().input.is_none());
    }
    #[test]
    fn usage_errors_exit_2() {
        for args in [
            vec!["woice", "--wat"],
            vec!["woice", "a.mp3", "b.mp3"],
            vec!["woice", "--format", "aiff"],
            vec!["woice", "--quality", "ultra"],
            vec!["woice", "--on-done", "later"],
        ] {
            let err = Cli::try_parse_from(&args).unwrap_err();
            assert_eq!(err.exit_code(), 2, "{args:?}");
        }
    }
    #[test]
    fn launch_options_serialize_effective_values() {
        let c = Cli::try_parse_from(["woice", "--on-done", "stay"]).unwrap();
        let effective = crate::config::resolve(&c, &Default::default()).unwrap();
        let json = serde_json::to_value(LaunchOptions::new(c, effective)).unwrap();
        assert_eq!(json["format"], "source");
        assert_eq!(json["quality"], "original");
        assert_eq!(json["onDone"], "stay");
        assert_eq!(json["declick"], true);
        assert_eq!(json["fadeCurve"], "s-curve");
        assert_eq!(json["normalizeTarget"], "-16lufs");
        assert!(json["inputExtensions"]
            .as_array()
            .unwrap()
            .contains(&serde_json::json!("opus")));
    }
    #[test]
    fn completions_flag_accepts_zsh_only() {
        let c = Cli::try_parse_from(["woice", "--completions", "zsh"]).unwrap();
        assert_eq!(c.completions, Some(Shell::Zsh));
        let err = Cli::try_parse_from(["woice", "--completions", "fish"]).unwrap_err();
        assert_eq!(err.kind(), clap::error::ErrorKind::InvalidValue);
    }
    #[test]
    fn zsh_script_shape() {
        assert!(COMPLETION_ZSH.starts_with("#compdef woice"));
        assert!(COMPLETION_ZSH.contains("compdef _woice woice"));
    }
    #[test]
    fn zsh_script_mentions_every_flag_and_value() {
        use clap::CommandFactory;
        for arg in Cli::command().get_arguments() {
            if let Some(long) = arg.get_long() {
                let flag = format!("--{long}");
                assert!(COMPLETION_ZSH.contains(&flag), "_woice is missing {flag}");
            }
            if let Some(short) = arg.get_short() {
                let flag = format!("-{short}");
                assert!(COMPLETION_ZSH.contains(&flag), "_woice is missing {flag}");
            }
        }
        for v in Format::value_variants() {
            let name = v.to_possible_value().unwrap().get_name().to_owned();
            assert!(COMPLETION_ZSH.contains(&format!("{name}\\:")), "{name}");
        }
    }
    #[test]
    fn zsh_input_glob_matches_allowlist() {
        let glob = format!("*.(#i)({})(-.)", crate::media::INPUT_EXTENSIONS.join("|"));
        assert!(
            COMPLETION_ZSH.contains(&glob),
            "_woice input glob must be {glob}"
        );
    }
}
