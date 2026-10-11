# keyboard-shortcuts Specification

## Purpose
Covers shortcut registry, KeyBar priorities, `?` reference.

## Requirements

### Requirement: Single shortcut registry
The system SHALL define every shortcut once in a registry with group, keys, long label, optional short KeyBar label and KeyBar priority (1–5), containing: Playback — Space play/pause (Play, 1), Shift+Space play selection (Play sel., 2), L loop selection (Loop, 3); Navigate — ←/→ nudge ±100 ms (Nudge, 2), Alt+←/→ ±10 ms, Shift+←/→ ±1 s, PgUp/PgDn ±10 s, Home/End file start/end, 0…9 jump to tenths; Trim — I set In (Set In, 1), O set Out (Set Out, 1), Tab cycle focus (Focus handle, 2); View — Ctrl+=/− zoom (Zoom, 3), Ctrl+0 fit (Fit, 4), Z zoom to selection (Zoom sel., 4), Ctrl+Wheel zoom at pointer; Edit — Ctrl+Z undo (Undo, 5), Ctrl+Shift+Z redo, N toggle normalize (Normalize, 5); Actions — Enter export (Export, 1), Esc cancel/close overlay, Ctrl+O open, ? shortcuts (Shortcuts, 1), Ctrl+Q quit. Both the KeyBar and the reference overlay SHALL render from this registry.

#### Scenario: One source of truth
- **WHEN** a shortcut's label changes in the registry
- **THEN** the KeyBar and the `?` overlay both show the new label

### Requirement: KeyBar priorities
The KeyBar SHALL show registry items with a short label whose priority is within the allowed maximum for the window width: ≥1360 px → 5, ≥1240 → 4, ≥1000 → 3, ≥760 → 2, else 1. "? Shortcuts" SHALL be pinned to the right and never drop. Items SHALL never be clipped mid-item.

#### Scenario: 1280 px
- **WHEN** the window is 1280 px wide
- **THEN** Undo and Normalize are hidden and all other priority ≤4 items show

### Requirement: KeyBar modes
In the empty and error states the KeyBar SHALL show Ctrl O Open, Ctrl Q Quit and ? Shortcuts. While a handle is focused it SHALL show an `IN HANDLE` / `OUT HANDLE` badge followed by ←/→ ±100 ms, Alt ±10 ms, Shift ±1 s, Home and End targets, Tab Next, Enter Confirm, Esc Revert.

#### Scenario: Handle mode
- **WHEN** the user tabs to the In handle
- **THEN** the KeyBar shows `IN HANDLE` and `End In → playhead`

### Requirement: Shortcut reference overlay
`?` SHALL open an 860 px modal over the scrim titled "Keyboard shortcuts" with the registry groups in three columns, kbd chips for keys, the note about handle focus and Shift+wheel, and close on Esc or `?`.

#### Scenario: Open and close
- **WHEN** the user presses `?` then Esc
- **THEN** the overlay opens with all groups and then closes
