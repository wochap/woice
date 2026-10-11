# audio-loading-preview Specification

## Purpose
Covers accepted inputs, probing, error states, preview server, proxy fallback, playback controls.

## Requirements

### Requirement: Accepted inputs
The system SHALL accept mp3, wav, flac, ogg (vorbis/opus), opus, m4a/aac, aiff/aif files, and mp4, mkv, webm and mov containers that contain at least one audio stream. For containers with several audio streams the first audio stream SHALL be used; video streams SHALL be ignored.

#### Scenario: Audio from a video file
- **WHEN** the user opens `talk.mp4` containing H.264 video and AAC audio
- **THEN** the AAC stream is loaded and the header chips show `AAC-LC`, its sample rate, channel layout, bitrate and duration

#### Scenario: Video without audio
- **WHEN** the user opens an mp4 with no audio stream
- **THEN** the error state shows "No audio stream in <name>"

### Requirement: Open by CLI, dialog and drag-drop
The system SHALL load a file passed on the command line, chosen with Ctrl+O / the Open button (native file dialog filtered to the accepted extensions), or dropped onto the window. Opening a new file SHALL replace the current document and clear undo history.

#### Scenario: Drop a file
- **WHEN** the user drops `memo.opus` onto the window
- **THEN** `memo.opus` loads and the previous document is discarded

### Requirement: Probing and metadata
The system SHALL probe the input with ffprobe and show in the header the file name, its directory (home abbreviated to `~`), and chips for codec, sample rate (kHz), channel layout (mono/stereo/N ch), bit depth for lossless sources, bitrate and duration (m:ss.mmm). Metadata SHALL be visible before waveform peaks finish loading.

#### Scenario: Metadata before peaks
- **WHEN** a 1-hour file is opened
- **THEN** the header chips are filled while the waveform is still painting

### Requirement: Unreadable file error state
When probing or decoding fails, the system SHALL show the error state with a plain-language reason, the raw tool message and file path/size in a monospace well, an "Open another…" primary action and a "Copy details" action that copies the well's text to the clipboard.

#### Scenario: Truncated m4a
- **WHEN** the user opens an m4a whose moov atom is missing
- **THEN** the error state shows "Can’t read <name>", the ffprobe message `moov atom not found`, and the header shows a red `unreadable` chip

### Requirement: Playback through the preview server
The system SHALL play audio with an HTML `<audio>` element whose source is a local HTTP server bound to 127.0.0.1 on a random port that serves the media with byte-range support. If the webview fails to decode the original file, the system SHALL transcode a FLAC proxy into the cache directory and serve it instead, transparently.

#### Scenario: Seek works
- **WHEN** the user clicks at 2:00 on the timeline during playback
- **THEN** playback continues from 2:00 within 200 ms

#### Scenario: Unsupported codec in webview
- **WHEN** the webview reports a media decode error for the original
- **THEN** a FLAC proxy is created and playback works without user action

### Requirement: Playback controls
The system SHALL provide play/pause (Space), play selection from In to Out (Shift+Space), loop selection toggle (L) which loops In→Out while playing, jump to In / jump to Out buttons, and a monitor volume slider that affects playback only and is labelled "Monitor". Playback SHALL stop at Out when playing the selection without loop.

#### Scenario: Loop selection
- **WHEN** loop is on and playback reaches Out
- **THEN** playback continues from In without a gap longer than 50 ms

#### Scenario: Monitor volume is not exported
- **WHEN** the monitor volume is at 20% and the user exports
- **THEN** the exported level is unaffected
