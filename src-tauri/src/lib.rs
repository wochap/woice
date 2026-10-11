mod app;
mod cli;
mod config;
mod error;
mod export;
mod lifecycle;
mod logging;
mod media;
mod preview_server;
use clap::{CommandFactory, Parser};
use std::{os::unix::net::UnixStream, path::PathBuf};
use tauri::{Manager, RunEvent};
fn validate_wayland() -> Result<String, String> {
    std::env::set_var("GDK_BACKEND", "wayland");
    let display = std::env::var("WAYLAND_DISPLAY")
        .ok()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "WAYLAND_DISPLAY is not set; woice requires Wayland".to_string())?;
    let socket = if PathBuf::from(&display).is_absolute() {
        PathBuf::from(&display)
    } else {
        PathBuf::from(std::env::var("XDG_RUNTIME_DIR").map_err(|_| {
            "XDG_RUNTIME_DIR is not set; cannot locate the Wayland display".to_string()
        })?)
        .join(&display)
    };
    UnixStream::connect(&socket).map_err(|e| {
        format!(
            "Wayland display {} is unavailable ({e}); woice requires Wayland",
            socket.display()
        )
    })?;
    Ok(display)
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli = cli::Cli::parse();
    if let Some(shell) = cli.completions {
        print!("{}", shell.script());
        std::process::exit(0);
    }
    let config_path = config::path();
    let (file_config, config_error) = match config_path.as_deref().map(config::load_from) {
        Some(Err(e)) => (Default::default(), Some(e)),
        Some(Ok(c)) => (c, None),
        None => (Default::default(), None),
    };
    let effective = match config::resolve(&cli, &file_config) {
        Ok(v) => v,
        Err(e) => cli::Cli::command()
            .error(clap::error::ErrorKind::ArgumentConflict, e)
            .exit(),
    };
    let wayland_name = match validate_wayland() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("woice: {e}");
            std::process::exit(lifecycle::EXIT_FAILURE)
        }
    };
    let (log_paths, guard) = match logging::init(cli.verbose) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("woice: logging initialization failed: {e}");
            std::process::exit(lifecycle::EXIT_FAILURE)
        }
    };
    if let Some(e) = config_error {
        tracing::error!("{e}; using built-in defaults");
    }
    tracing::info!(
        wayland_display = %wayland_name,
        log = %log_paths.application.display(),
        format = ?effective.format,
        quality = ?effective.quality,
        on_done = ?effective.on_done,
        "starting native Wayland application"
    );
    let launch = cli::LaunchOptions::new(cli, effective);
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(app::LaunchState::new(launch))
        .manage(media::MediaState::default())
        .manage(export::ExportState::default())
        .manage(log_paths)
        .manage(app::LogGuard { _guard: guard })
        .setup(|app| {
            let server =
                preview_server::PreviewServer::start(app.handle().clone()).unwrap_or_else(|e| {
                    eprintln!("woice: preview server failed to start: {e}");
                    std::process::exit(lifecycle::EXIT_FAILURE)
                });
            if let Ok(mut base) = app.state::<media::MediaState>().media_base.lock() {
                *base = server.media_url().to_owned();
            }
            app.manage(server);
            // The window starts hidden so its background matches the system theme
            // before the first frame: no flash of the wrong flavour.
            if let Some(window) = app.get_webview_window("main") {
                let background = match window.theme() {
                    Ok(tauri::Theme::Light) => tauri::window::Color(0xef, 0xf1, 0xf5, 0xff),
                    _ => tauri::window::Color(0x1e, 0x1e, 0x2e, 0xff),
                };
                if let Err(e) = window.set_background_color(Some(background)) {
                    tracing::warn!("failed to set window background: {e}");
                }
                if let Err(e) = window.show() {
                    tracing::warn!("failed to show window: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::take_launch_options,
            app::exit_application,
            app::reveal_path,
            media::load_input,
            media::stream_peaks,
            media::read_samples,
            media::snap_zero_crossing,
            media::make_proxy,
            export::start_export,
            export::cancel_export,
        ])
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            eprintln!("woice: application initialization failed: {e}");
            std::process::exit(lifecycle::EXIT_FAILURE)
        });
    app.run(|handle, event| {
        if let RunEvent::ExitRequested { code, api, .. } = &event {
            // Closing the window (not `exit_application`) must still honour the exit contract.
            if code.is_none() {
                api.prevent_exit();
                let ok = handle
                    .state::<app::LaunchState>()
                    .succeeded
                    .load(std::sync::atomic::Ordering::SeqCst);
                handle.state::<preview_server::PreviewServer>().stop();
                media::cleanup(handle.state::<media::MediaState>().inner());
                handle.exit(if ok { 0 } else { lifecycle::EXIT_FAILURE });
                return;
            }
            handle.state::<preview_server::PreviewServer>().stop();
            media::cleanup(handle.state::<media::MediaState>().inner())
        }
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn missing_wayland_is_rejected() {
        let old = std::env::var_os("WAYLAND_DISPLAY");
        std::env::remove_var("WAYLAND_DISPLAY");
        assert!(validate_wayland().unwrap_err().contains("requires Wayland"));
        if let Some(v) = old {
            std::env::set_var("WAYLAND_DISPLAY", v)
        }
    }
}
