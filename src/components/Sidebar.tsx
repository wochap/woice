import {
  ArrowsClockwise,
  Export,
  FolderSimple,
  Lightning,
  X,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import * as actions from "@/app/actions";
import { toDb } from "@/lib/peaks";
import { formatBytes, formatTime, parseTime } from "@/lib/time";
import type { FadeCurve, NormalizeTarget, Quality } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GAIN_MAX, GAIN_MIN, withGain } from "@/model/document";
import {
  FORMATS,
  QUALITIES,
  estimateKbps,
  exportHint,
  isProcessing,
  resolveTarget,
  shortPath,
  tierNote,
  tierSublabel,
} from "@/model/exportSettings";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { COMPACT_BELOW, useUi } from "@/store/ui";
import { Button, IconButton } from "./ui/button";
import { SteppedField, type Steps } from "./ui/field";
import { Kbd } from "./ui/kbd";
import { Segmented } from "./ui/segmented";
import { Slider } from "./ui/slider";
import { Toggle } from "./ui/toggle";

const TIME_STEPS: Steps = { base: 0.1, fine: 0.01, coarse: 1 };
const MS_STEPS: Steps = { base: 100, fine: 10, coarse: 1000 };
const Rule = () => <div className="rule-x mx-[14px]" />;
const parseMs = (t: string) =>
  /^\s*\d+(\.\d*)?\s*$/.test(t) ? Math.round(parseFloat(t)) : null;
const fmtMs = (v: number) => String(Math.round(v));

function SelectionSection() {
  const doc = useDocument((s) => s.doc)!;
  const duration = useMedia((s) => s.info!.duration);
  const focus = useUi((s) => s.focus);
  const nudge = (edge: "in" | "out", d: number) =>
    void actions.commitHandle(
      edge,
      useDocument.getState().doc![edge] + d,
      `nudge:${edge}`,
    );
  return (
    <section
      aria-label="Selection"
      className="flex flex-col gap-[5px] px-[14px] py-[8px]"
    >
      <span className="section-head mb-[2px]">Selection</span>
      <SteppedField
        label="In"
        value={doc.in}
        format={formatTime}
        parse={parseTime}
        steps={TIME_STEPS}
        highlight={focus === "in"}
        onCommit={(v) => void actions.commitHandle("in", v)}
        onStep={(d) => nudge("in", d)}
      />
      <SteppedField
        label="Out"
        value={doc.out}
        format={formatTime}
        parse={parseTime}
        steps={TIME_STEPS}
        highlight={focus === "out"}
        onCommit={(v) => void actions.commitHandle("out", v)}
        onStep={(d) => nudge("out", d)}
      />
      <SteppedField
        label="Duration"
        value={doc.out - doc.in}
        format={formatTime}
        parse={parseTime}
        steps={TIME_STEPS}
        onCommit={(v) =>
          void actions.commitHandle("out", Math.min(duration, doc.in + v))
        }
        onStep={(d) => nudge("out", d)}
      />
    </section>
  );
}

const CURVE_PATH: Record<FadeCurve, string> = {
  linear: "M1 9L13 1",
  exp: "M1 9C8 9 11 6.5 13 1",
  "s-curve": "M1 9C6.5 9 7.5 1 13 1",
};
const CURVES: { value: FadeCurve; name: string }[] = [
  { value: "linear", name: "Linear" },
  { value: "exp", name: "Exp" },
  { value: "s-curve", name: "S-curve" },
];

function FadesSection() {
  const doc = useDocument((s) => s.doc)!;
  return (
    <section
      aria-label="Fades"
      className="flex flex-col gap-[5px] px-[14px] py-[8px]"
    >
      <span className="section-head mb-[2px]">Fades</span>
      <SteppedField
        label="Fade in"
        value={doc.fadeIn}
        format={fmtMs}
        parse={parseMs}
        steps={MS_STEPS}
        unit="ms"
        onCommit={(v) => actions.setFadeIn(v)}
        onStep={(d) =>
          actions.setFadeIn(useDocument.getState().doc!.fadeIn + d)
        }
      />
      <SteppedField
        label="Fade out"
        value={doc.fadeOut}
        format={fmtMs}
        parse={parseMs}
        steps={MS_STEPS}
        unit="ms"
        onCommit={(v) => actions.setFadeOut(v)}
        onStep={(d) =>
          actions.setFadeOut(useDocument.getState().doc!.fadeOut + d)
        }
      />
      <Segmented
        label="Fade curve"
        value={doc.fadeCurve}
        onChange={(fadeCurve) =>
          useDocument.getState().edit((d) => ({ ...d, fadeCurve }))
        }
        options={CURVES.map((c) => ({
          value: c.value,
          name: c.name,
          label: (
            <>
              <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
                <path
                  d={CURVE_PATH[c.value]}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              {c.name}
            </>
          ),
        }))}
      />
    </section>
  );
}

const TARGETS: { value: NormalizeTarget; label: string }[] = [
  { value: "-16lufs", label: "−16 LUFS" },
  { value: "-14lufs", label: "−14 LUFS" },
  { value: "-1dbfs", label: "−1 dBFS" },
];
const SEGMENTS = 28;
const signed = (v: number, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(digits)}`;

/** Post-gain peak of the kept range in dBFS, or `null` until peaks cover it. */
export function postGainPeak(
  peakLinear: number,
  gainDb: number,
  normalize: NormalizeTarget | null,
): number | null {
  if (peakLinear <= 0) return null;
  if (normalize === "-1dbfs") return -1;
  return toDb(peakLinear) + (normalize ? 0 : gainDb);
}
/** Meter segment colours from −36 to 0 dBFS; unlit segments are `null`. */
export function meterSegments(
  peakDb: number | null,
): ("green" | "yellow" | "red" | null)[] {
  return Array.from({ length: SEGMENTS }, (_, i) => {
    const db = -36 + (i + 1) * (36 / SEGMENTS);
    if (peakDb == null || db > peakDb + 0.6) return null;
    return db > -3 ? "red" : db > -12 ? "yellow" : "green";
  });
}

function LevelSection() {
  const doc = useDocument((s) => s.doc)!;
  const peaks = useMedia((s) => s.peaks);
  const version = useMedia((s) => s.peaksVersion);
  const raw = useMemo(
    () => peaks?.peak(doc.in, doc.out) ?? 0,
    [peaks, version, doc.in, doc.out],
  );
  const pk = postGainPeak(
    raw,
    doc.gainDb,
    doc.normalize ? doc.normalizeTarget : null,
  );
  const clip = pk != null && pk > 0;
  const seg = meterSegments(pk);
  const colorOf = {
    green: "bg-green",
    yellow: "bg-yellow",
    red: "bg-red",
  } as const;
  return (
    <section
      aria-label="Level"
      className="flex flex-col gap-[6px] px-[14px] py-[8px]"
    >
      <div className="flex items-center justify-between">
        <span className="section-head">
          Level{" "}
          <span className="font-mono tracking-normal normal-case text-overlay1">
            −24…+12 dB
          </span>
        </span>
        <span
          className={cn("font-mono text-[12px]", doc.normalize && "opacity-45")}
        >
          Gain <span className="text-lavender">{signed(doc.gainDb)} dB</span>
        </span>
      </div>
      <Slider
        label="Gain"
        min={GAIN_MIN}
        max={GAIN_MAX}
        step={0.5}
        detent={0}
        value={doc.gainDb}
        disabled={doc.normalize}
        valueText={`${signed(doc.gainDb)} dB`}
        onChange={(v) => useDocument.getState().preview((d) => withGain(d, v))}
        onCommit={() => useDocument.getState().commit()}
      />
      <div className="flex items-center gap-[8px]">
        <div className="flex h-[5px] flex-1 gap-[1.5px]" aria-hidden>
          {seg.map((c, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-[1px]",
                c ? colorOf[c] : "bg-surface0",
              )}
            />
          ))}
        </div>
        <span
          className={cn(
            "font-mono text-[10px] whitespace-nowrap",
            clip ? "text-red" : "text-subtext0",
          )}
          aria-label="Peak"
        >
          {pk == null
            ? "pk —"
            : clip
              ? `pk ${signed(pk)} · CLIP`
              : `pk ${signed(pk)} dBFS`}
        </span>
      </div>
      <div className="mt-px flex items-center gap-[8px]">
        <Toggle
          label="Normalize"
          checked={doc.normalize}
          onChange={actions.toggleNormalize}
        />
        <span className="text-[12.5px]">Normalize</span>
        <div className="flex-1" />
        <Kbd>N</Kbd>
      </div>
      <Segmented
        label="Normalize target"
        mono
        dimmed={!doc.normalize}
        value={doc.normalizeTarget}
        options={TARGETS}
        onChange={(normalizeTarget) =>
          useDocument.getState().edit((d) => ({ ...d, normalizeTarget }))
        }
      />
    </section>
  );
}

function CleanCutsSection() {
  const declick = useDocument((s) => s.doc!.declick);
  return (
    <section
      aria-label="Clean cuts"
      className="flex flex-col gap-[4px] px-[14px] py-[8px]"
    >
      <div className="flex items-center gap-[8px]">
        <Toggle
          label="Auto de-click"
          checked={declick}
          onChange={(v) => void actions.setDeclick(v)}
        />
        <span className="text-[12.5px]">Auto de-click</span>
        <div className="flex-1" />
        <span className="section-head">Clean cuts</span>
      </div>
      <span className="text-[11.5px] leading-[1.4] font-normal text-subtext0">
        Snaps In/Out to the nearest zero crossing and adds a 5 ms micro-fade.
      </span>
    </section>
  );
}

function ExportSection() {
  const doc = useDocument((s) => s.doc)!;
  const info = useMedia((s) => s.info)!;
  const exportError = useUi((s) => s.exportError);
  const proc = {
    fadeInMs: doc.fadeIn,
    fadeOutMs: doc.fadeOut,
    gainDb: doc.gainDb,
    normalize: doc.normalize,
    declick: doc.declick,
  };
  const target = resolveTarget(
    doc.format,
    doc.quality,
    isProcessing(proc),
    info,
  );
  const hint = exportHint(doc.format, doc.quality, proc, info);
  const bytes = (estimateKbps(target, info) * 1000 * (doc.out - doc.in)) / 8;
  const pathError = actions.outputError();
  return (
    <section
      aria-label="Export"
      className="flex flex-col gap-[6px] px-[14px] pt-[8px] pb-[6px]"
    >
      <span className="section-head">Export</span>
      <Segmented
        label="Format"
        value={doc.format}
        options={FORMATS}
        onChange={actions.setFormat}
      />
      <Segmented<Quality>
        label="Quality"
        value={doc.quality}
        onChange={(quality) =>
          useDocument.getState().edit((d) => ({ ...d, quality }))
        }
        options={QUALITIES.map((q) => ({
          ...q,
          sub: target.streamCopy
            ? "copy"
            : tierSublabel(doc.format, q.value, info),
        }))}
        disabled={target.streamCopy}
      />
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-subtext1">Est. size</span>
        <span className="font-mono">
          ≈ {formatBytes(bytes)}{" "}
          <span className="text-[10.5px] text-subtext0">
            · {tierNote(target, info)}
          </span>
        </span>
      </div>
      <div
        className={cn(
          "flex h-[26px] items-center gap-[6px] rounded-[8px] border bg-surface0 pr-[4px] pl-[8px]",
          pathError ? "border-red" : "border-rule",
        )}
        title={doc.output}
      >
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10.5px] font-normal"
          aria-label="Output path"
        >
          {shortPath(doc.output)}
        </span>
        <IconButton
          small
          aria-label="Choose output file"
          className="size-[22px]"
          onClick={() => void actions.chooseOutput()}
        >
          <FolderSimple size={14} />
        </IconButton>
      </div>
      {pathError && <span className="text-[11px] text-red">{pathError}</span>}
      <div
        role="note"
        className={cn(
          "flex items-start gap-[8px] rounded-[8px] border px-[8px] py-[5px]",
          hint.tone === "copy" ? "border-green/50" : "border-peach/50",
        )}
      >
        {hint.tone === "copy" ? (
          <Lightning size={14} className="mt-px shrink-0 text-green" />
        ) : (
          <ArrowsClockwise size={14} className="mt-px shrink-0 text-peach" />
        )}
        <span className="flex flex-col text-[11.5px] leading-[1.35]">
          <span>{hint.text}</span>
          <span className="font-mono text-[10px] text-subtext0">
            {hint.sub}
          </span>
        </span>
      </div>
      {exportError && (
        <span role="alert" className="text-[11px] leading-[1.35] text-red">
          {exportError}
        </span>
      )}
    </section>
  );
}

/** Right panel (300 px) or, below 960 px, the 284 px "Trim & export" drawer. */
export function Sidebar() {
  const width = useUi((s) => s.windowWidth);
  const peaks = useMedia((s) => s.peaks);
  useMedia((s) => s.peaksVersion);
  const compact = width < COMPACT_BELOW;
  const loading = !!peaks && !peaks.done;
  return (
    <aside
      aria-label={compact ? "Trim & export" : "Sidebar"}
      className={cn(
        "flex flex-col bg-mantle",
        compact
          ? "absolute inset-y-0 right-0 z-[8] w-[284px] shadow-md"
          : "relative w-[300px] flex-none",
        !compact && loading && "opacity-45",
      )}
    >
      <div className="rule-y absolute inset-y-0 left-0" />
      {compact && (
        <div className="flex items-center justify-between pt-[10px] pr-[10px] pb-[4px] pl-[14px]">
          <span className="text-[13px]">Trim &amp; export</span>
          <IconButton
            small
            aria-label="Close drawer"
            onClick={() => useUi.setState({ drawer: false })}
          >
            <X size={14} />
          </IconButton>
        </div>
      )}
      <div
        className={cn(
          "relative min-h-0 flex-1",
          compact ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        <SelectionSection />
        <Rule />
        <FadesSection />
        <Rule />
        <LevelSection />
        <Rule />
        <CleanCutsSection />
        <Rule />
        <ExportSection />
        {compact && (
          <div className="pointer-events-none sticky bottom-0 -mt-[48px] h-[48px] bg-gradient-to-b from-transparent to-mantle" />
        )}
      </div>
      <div className="flex-none px-[14px] pt-[6px] pb-[10px]">
        <Button
          variant="primary"
          size="lg"
          className="w-full justify-between pr-[10px] pl-[12px] shadow-[0_0_16px_var(--sel-wash)]"
          disabled={!!actions.outputError()}
          onClick={() => void actions.runExport()}
        >
          <span className="flex items-center gap-[8px]">
            <Export size={14} />
            Export
          </span>
          <kbd className="rounded-[4px] border border-lavender px-[5px] py-[2px] font-mono text-[10px] text-lavender">
            Enter
          </kbd>
        </Button>
      </div>
    </aside>
  );
}
