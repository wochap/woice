use std::{
    io::{self, Write},
    path::Path,
};
/// Closing without an export, startup failures (no Wayland) and export failures.
pub const EXIT_FAILURE: i32 = 1;
/// Usage errors (invalid flags, conflicting `-o` extension and `--format`) exit
/// with clap's code.
#[cfg(test)]
pub const EXIT_USAGE: i32 = 2;
pub fn write_success(path: &Path) -> io::Result<()> {
    let mut out = io::stdout().lock();
    writeln!(out, "{}", path.display())?;
    out.flush()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exit_codes_are_distinct_and_nonzero() {
        assert_ne!(EXIT_FAILURE, EXIT_USAGE);
        assert!([EXIT_FAILURE, EXIT_USAGE].iter().all(|v| *v != 0))
    }
}
