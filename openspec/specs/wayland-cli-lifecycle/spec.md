# wayland-cli-lifecycle Specification

## Purpose
Covers CLI arguments, config file precedence, Wayland enforcement, stdout/exit-code contract, logging.

## Requirements

### Requirement: Command-line interface
The system SHALL be started as `woice [INPUT] [-o PATH] [--format source|mp3|wav|flac|opus|m4a] [--quality original|high|small] [--on-done exit|stay] [-v] [--completions zsh]`. INPUT is optional; without it the app opens in the empty state.

#### Scenario: Open a file from the command line
- **WHEN** the user runs `woice ~/Music/song.flac`
- **THEN** the window opens with `song.flac` loading

#### Scenario: Start without input
- **WHEN** the user runs `woice` with no INPUT
- **THEN** the window opens in the empty state with the drop zone

#### Scenario: Invalid flag value
- **WHEN** the user runs `woice --format aiff in.wav`
- **THEN** the process prints a usage error to stderr and exits with code 2 without opening a window

#### Scenario: Print completions
- **WHEN** the user runs `woice --completions zsh`
- **THEN** the zsh completion script is printed to stdout and the process exits 0 without opening a window

### Requirement: Configuration precedence
The system SHALL read optional defaults from `$XDG_CONFIG_HOME/woice/config.toml` (keys `format`, `quality`, `on_done`, `declick`, `fade_curve`, `normalize_target`) and resolve each export setting with precedence built-in default < config file < extension of `--output` < explicit CLI flag.

#### Scenario: Output extension overrides config
- **WHEN** config sets `format = "flac"` and the user passes `-o out.mp3` without `--format`
- **THEN** the export format is MP3

#### Scenario: Flag overrides config
- **WHEN** config sets `format = "flac"` and the user passes `--format opus` without `-o`
- **THEN** the export format is Opus and the default output path ends in `.opus`

#### Scenario: Extension conflicts with flag
- **WHEN** the user passes `-o out.mp3 --format wav`
- **THEN** the process exits with code 2 and a usage error because the extension and format disagree

#### Scenario: Malformed config
- **WHEN** the config file is not valid TOML
- **THEN** the error is logged with the file path and built-in defaults are used

### Requirement: Wayland enforcement
The system SHALL run only on a native Wayland session and SHALL exit with code 1 and a clear stderr message when `WAYLAND_DISPLAY` is unset or its socket cannot be connected.

#### Scenario: No Wayland socket
- **WHEN** woice is started from a session without `WAYLAND_DISPLAY`
- **THEN** stderr says woice requires Wayland and the exit code is 1

### Requirement: Output and exit contract
On a successful export the system SHALL print only the absolute output path on stdout. With `--on-done exit` (default) the process SHALL exit 0 right after a successful export; with `stay` it SHALL show the done dialog. Closing the window without exporting SHALL exit with code 1. Logs SHALL go to stderr and `~/.local/state/woice/woice.log`, never stdout.

#### Scenario: Scripted use
- **WHEN** a script runs `p=$(woice in.m4a -o out.mp3)` and the user exports
- **THEN** `$p` contains exactly the absolute path of `out.mp3` and the exit code is 0

#### Scenario: User closes without exporting
- **WHEN** the user presses Ctrl+Q before exporting
- **THEN** nothing is printed on stdout and the exit code is 1

### Requirement: Source file is never modified
The system SHALL never write to the input file. Exporting to a path equal to the input path SHALL be refused with an inline error.

#### Scenario: Output equals input
- **WHEN** the output path resolves to the same file as the input
- **THEN** export is blocked and the output path field shows "Choose a different file than the source"
