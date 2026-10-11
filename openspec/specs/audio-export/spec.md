# audio-export Specification

## Purpose
Covers formats, tiers, stream copy rules, ffmpeg pipeline, progress/cancel, validation, done dialog.

## Requirements

### Requirement: Output formats
The system SHALL export to Source, MP3 (libmp3lame CBR), WAV (PCM), FLAC, Opus (libopus in .opus) or M4A (AAC in .m4a). Source SHALL keep the input codec; for inputs whose container is a video container, Source SHALL write an audio-only container chosen by codec: aac→.m4a, opus→.opus, vorbis→.ogg, mp3→.mp3, flac→.flac, pcm→.wav, anything else→.mka. Channel count SHALL always match the source (more than two channels are kept for lossless outputs and downmixed to stereo for MP3).

#### Scenario: Source from a video
- **WHEN** the input is `talk.mp4` with AAC audio and the format is Source
- **THEN** the default output is `talk-trim.m4a` containing only audio

### Requirement: Quality tiers
The system SHALL offer Original, High and Small tiers, showing the resulting bitrate or depth under each tier. Lossy targets SHALL use: MP3 Original = nearest standard CBR ≥ source bitrate up to 320k, High 192k (128k for mono), Small 128k (64k mono); Opus Original 192k, High 128k (64k mono), Small 64k (32k mono); M4A AAC Original = source bitrate up to 256k, High 192k (128k mono), Small 128k (64k mono). Lossless targets SHALL use: Original = source bit depth and sample rate, High = 16-bit at source rate, Small = 16-bit with sample rate capped at 44.1 kHz. The sidebar SHALL show an estimated output size for the current tier.

#### Scenario: Lossless small tier
- **WHEN** the source is FLAC 24-bit 96 kHz and the user exports FLAC Small
- **THEN** the output is 16-bit 44.1 kHz FLAC

### Requirement: Stream copy versus re-encode
When the format is Source and no processing is on, the system SHALL stream-copy the kept range, starting at the packet at or before In, and SHALL show a green hint "Source → lossless stream copy". Otherwise it SHALL re-encode and show a peach hint naming the cause and the conversion, e.g. "Normalize + fades on → will re-encode · AAC → MP3 128 kbps"; for lossless sources it SHALL add "stays lossless" when the target is lossless. Re-encoded exports SHALL be sample-accurate to In and Out; lossless re-encodes SHALL introduce no loss beyond the requested tier.

#### Scenario: Copy is packet-accurate
- **WHEN** an MP3 is stream-copied from In 0:10.000
- **THEN** the output starts at the MP3 frame containing 0:10.000 and the actual start is reported in the done dialog

#### Scenario: WAV is sample-exact
- **WHEN** a WAV source is exported to WAV with In 0:01.000 and Out 0:02.000 at 48 kHz
- **THEN** the output contains exactly 48000 sample frames

### Requirement: Processing pipeline
Re-encoded exports SHALL apply, in order: trim to [In, Out], fades with the chosen curve, de-click micro-fades, then either gain or normalize. LUFS normalize SHALL run a measurement pass before the render pass. Tags (title, artist, album, etc.) SHALL be copied from the source where the target container supports them.

#### Scenario: Two-pass normalize
- **WHEN** normalize is −16 LUFS and the user exports
- **THEN** the export dialog shows "Measure loudness (pass 1 of 2)" before rendering and the output measures −16 ±0.5 LUFS integrated

### Requirement: Output path
The default output path SHALL be `<source dir>/<source stem>-trim.<ext>`, or the `-o` path when given. Changing the format SHALL update the extension of a default path. The sidebar SHALL show the path shortened to its last two segments with a folder button opening a native save dialog. Existing files SHALL be overwritten only after the save dialog confirmed them or when given with `-o`.

#### Scenario: Format change updates extension
- **WHEN** the default path is `…/ep117/ep117_coldopen-trim.m4a` and the user selects MP3
- **THEN** the path becomes `…/ep117/ep117_coldopen-trim.mp3`

### Requirement: Export execution
Enter or the sidebar Export button SHALL start the export and show a blocking dialog with the output name and format line, a progress bar and percentage, the step list (e.g. Decode / Apply gain, fades, de-click / Encode · write file, or Measure loudness pass 1 of 2 / Render + encode / Write tags & file) with done/active/pending states, elapsed and ETA, and Cancel (Esc). The system SHALL write to a temporary file in the target directory, validate it with ffprobe (audio stream present, duration within 50 ms of expected), then atomically rename it into place. Cancel or failure SHALL remove the temporary file and return to the editor with the error shown.

#### Scenario: Cancel export
- **WHEN** the user presses Esc during export
- **THEN** ffmpeg is terminated, no output file exists, and the editor is usable

### Requirement: Done dialog
With `--on-done stay`, a successful export SHALL show an "Exported" dialog with the full path, size and format line (including the measured loudness when normalized), the time taken, and actions Keep editing (Esc), Exit, and Reveal (Enter) which opens the containing folder with the file selected via the desktop file manager.

#### Scenario: Reveal
- **WHEN** the user presses Enter in the done dialog
- **THEN** the system file manager opens the output folder with the file selected
