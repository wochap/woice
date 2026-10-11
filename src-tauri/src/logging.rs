use directories::BaseDirs;
use std::{fs, path::PathBuf};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
pub struct LogPaths {
    pub application: PathBuf,
}
pub fn state_dir() -> Option<PathBuf> {
    std::env::var_os("XDG_STATE_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .or_else(|| BaseDirs::new().map(|b| b.home_dir().join(".local/state")))
        .map(|b| b.join("woice"))
}
/// Logs go to stderr and `$XDG_STATE_HOME/woice/woice.log`; stdout is reserved for the output path.
pub fn init(
    verbose: bool,
) -> Result<(LogPaths, tracing_appender::non_blocking::WorkerGuard), String> {
    let dir = state_dir().ok_or("cannot resolve state directory")?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let application = dir.join("woice.log");
    if verbose {
        std::env::set_var("WEBKIT_DEBUG", "Media")
    }
    let file = tracing_appender::rolling::never(&dir, "woice.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file);
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(filter(verbose)))
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .without_time()
                .with_target(false),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .try_init()
        .map_err(|e| e.to_string())?;
    Ok((LogPaths { application }, guard))
}
fn filter(verbose: bool) -> &'static str {
    if verbose {
        "woice=debug,woice_lib=debug"
    } else {
        "woice=info,woice_lib=info"
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn verbose_raises_the_level() {
        assert!(filter(false).contains("info"));
        assert!(filter(true).contains("debug"));
    }
}
