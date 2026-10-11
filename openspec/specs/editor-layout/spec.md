# editor-layout Specification

## Purpose
Covers header, stage, overview, transport, sidebar, KeyBar, empty state, compact drawer.

## Requirements

### Requirement: Window
The main window SHALL be 1280×800 by default with a minimum of 640×520, undecorated, hidden until the first frame is painted, with drag-and-drop enabled and app id `woice`.

#### Scenario: Minimum size
- **WHEN** the user resizes the window below 640×520
- **THEN** the compositor is told the minimum is 640×520

### Requirement: Layout regions
The window SHALL be laid out top to bottom as: a 44 px header on crust that is the drag region (controls opt out); a main row with the stage (24 px mantle ruler + waveform canvas on base) and a 300 px mantle sidebar on the right; a 52 px overview row (36 px strip); a 46 px transport row; and a 28 px KeyBar on crust. Rows SHALL be separated by 1 px rules that fade out over 48 px at each end. Measurements and colours SHALL match design boards 1a/1b and the tokens board 1l.

#### Scenario: Design parity
- **WHEN** a stereo file is loaded at 1280×800 in dark mode
- **THEN** the screen matches board 1a

### Requirement: Header
The header SHALL show the app mark, the file name over its directory (ellipsised, max 280 px), the metadata chips, and on the right undo, redo, a separator, an outlined Open button with `Ctrl O` hint, a sidebar toggle (active wash when open), and close (red hover, Ctrl+Q).

#### Scenario: Close button
- **WHEN** the user clicks the close button
- **THEN** the app quits with exit code 1 if nothing was exported

### Requirement: Transport row
The transport SHALL contain an outlined accent Play/Pause button, play selection, loop selection (active wash when on), a separator, jump to In, jump to Out, the playhead time (14 px mono) and `SEL <duration>`, then right-aligned the monitor volume control, a separator, zoom out, zoom readout (factor over span), zoom in, Fit and "Zoom to selection" buttons.

#### Scenario: Loop toggle state
- **WHEN** loop is on
- **THEN** the loop button shows the accent colour on the selection wash

### Requirement: Sidebar
The sidebar SHALL contain, separated by fading rules, the sections Selection, Fades, Level (with `−24…+12 dB` range in the heading), Clean cuts (Auto de-click toggle with one-line explainer) and Export (format segmented control, tier segmented control with bitrate sublabels, Est. size, output path, re-encode/stream-copy hint), and a full-width primary Export button with an `Enter` hint pinned at the bottom. Everything SHALL fit without scrolling at 1280×800. The sidebar SHALL be dimmed to 45% while peaks load. The sidebar toggle SHALL hide and show it.

#### Scenario: Hide sidebar
- **WHEN** the user clicks the sidebar toggle
- **THEN** the sidebar hides and the stage takes the full width; Enter still exports

### Requirement: Empty state
Without a file the main area SHALL show a 14 px-radius dashed drop zone with a soft accent radial wash, a 64 px outlined waveform icon with glow, "Drop an audio or video file", "or press Ctrl O to open one", an "Open file…" primary button and the supported formats list in muted mono. A file dragged over the window SHALL highlight the drop zone.

#### Scenario: Empty start
- **WHEN** woice starts without INPUT
- **THEN** board 1e is shown and the KeyBar lists Open, Quit and Shortcuts

### Requirement: Compact layout
Below 960 px width the sidebar SHALL become a 284 px drawer titled "Trim & export" over a scrim, opened with the sidebar toggle and closed with its × or Esc, scrolling with a bottom fade when it overflows; header chips SHALL reduce to the duration; the header Open button SHALL become an icon; the transport SHALL drop monitor volume and zoom controls in favour of a single Fit icon.

#### Scenario: 640×520
- **WHEN** the window is 640×520 and the drawer is open
- **THEN** the screen matches board 1j
