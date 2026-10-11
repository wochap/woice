# audio-processing Specification

## Purpose
Covers fades, gain, normalize, auto de-click semantics.

## Requirements

### Requirement: Fades
The document SHALL hold fade-in and fade-out lengths in milliseconds (default 0) and one fade curve: Linear, Exp or S-curve (default from config, else S-curve). Fade-in starts at In and fade-out ends at Out; their sum SHALL be clamped to the selection duration. Fades SHALL be editable in the sidebar (ms fields with steppers and a curve segmented control) and by dragging 12 px mauve ring handles at the top of the stage, labelled `fade 350 ms` / `fade 4.0 s`. The stage SHALL draw each fade as a 1.5 px mauve gain curve with the area above it shaded.

#### Scenario: Drag a fade
- **WHEN** the user drags the fade-in handle 4 s right of In
- **THEN** fade-in becomes 4000 ms, the sidebar shows 4000, and the curve is drawn from In to In+4 s

#### Scenario: Fades longer than the selection
- **WHEN** the selection is 2 s and the user sets fade-in 1.5 s and fade-out 1 s
- **THEN** fade-out is clamped to 500 ms

### Requirement: Fade curve mapping
Linear SHALL map to a linear gain ramp, Exp to an exponential ramp and S-curve to (1 − cos πu)/2, and the export SHALL apply the same curve that the stage draws.

#### Scenario: S-curve export
- **WHEN** fade curve is S-curve and the user exports
- **THEN** the exported fade follows a half-sine shape matching the drawn curve

### Requirement: Gain and peak meter
The document SHALL hold a gain in dB from −24 to +12 (default 0, 0.5 dB steps) set by a slider with a 0 dB detent mark and the current value shown as `Gain +3.0 dB`. A segmented peak meter SHALL show the post-gain peak of the kept range (green to −12 dBFS, yellow to −3, red above) with a `pk −1.6 dBFS` readout, turning to `CLIP` text in red when the post-gain peak exceeds 0 dBFS.

#### Scenario: Gain causes clipping
- **WHEN** the selection peaks at −1.6 dBFS and the user sets gain to +2 dB
- **THEN** the meter reaches red and reads `pk +0.4 · CLIP`

### Requirement: Normalize
The document SHALL hold normalize = off | −16 LUFS | −14 LUFS | −1 dBFS peak, toggled with the Normalize switch or N and targeted with a segmented control that is dimmed while off. While normalize is on the gain slider SHALL be disabled and ignored. LUFS targets SHALL use two-pass loudness normalization measured on the kept, faded range; the peak target SHALL scale so the kept range's true peak is −1 dBFS.

#### Scenario: Normalize disables gain
- **WHEN** gain is +3 dB and the user presses N
- **THEN** normalize turns on at the last target, the gain slider is disabled, and export ignores the +3 dB

### Requirement: Auto de-click
The document SHALL hold a declick flag (default from config, else on). While on, every committed In/Out position (drag release, I/O keys, field edit, nudge) SHALL snap to the nearest zero crossing of the summed channels within ±10 ms, and turning declick on SHALL snap the current In and Out as one undo step. On export a 5 ms fade SHALL be applied at each cut edge where no longer user fade exists. In the sample view the stage SHALL show the snapped point with a 12 px green ring per lane, a dashed line at the requested time labelled `pressed I · m:ss.mmm`, and a callout "Snapped to zero crossing · −2.1 ms · L+R · then 5 ms micro-fade".

#### Scenario: Turning de-click on moves handles
- **WHEN** In is 0:06.4021, declick is off, and the user turns it on
- **THEN** In moves to the nearest zero crossing and one undo step restores 0:06.4021

#### Scenario: No crossing nearby
- **WHEN** there is no zero crossing within ±10 ms of the requested time
- **THEN** the handle stays at the requested time and only the micro-fade applies

### Requirement: Processing forces re-encode
Any of fade-in > 0, fade-out > 0, gain ≠ 0, normalize on, or declick on SHALL count as processing, and processing SHALL disable stream copy.

#### Scenario: All processing off
- **WHEN** fades are 0, gain is 0, normalize and declick are off
- **THEN** stream copy is allowed for the Source format
