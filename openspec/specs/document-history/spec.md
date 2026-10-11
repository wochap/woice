# document-history Specification

## Purpose
Covers document model and undo/redo.

## Requirements

### Requirement: Document model
The editable document SHALL consist of In, Out, fade-in, fade-out, fade curve, gain, normalize target, declick and export settings (format, tier, output path). Zoom, scroll, playhead, playback state, loop toggle and monitor volume SHALL NOT be part of the document.

#### Scenario: Zoom is not undoable
- **WHEN** the user zooms in and then presses Ctrl+Z
- **THEN** the zoom stays and the last document change is undone

### Requirement: Undo and redo
The system SHALL keep a snapshot stack of the document with Ctrl+Z undo and Ctrl+Shift+Z redo, and header undo/redo buttons that are disabled when unavailable. One handle or fade drag, one slider drag, one toggle, one field commit or one keyboard nudge burst (consecutive nudges of the same target within 600 ms) SHALL each record exactly one step. A new edit after undo SHALL clear the redo stack. History SHALL be capped at 200 steps and cleared when a new file opens.

#### Scenario: Undo a drag
- **WHEN** the user drags Out from 3:42.180 to 3:38.115 and presses Ctrl+Z
- **THEN** Out returns to 3:42.180 in one step

#### Scenario: Nudge burst
- **WHEN** the user presses → five times quickly with In focused, then Ctrl+Z
- **THEN** In returns to its value before the first press

### Requirement: Shortcuts ignore text fields
Document shortcuts (I, O, N, Z, digits, Space, Ctrl+Z) SHALL NOT fire while a text field has focus, except Esc and Enter which commit or revert the field.

#### Scenario: Typing in a field
- **WHEN** the In field is focused and the user types `1`
- **THEN** the digit goes into the field and the playhead does not jump
