# waveform-timeline Specification

## Purpose
Covers peak extraction and streaming, waveform rendering, ruler, zoom/scroll, sample view, overview minimap.

## Requirements

### Requirement: Peak extraction and streaming
The backend SHALL decode the audio stream with ffmpeg to 32-bit float PCM through a pipe and build a peak pyramid holding min, max and RMS per bucket per channel at bucket sizes of 256, 1024, 4096 and 16384 samples. Peaks SHALL be emitted to the frontend in chunks as they are produced so the waveform paints left to right, with a progress percentage.

#### Scenario: Progressive painting
- **WHEN** a 3:42 file is loading
- **THEN** the stage shows painted waveform up to the decoded position, a lavender progress line with "Reading peaks · N% · t of total", and skeleton lanes after it

#### Scenario: Load superseded
- **WHEN** the user opens another file while peaks are still being read
- **THEN** the previous decode is cancelled and its late chunks are ignored

### Requirement: Waveform rendering
The stage SHALL draw the waveform on a canvas with one mirrored lane per channel for mono and stereo and a single merged lane for more than two channels. Each column SHALL show a peak layer at 38% opacity and an RMS core at 82% in the wave fill colour inside In/Out, and the dimmed wave colour under a dim wash outside. Columns whose peak is at or above −0.04 dBFS SHALL get 3 px clip caps in the clip colour. The canvas SHALL render at device pixel ratio.

#### Scenario: Clipped music
- **WHEN** a section of the track reaches full scale
- **THEN** red caps mark those columns at the top and bottom of each lane

#### Scenario: Outside the selection
- **WHEN** In is at 0:06.400
- **THEN** the waveform left of 0:06.400 is drawn in the dimmed colour under the dim wash

### Requirement: Ruler
A 24 px ruler above the stage SHALL show major ticks with labels and four minor ticks between them, choosing the step from 1 ms to 2 min so that majors are at least 86 px apart. Labels SHALL use m:ss when the step is ≥1 s, m:ss.d when ≥100 ms, else m:ss.mmm. The kept range SHALL be marked by a 2 px accent band at the bottom of the ruler. Clicking or dragging on the ruler SHALL move the playhead.

#### Scenario: Deep zoom labels
- **WHEN** the visible window is 200 ms
- **THEN** ruler labels show milliseconds, e.g. `0:06.350`

### Requirement: Zoom and scroll
The timeline SHALL support horizontal zoom from Fit (whole file) to a maximum of 2 pixels per sample. Ctrl+wheel and pinch SHALL zoom around the pointer; wheel and Shift+wheel SHALL scroll horizontally; Ctrl+= / Ctrl+− SHALL zoom around the playhead; Ctrl+0 SHALL fit; Z SHALL zoom so the selection fills the stage with 5% margin. The transport SHALL show the zoom factor (e.g. `Fit`, `12.4×`, `1 238×`) and the visible span (e.g. `200 ms window`). Zoom state SHALL NOT be part of the document.

#### Scenario: Zoom at pointer
- **WHEN** the pointer is over 1:30 and the user Ctrl+scrolls up
- **THEN** the view zooms in and 1:30 stays under the pointer

### Requirement: Sample view
When the visible window holds fewer samples than the 256-sample pyramid level can resolve per pixel, the stage SHALL fetch raw samples for the visible window from the backend and draw each channel as a continuous line with a 13% fill to the centre line, using the same inside/outside colouring.

#### Scenario: Wave cycles visible
- **WHEN** the user zooms to a 200 ms window
- **THEN** individual wave cycles are drawn as a line instead of bars

### Requirement: Overview minimap
Below the stage a 36 px overview strip SHALL always show the whole file's waveform (channels merged) with the kept region in the wave colour and the rest dimmed, plus a viewport rectangle for the visible window. Dragging the rectangle body SHALL pan; dragging its edges SHALL change zoom; clicking outside it SHALL centre the view at that point.

#### Scenario: Pan from overview
- **WHEN** the user drags the viewport rectangle to the right
- **THEN** the stage scrolls by the same amount of time

### Requirement: Theme-aware redraw
All canvases SHALL read their colours from CSS custom properties and SHALL redraw when the system colour scheme changes, when the window resizes, and after fonts load.

#### Scenario: Live theme switch
- **WHEN** the OS switches from dark to light while a file is open
- **THEN** the waveform, ruler and overview redraw in Latte colours without reloading
