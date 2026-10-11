use crate::{cli::LaunchOptions, error::AppError, lifecycle, media::MediaState};
use std::{
    path::Path,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
pub struct LaunchState {
    pub options: Mutex<Option<LaunchOptions>>,
    pub succeeded: AtomicBool,
}
impl LaunchState {
    pub fn new(options: LaunchOptions) -> Self {
        Self {
            options: Mutex::new(Some(options)),
            succeeded: AtomicBool::new(false),
        }
    }
}
pub struct LogGuard {
    pub _guard: tracing_appender::non_blocking::WorkerGuard,
}
#[tauri::command]
pub fn take_launch_options(
    state: tauri::State<'_, LaunchState>,
) -> Result<LaunchOptions, AppError> {
    state
        .options
        .lock()
        .map_err(|_| AppError::Internal("launch state poisoned".into()))?
        .take()
        .ok_or_else(|| AppError::Internal("launch options were already consumed".into()))
}
/// Any successful export makes the session a success; otherwise closing exits 1.
fn exit_code(succeeded: bool) -> i32 {
    if succeeded {
        0
    } else {
        lifecycle::EXIT_FAILURE
    }
}
#[tauri::command]
pub fn exit_application(
    app: tauri::AppHandle,
    media: tauri::State<'_, MediaState>,
    launch: tauri::State<'_, LaunchState>,
) {
    crate::media::cleanup(&media);
    app.exit(exit_code(launch.succeeded.load(Ordering::SeqCst)))
}
fn file_uri(path: &Path) -> String {
    let mut out = String::from("file://");
    for b in path.to_string_lossy().bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
/// Shows the file selected in the desktop file manager (FileManager1 over D-Bus),
/// falling back to opening its folder with xdg-open.
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), AppError> {
    let path = Path::new(&path);
    let shown = Command::new("gdbus")
        .args([
            "call",
            "--session",
            "--dest",
            "org.freedesktop.FileManager1",
            "--object-path",
            "/org/freedesktop/FileManager1",
            "--method",
            "org.freedesktop.FileManager1.ShowItems",
            &format!("['{}']", file_uri(path)),
            "",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success());
    if shown {
        return Ok(());
    }
    let dir = path.parent().unwrap_or(Path::new("/"));
    Command::new("xdg-open")
        .arg(dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|e| AppError::Internal(format!("cannot open the file manager: {e}")))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exit_code_is_zero_only_after_success() {
        assert_eq!(exit_code(true), 0);
        assert_eq!(exit_code(false), lifecycle::EXIT_FAILURE);
    }
    #[test]
    fn file_uris_are_percent_encoded() {
        assert_eq!(
            file_uri(Path::new("/home/u/Low Tide/ep'1.mp3")),
            "file:///home/u/Low%20Tide/ep%271.mp3"
        );
    }
}
