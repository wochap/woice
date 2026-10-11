# woice

A minimal, fast audio trimmer for Linux Wayland (Hyprland). Open one file, set In and Out on a waveform, optionally fade, adjust gain or normalize, and export. Sibling of [wodeo](../../wodeo) (video) and [woge](../woge) (images): same shell, keys, Catppuccin theme and CLI contract.

- Inputs: mp3, wav, flac, ogg (Vorbis/Opus), opus, m4a/aac, aiff, and the first audio stream of mp4/mkv/webm/mov.
- Waveform with per-channel lanes, peak + RMS, clip marks, progressive loading, zoom down to individual samples and an overview minimap.
- One keep range with In/Out handles, keyboard nudges and a handle focus mode (Tab).
- Fades (Linear, Exp, S-curve), gain −24…+12 dB with a post-gain peak meter, loudness/peak normalize, auto de-click (zero-crossing snap + 5 ms micro-fades).
- Export to Source (lossless stream copy when nothing is processed), MP3, WAV, FLAC, Opus or M4A at Original/High/Small quality; sample-accurate re-encodes, atomic writes, the output path on stdout.
- Undo/redo, a `?` shortcut reference, Catppuccin Mocha/Latte following the system theme live.

## Install

```sh
nix run github:wochap/woice -- song.mp3      # try it
nix profile install github:wochap/woice      # installs woice, its .desktop entry, icons and zsh completion
```

woice runs only on a native Wayland session. ffmpeg, ffprobe and the GStreamer plugins come with the package.

## Usage

```
woice [INPUT] [-o PATH] [--format source|mp3|wav|flac|opus|m4a]
      [--quality original|high|small] [--on-done exit|stay] [-v] [--completions zsh]
```

| Flag | Meaning |
|---|---|
| `INPUT` | File to open; without it woice starts on the drop zone |
| `-o, --output PATH` | Output path; its extension selects the format (`out.mp3` → MP3). Existing files are overwritten |
| `--format` | `source` keeps the codec (stream copy when no processing is on), or re-encode to `mp3`, `wav`, `flac`, `opus`, `m4a` |
| `--quality` | `original` matches the source bitrate/bit depth, `high` and `small` step down |
| `--on-done` | `exit` (default) quits right after a successful export; `stay` shows the done dialog |
| `-v, --verbose` | Debug logging |
| `--completions zsh` | Print the zsh completion script |

Contract for scripts: on success only the absolute output path is printed on stdout (`p=$(woice in.m4a -o out.mp3)`), exit code 0. Closing without exporting exits 1; usage errors (bad flags, `-o out.mp3 --format wav`) exit 2; no Wayland session exits 1. Logs go to stderr and `~/.local/state/woice/woice.log`. The source file is never written.

Default output: `<source dir>/<stem>-trim.<ext>`. For video inputs, Source writes an audio-only file chosen by codec (AAC → .m4a, Opus → .opus, Vorbis → .ogg, MP3, FLAC, PCM → .wav, else .mka).

Press `?` in the app for every shortcut. The essentials: Space play, Shift+Space play selection, I/O set In/Out at the playhead, ←/→ nudge (Alt fine, Shift coarse), Tab focus a handle, Ctrl+wheel zoom, Z zoom to selection, N normalize, Enter export, Ctrl+Z undo.

## Configuration

`$XDG_CONFIG_HOME/woice/config.toml` (usually `~/.config/woice/config.toml`), every key optional:

```toml
format = "source"            # source | mp3 | wav | flac | opus | m4a
quality = "original"         # original | high | small
on_done = "exit"             # exit | stay
declick = true               # auto de-click on by default
fade_curve = "s-curve"       # linear | exp | s-curve
normalize_target = "-16lufs" # -16lufs | -14lufs | -1dbfs
```

Precedence, later wins: built-in default < config file < `-o` extension < explicit flag. A malformed config is logged and ignored.

## Development

```sh
nix develop                      # or direnv: .envrc has `use flake`
npm ci
npm run fixtures                 # 10 s test files into src-tauri/tests/fixtures (gitignored)
npm run tauri -- dev -- -- song.mp3
npm run install-icon             # icon for `tauri dev` windows
```

Layout: `src-tauri/src` (Rust: `cli`, `config`, `lifecycle`, `logging`, `app`, `media` for probing/peaks/samples/zero crossings/proxies, `preview_server`, `export`), `src` (React: `store/` zustand stores, `model/` pure document/export logic, `canvas/` waveform drawing, `components/`, `lib/shortcuts.ts` registry).

## Checks

```sh
npm run build                    # tsc + vite
npm test                         # vitest
npm run test:rust                # cargo test (fixture-based tests skip without `npm run fixtures`)
nix build                        # packaged app in ./result
```

Manual checks on Hyprland: [docs/verification.md](docs/verification.md).
