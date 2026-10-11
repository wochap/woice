# woice verification

Automated coverage runs with `npm test`, `npm run test:rust` (after `npm run fixtures`) and `nix build`. This file lists the fixture matrix and the manual Hyprland smoke checklist for what automation cannot see.

## Fixture matrix

`scripts/fixtures.sh` writes 10 s sine + noise files (220/330 Hz, −6 dBFS plus noise) into `src-tauri/tests/fixtures/`.

| Fixture | Codec / container | Used by |
|---|---|---|
| stereo.mp3, mono.mp3 | MP3 192k / 128k | probe, MP3 stream-copy duration + reported packet start |
| stereo-aac.m4a, mono-aac.m4a | AAC-LC | probe (chips) |
| mono.opus, stereo-opus.ogg | Opus | FLAC proxy cache |
| stereo-vorbis.ogg | Vorbis | playback spike |
| stereo-24.flac, mono.flac | FLAC 24/16-bit | probe bit depth |
| hires-24-96.flac | FLAC 24-bit 96 kHz | FLAC Small → 16-bit 44.1 kHz |
| surround-5.1.flac | FLAC 5.1 | merged lane, 6-channel probe |
| stereo-16.wav, stereo-24.wav, mono-16.wav | PCM | sample-exact WAV export (48000 frames), sample window read, −16 LUFS ±0.5 normalize, cancel leaves no file |
| stereo.aiff | PCM big-endian | playback spike, Source keeps .aiff |
| sine-mono.wav | 100 Hz sine | zero-crossing snap lands on a crossing |
| stereo-video.mp4 | H.264 + AAC | video container probe, Source → audio-only .m4a |
| video-only.mp4 | H.264 only | "No audio stream in …" |
| truncated.m4a | m4a cut in half | "Can’t read …" + `moov atom not found` |

Playback spike results (WebKitGTK + GStreamer, all codecs play and seek directly) are recorded in `openspec/changes/build-audio-trimmer/design.md`.

## Manual smoke checklist (Hyprland)

Run from `nix build` (`result/bin/woice`) unless noted. Compare each state with its board in `design/project/woice Boards.dc.html` in both Mocha and Latte.

### Startup and lifecycle
- [ ] `woice` with no input shows the drop zone (1e); KeyBar lists Open, Quit, Shortcuts.
- [ ] Light system theme at startup: the first frame is Latte, no dark flash (and the reverse).
- [ ] `woice song.flac`: chips appear immediately; peaks paint left to right with "Reading peaks · N%" and skeleton lanes (1d); sidebar dimmed until done.
- [ ] Close button and Ctrl+Q exit 1 with nothing on stdout.
- [ ] `p=$(woice in.m4a -o /tmp/out.mp3)`, press Enter: `$p` is the absolute path, exit 0.

### Editor (1a/1b)
- [ ] 1280×800 dark matches 1a: header 44, ruler 24, overview 52, transport 46, KeyBar 28, sidebar 300, fading rules.
- [ ] Switch the OS theme dark ↔ light with a file open: chrome, waveform, ruler and overview switch to Latte/Mocha without reloading.
- [ ] Drag In and Out: flags, fields, SEL duration and dim update live; one Ctrl+Z restores each drag.
- [ ] Clicking/dragging the stage and ruler scrubs; playback resumes from the new point within 200 ms.
- [ ] Space, Shift+Space (stops at Out), L loops In→Out without an audible gap; monitor volume affects playback only.
- [ ] Ctrl+wheel/pinch zooms at the pointer, wheel/Shift+wheel scrolls, Ctrl+= / Ctrl+− / Ctrl+0, Z frames the selection; the transport readout shows `12.4×` / `200 ms window`.
- [ ] Zoom to ~200 ms around In: sample lines with 13 % fill (1c); with de-click on, pressing I shows the green rings, dashed "pressed I" line and the snap callout.
- [ ] Overview: drag the viewport to pan, drag its edges to zoom, click outside to centre.
- [ ] Tab → In handle focused (1g): ring, tooltip with Home/End targets, KeyBar `IN HANDLE`; ←/→ move In; Esc reverts; Enter confirms and does not export.
- [ ] Fade handles: drag the mauve ring 4 s right of In → sidebar shows 4000 and the curve draws; Linear/Exp/S-curve change the drawn shape.
- [ ] Gain +3 dB on a hot file: meter turns red with `pk +… · CLIP`; N enables normalize and disables the gain slider.
- [ ] Clipped material shows red caps per column.
- [ ] `?` opens the reference (1i); Esc or ? closes it.

### Export (1h, 1h-d)
- [ ] Source with all processing off: green "Source → lossless stream copy" hint; output plays and the done dialog shows the packet start.
- [ ] MP3 High with normalize −16 LUFS: "Measure loudness (pass 1 of 2)" step, then Render; the output measures −16 ±0.5 LUFS.
- [ ] Esc during export: ffmpeg stops, no output or temp file remains, the editor stays usable.
- [ ] `--on-done stay`: done dialog with path, size, format line (+ LUFS), took; Enter reveals the file selected in the file manager; Esc keeps editing; Exit quits 0.
- [ ] Choosing the source file as output shows "Choose a different file than the source" and blocks Export.
- [ ] Format change rewrites the default `-trim` path extension.

### Errors and inputs
- [ ] Drop `truncated.m4a`: error state (1f) with "moov atom not found", red `unreadable` chip; Copy details copies the well text; Open another… works.
- [ ] Drop `video-only.mp4`: "No audio stream in video-only.mp4".
- [ ] Dropping a file while another is loading cancels the old peaks.
- [ ] Every fixture in the matrix loads and plays.

### Compact (1j)
- [ ] Resize to 640×520: drawer "Trim & export" over a scrim from the sidebar toggle, closes with × or Esc, scrolls with a bottom fade; chips reduce to the duration; icon Open; transport shows only Fit; KeyBar keeps priority 1 and "? Shortcuts".

### Packaging
- [ ] `nix profile install .`: woice appears in the launcher with its icon; opening an audio file from the file manager starts woice with it; `woice --<Tab>` completes in zsh.
