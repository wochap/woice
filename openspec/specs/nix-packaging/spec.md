# nix-packaging Specification

## Purpose
Covers flake, dev shell, package, desktop entry, icons, completions.

## Requirements

### Requirement: Flake outputs
The repository SHALL provide a `flake.nix` with a single pinned `nixpkgs` input for `x86_64-linux`, exposing `packages.default` (from `nix/package.nix`), `apps.default` (`bin/woice`) and `devShells.default`.

#### Scenario: Run from the flake
- **WHEN** the user runs `nix run .`
- **THEN** woice starts

### Requirement: Development shell
The dev shell SHALL provide cargo, rustc, clippy, rustfmt, cargo-tauri, nodejs, pkg-config, webkitgtk_4_1, gtk3, glib, librsvg, dbus, ffmpeg-full and GStreamer (core, base, good, bad, ugly, libav), and SHALL export `GDK_BACKEND=wayland` and `GST_PLUGIN_SYSTEM_PATH_1_0` covering those plugins.

#### Scenario: Dev run
- **WHEN** the user runs `nix develop` then `npm ci && npm run tauri -- dev -- song.mp3`
- **THEN** the app builds and opens the file with audible playback

### Requirement: Package build
`nix/package.nix` SHALL build with `rustPlatform.buildRustPackage`, `cargo-tauri.hook`, `fetchNpmDeps` and `npmHooks.npmConfigHook`, with `cargoRoot` and `buildAndTestSubdir` set to `src-tauri`, the version read from `src-tauri/Cargo.toml`, and `doCheck = false`. The binary SHALL be wrapped with `wrapGAppsHook3` setting `GDK_BACKEND=wayland`, prefixing `PATH` with ffmpeg-full and `GST_PLUGIN_SYSTEM_PATH_1_0` with the GStreamer plugins.

#### Scenario: Pure build
- **WHEN** the user runs `nix build`
- **THEN** `result/bin/woice` exists and finds ffmpeg and ffprobe at runtime without them on the user's PATH

### Requirement: Desktop integration
The package SHALL install `share/applications/woice.desktop` (`Exec=woice %f`, `Icon=woice`, `StartupWMClass=woice`, `Categories=AudioVideo;Audio;AudioVideoEditing;`, MimeType for the accepted audio formats), hicolor PNG icons 16–512 and `scalable/apps/woice.svg` built from design board 2a, and, unless `withShellCompletions = false`, the zsh completion from `src-tauri/completions/_woice`.

#### Scenario: Launcher entry
- **WHEN** the package is installed in a profile
- **THEN** woice appears in the app launcher with its icon and can open audio files from a file manager
