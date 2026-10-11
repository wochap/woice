use std::process::Command;

fn binary() -> Command {
    let mut c = Command::new(env!("CARGO_BIN_EXE_woice"));
    // Never read the developer's real config or write their state dir.
    let dir = std::env::temp_dir().join("woice-cli-test");
    c.env("XDG_CONFIG_HOME", dir.join("config"))
        .env("XDG_STATE_HOME", dir.join("state"));
    c
}

#[test]
fn help_and_version_finish_before_gui() {
    let help = binary().arg("--help").output().unwrap();
    assert!(help.status.success());
    assert!(String::from_utf8_lossy(&help.stdout).contains("Trim one audio file"));
    let version = binary().arg("--version").output().unwrap();
    assert_eq!(
        String::from_utf8_lossy(&version.stdout).trim(),
        format!("woice {}", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn zsh_completions_print_without_wayland() {
    let output = binary()
        .env_remove("WAYLAND_DISPLAY")
        .args(["--completions", "zsh"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(0));
    assert!(String::from_utf8_lossy(&output.stdout).starts_with("#compdef woice"));
    assert!(output.stderr.is_empty());
}

#[test]
fn missing_wayland_exits_1_with_clean_stdout() {
    let output = binary()
        .env_remove("WAYLAND_DISPLAY")
        .arg("song.mp3")
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("woice requires Wayland"));
}

#[test]
fn usage_errors_exit_2_before_wayland_check() {
    for args in [
        vec!["--format", "aiff", "in.wav"],
        vec!["--quality", "ultra"],
        vec!["--on-done", "later"],
        vec!["-o", "out.mp3", "--format", "wav"],
    ] {
        let output = binary()
            .env_remove("WAYLAND_DISPLAY")
            .args(&args)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(2), "{args:?}");
        assert!(output.stdout.is_empty());
        assert!(!String::from_utf8_lossy(&output.stderr).is_empty());
    }
}
