# color-theme Specification

## Purpose
Covers Catppuccin Mocha/Latte tokens, live system theme following, theme-aware reveal.

## Requirements

### Requirement: Catppuccin flavours follow the system
The UI SHALL use Catppuccin Mocha when the system prefers a dark colour scheme and Catppuccin Latte when it prefers light, and SHALL switch live when the preference changes. There SHALL be no in-app theme toggle.

#### Scenario: Live switch
- **WHEN** the OS changes from dark to light while woice is open
- **THEN** all chrome and canvases change to Latte within one frame of the change event

### Requirement: Role tokens
All colours SHALL come from CSS custom properties defined per flavour exactly as in design/project/woice-theme.css and board 1l: base (stage, dialogs), mantle (sidebar, ruler, overview, transport, tooltips), crust (header, KeyBar), surface0/1/2 (controls, edges, drop-zone dash), overlay0 at 60% (rules), text/subtext1/subtext0/overlay1 (type), lavender (accent: handles, kept edges, focus, primary), mauve (fades), red (error, clip), peach (re-encode hint), yellow (meter caution), green (zero-crossing, done, stream copy), plus waveform roles wave-fill, wave-dim, wave-peak, sel-edge, sel-glow, sel-wash, flag-bg, fade-line, fade-shade, playhead, ov-viewport, ov-fill, zc, dim and scrim.

#### Scenario: No hard-coded colours
- **WHEN** the source is searched for hex colours outside the theme stylesheet and the native window background
- **THEN** none are found

### Requirement: Typography and shape
The UI SHALL use bundled Inter Variable at weight 500 for text and bundled JetBrains Mono for timecodes, chips, kbd and numbers; Phosphor regular icons at 18 px in toolbars and 14 px elsewhere; radii 4 (kbd), 6 (chips, flags), 8 (controls), 14 (dialogs, drop zone); outlined buttons; and the accent used as line and glow, never as a large fill.

#### Scenario: Offline fonts
- **WHEN** the app runs without network access
- **THEN** Inter and JetBrains Mono render correctly

### Requirement: Theme-aware reveal
The native window background SHALL be set to the active flavour's base (#1e1e2e Mocha, #eff1f5 Latte) before the window is shown, so no flash of the wrong colour appears at startup.

#### Scenario: Light startup
- **WHEN** woice starts while the OS is in light mode
- **THEN** the first visible frame is Latte with no dark flash
