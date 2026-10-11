# trim-interaction Specification

## Purpose
Covers In/Out handles, playhead, keyboard navigation, handle focus mode.

## Requirements

### Requirement: Single keep-range
The document SHALL hold exactly one kept range [In, Out] with 0 ≤ In < Out ≤ duration and Out − In ≥ 10 ms. A newly loaded file SHALL start with In = 0 and Out = duration.

#### Scenario: Default range
- **WHEN** a file finishes loading
- **THEN** In is 0:00.000 and Out equals the file duration

#### Scenario: Handles cannot cross
- **WHEN** the user drags In past Out
- **THEN** In stops 10 ms before Out

### Requirement: Handles
In and Out SHALL each be drawn as a 2 px accent line with a soft glow across the lanes, a 10×44 px grip centred vertically, a 16 px wide hit area over the full lane height, and a flag near the bottom showing `IN m:ss.mmm` / `m:ss.mmm OUT`. Handles SHALL be draggable with pointer capture, SHALL expose `role="slider"` with aria values, and SHALL not start text selection.

#### Scenario: Drag In
- **WHEN** the user drags the In grip to 0:02.740
- **THEN** the flag, the sidebar In field, the duration and the dimmed area update live and one undo step is recorded on release

### Requirement: Playhead
The playhead SHALL be a 2 px line in the text colour with a 10 px diamond head on the ruler. Clicking or dragging on the stage outside handles SHALL scrub the playhead. During playback the view SHALL auto-scroll to keep the playhead visible when zoomed in.

#### Scenario: Click to seek
- **WHEN** the user clicks the stage at 1:01.204
- **THEN** the playhead moves there and the transport reads `1:01.204`

### Requirement: Keyboard navigation
With no handle focused the keys SHALL move the playhead: ←/→ ±100 ms, Alt+←/→ ±10 ms, Shift+←/→ ±1 s, PgUp/PgDn ±10 s, Home/End to file start/end, 0–9 to that tenth of the duration. I SHALL set In and O SHALL set Out at the playhead (clamped to keep the range valid). Alt+arrow SHALL never trigger webview navigation.

#### Scenario: Set In with keyboard
- **WHEN** the playhead is at 0:06.400 and the user presses I
- **THEN** In becomes 0:06.400 (or the snapped value when de-click is on)

### Requirement: Handle focus mode
Tab SHALL cycle focus playhead → In → Out → playhead. While a handle is focused the navigation keys SHALL move that handle instead of the playhead; Home SHALL move In to file start (Out: to the playhead) and End SHALL move In to the playhead (Out: to file end); Enter SHALL confirm and return focus to the playhead; Esc SHALL revert the handle to its value when focus entered and return focus. A focused handle SHALL show a 2 px ring with stronger glow and a tooltip with the handle time and the Home/End targets, and the KeyBar SHALL switch to handle mode.

#### Scenario: Revert with Esc
- **WHEN** In is focused at 0:02.740, the user nudges it to 0:03.140 and presses Esc
- **THEN** In returns to 0:02.740 and no undo step is recorded

#### Scenario: Enter does not export in handle mode
- **WHEN** a handle is focused and the user presses Enter
- **THEN** the handle is confirmed and export does not start

### Requirement: Sidebar selection fields
The sidebar Selection section SHALL show In, Out and Duration as editable m:ss.mmm fields with −/+ steppers. Steppers and ↑/↓ inside a field SHALL nudge 100 ms, with Alt 10 ms and Shift 1 s. Editing Duration SHALL move Out. Invalid text SHALL revert on blur.

#### Scenario: Type a duration
- **WHEN** In is 0:02.740 and the user types `3:00.000` into Duration and presses Enter
- **THEN** Out becomes 3:02.740
