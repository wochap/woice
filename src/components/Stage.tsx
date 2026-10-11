import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type ReactNode,
} from "react";
import { CircleNotch, Magnet } from "@phosphor-icons/react";
import * as actions from "@/app/actions";
import { drawRuler, drawStage, laneCount } from "@/canvas/draw";
import { prepare, schedule } from "@/canvas/scheduler";
import { readSamples, type SampleWindow } from "@/lib/backend";
import { colors, useTheme } from "@/lib/theme";
import { deltaMs, fadeLabel, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { usePlayback } from "@/store/playback";
import { useUi } from "@/store/ui";
import { useView } from "@/store/view";
import { Kbd } from "./ui/kbd";

const RULER = 24;

// ---------- sample windows (sample view) ----------

const cache = new Map<string, SampleWindow>();
const CACHE_SIZE = 12;
/** Fetches raw samples for the visible window when it is finer than the 256-sample level. */
function useSampleWindow(
  active: boolean,
  loadId: number,
  start: number,
  span: number,
) {
  const [win, setWin] = useState<SampleWindow | null>(null);
  useEffect(() => {
    if (!active) return;
    // Quantise to the span so small scrolls reuse a cached window with margin.
    const a = Math.max(0, Math.floor(start / span) * span - span);
    const b = a + span * 3;
    const key = `${loadId}:${a.toFixed(6)}:${b.toFixed(6)}`;
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      setWin(hit);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      readSamples(loadId, a, b, 600_000)
        .then((w) => {
          cache.set(key, w);
          if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
          if (alive) setWin(w);
        })
        .catch(() => {});
    }, 60);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [active, loadId, start, span]);
  return active ? win : null;
}

// ---------- canvases ----------

function useTimeX() {
  const start = useView((s) => s.start);
  const span = useView((s) => s.span);
  const width = useView((s) => s.width);
  return {
    x: (t: number) => ((t - start) / span) * width,
    pct: (t: number) => ((t - start) / span) * 100,
    t: (x: number) => start + (x / Math.max(1, width)) * span,
  };
}

export function Stage() {
  const root = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLCanvasElement>(null);
  const info = useMedia((s) => s.info)!;
  const peaks = useMedia((s) => s.peaks)!;
  const peaksVersion = useMedia((s) => s.peaksVersion);
  const loadId = useMedia((s) => s.loadId);
  const doc = useDocument((s) => s.doc)!;
  const start = useView((s) => s.start);
  const span = useView((s) => s.span);
  const width = useView((s) => s.width);
  const theme = useTheme((s) => s.version);
  const loading = !peaks.done;
  const spp = (span * info.sampleRate) / Math.max(1, width);
  const sampleView = width > 0 && peaks.levelFor(spp) < 0 && !loading;
  const samples = useSampleWindow(sampleView, loadId, start, span);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      useView.getState().setWidth(el.clientWidth);
      setHeight(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    schedule(() => {
      const r = prepare(ruler.current);
      if (r) drawRuler(r.g, r.w, r.h, { start, span }, colors());
      const s = prepare(stage.current);
      if (s)
        drawStage(s.g, s.w, s.h, {
          view: { start, span },
          peaks,
          inT: doc.in,
          outT: doc.out,
          fadeIn: doc.fadeIn,
          fadeOut: doc.fadeOut,
          curve: doc.fadeCurve,
          loading,
          samples,
          colors: colors(),
        });
    });
  }, [
    start,
    span,
    width,
    height,
    peaks,
    peaksVersion,
    doc.in,
    doc.out,
    doc.fadeIn,
    doc.fadeOut,
    doc.fadeCurve,
    loading,
    samples,
    theme,
  ]);

  // Wheel: Ctrl (and touchpad pinch) zooms at the pointer, otherwise scrolls.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useView.getState();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey) {
        const t = v.start + ((e.clientX - r.left) / r.width) * v.span;
        v.zoomAt(t, Math.exp(-e.deltaY * 0.0025));
      } else {
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        v.scrollBy((d / r.width) * v.span);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const { pct, t: tAt } = useTimeX();
  const scrub = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const r = root.current!.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    actions.seek(tAt(e.clientX - r.left));
  };
  const scrubMove = (e: RPointerEvent<HTMLElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = root.current!.getBoundingClientRect();
    actions.seek(tAt(e.clientX - r.left));
  };

  const inP = pct(doc.in);
  const outP = pct(doc.out);
  const cl = (v: number) => Math.max(0, Math.min(100, v));
  return (
    <div
      ref={root}
      data-stage-root
      className="relative min-h-0 flex-1 overflow-hidden bg-base"
    >
      <div className="absolute inset-x-0 top-0 h-[24px] bg-mantle" />
      <canvas
        ref={ruler}
        aria-label="Ruler"
        onPointerDown={scrub}
        onPointerMove={scrubMove}
        className="absolute top-0 left-0 block h-[24px] w-full cursor-pointer"
      />
      <canvas
        ref={stage}
        aria-label="Waveform"
        onPointerDown={scrub}
        onPointerMove={scrubMove}
        className="absolute left-0 block w-full cursor-text"
        style={{ top: RULER, height: `calc(100% - ${RULER}px)` }}
      />
      {!loading && (
        <>
          <div
            className="pointer-events-none absolute bottom-0 left-0 bg-dim"
            style={{ top: RULER, width: `${cl(inP)}%` }}
          />
          <div
            className="pointer-events-none absolute right-0 bottom-0 bg-dim"
            style={{ top: RULER, left: `${cl(outP)}%` }}
          />
          <div
            className="pointer-events-none absolute bottom-0"
            style={{
              top: RULER,
              left: `${cl(inP)}%`,
              width: `${cl(outP) - cl(inP)}%`,
              background:
                "linear-gradient(to right,var(--sel-wash),transparent 40px,transparent calc(100% - 40px),var(--sel-wash))",
            }}
          />
          <div
            className="pointer-events-none absolute top-[22px] h-[2px] bg-lavender shadow-[0_0_8px_var(--sel-glow)]"
            style={{ left: `${cl(inP)}%`, width: `${cl(outP) - cl(inP)}%` }}
          />
          <FadeHandles />
          <Handle edge="in" />
          <Handle edge="out" />
          {sampleView && <SnapCallout channels={info.channels} />}
          <HandleTooltip />
        </>
      )}
      <Playhead hidden={loading} />
      {loading && <LoadingIndicator />}
    </div>
  );
}

// ---------- overlays ----------

function Playhead({ hidden }: { hidden: boolean }) {
  const playhead = usePlayback((s) => s.playhead);
  const { pct } = useTimeX();
  const p = pct(playhead);
  if (hidden || p < 0 || p > 100) return null;
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 z-[5] w-0"
      style={{ left: `${p}%` }}
    >
      <div className="absolute top-[10px] bottom-0 -left-px w-[2px] bg-playhead" />
      <div className="absolute top-[5px] -left-[5px] size-[10px] rotate-45 rounded-[2px] bg-playhead" />
    </div>
  );
}

function LoadingIndicator() {
  const peaks = useMedia((s) => s.peaks)!;
  useMedia((s) => s.peaksVersion);
  const { pct } = useTimeX();
  const p = Math.max(0, Math.min(100, pct(peaks.decoded)));
  const frac = Math.round((peaks.decoded / peaks.duration) * 100);
  return (
    <>
      <div
        className="absolute bottom-0 z-[4] -ml-px w-[2px] bg-lavender shadow-[0_0_14px_2px_var(--sel-glow)]"
        style={{ top: RULER, left: `${p}%` }}
      />
      <div
        role="status"
        className={cn(
          "absolute top-[32px] z-[5] flex items-center gap-[7px] rounded-[8px] bg-mantle px-[9px] py-[4px] font-mono text-[11px] whitespace-nowrap shadow-md",
          p > 70 && "-translate-x-full",
        )}
        style={{ left: `${p}%`, marginLeft: p > 70 ? -10 : 10 }}
      >
        <CircleNotch size={14} className="animate-spin text-lavender" />
        Reading peaks · {Math.min(100, frac)}% ·{" "}
        {formatTime(peaks.decoded).slice(0, -4)} of{" "}
        {formatTime(peaks.duration).slice(0, -4)}
      </div>
    </>
  );
}

function stageTime(el: HTMLElement, clientX: number) {
  const stage = el.closest<HTMLElement>("[data-stage-root]")!;
  const r = stage.getBoundingClientRect();
  const v = useView.getState();
  return v.start + ((clientX - r.left) / r.width) * v.span;
}

function Handle({ edge }: { edge: "in" | "out" }) {
  const doc = useDocument((s) => s.doc)!;
  const duration = useMedia((s) => s.info!.duration);
  const focus = useUi((s) => s.focus);
  const { pct } = useTimeX();
  const t = doc[edge];
  const p = pct(t);
  const grab = useRef(0);
  if (p < -2 || p > 102) return null;
  const isIn = edge === "in";
  const focused = focus === edge;
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = stageTime(e.currentTarget, e.clientX) - t;
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    actions.dragHandle(
      edge,
      stageTime(e.currentTarget, e.clientX) - grab.current,
    );
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    void actions.endHandleDrag(edge);
  };
  return (
    <div
      className="absolute bottom-0 z-[4] w-0"
      style={{ top: RULER, left: `${p}%` }}
    >
      <div className="pointer-events-none absolute top-0 bottom-0 -left-px w-[2px] bg-lavender shadow-[0_0_10px_1px_var(--sel-glow)]" />
      {focused && (
        <div className="pointer-events-none absolute top-1/2 -left-[10px] -mt-[28px] h-[56px] w-[20px] rounded-[10px] border-2 border-lavender shadow-[0_0_20px_2px_var(--sel-glow)]" />
      )}
      <div className="pointer-events-none absolute top-1/2 -left-[5px] -mt-[22px] flex h-[44px] w-[10px] flex-col items-center justify-center gap-[3px] rounded-[5px] bg-lavender shadow-[0_0_14px_var(--sel-glow)]">
        <span className="h-px w-[4px] bg-crust" />
        <span className="h-px w-[4px] bg-crust" />
        <span className="h-px w-[4px] bg-crust" />
      </div>
      <div
        className={cn(
          "pointer-events-none absolute bottom-[10px] flex items-center gap-[6px] border border-lavender bg-flag py-[3px] font-mono text-[10.5px] whitespace-nowrap",
          isIn
            ? "left-px rounded-r-[6px] border-l-0 pr-[8px] pl-[6px]"
            : "right-px rounded-l-[6px] border-r-0 pr-[6px] pl-[8px]",
        )}
      >
        {isIn && (
          <span className="font-semibold tracking-[.06em] text-lavender">
            IN
          </span>
        )}
        <span className="text-text">{formatTime(t)}</span>
        {!isIn && (
          <span className="font-semibold tracking-[.06em] text-lavender">
            OUT
          </span>
        )}
      </div>
      <div
        role="slider"
        aria-label={isIn ? "In" : "Out"}
        aria-valuemin={isIn ? 0 : doc.in}
        aria-valuemax={isIn ? doc.out : duration}
        aria-valuenow={t}
        aria-valuetext={formatTime(t)}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="absolute top-0 bottom-0 -left-[8px] w-[16px] cursor-ew-resize touch-none select-none"
      />
    </div>
  );
}

function FadeHandles() {
  const doc = useDocument((s) => s.doc)!;
  const { pct } = useTimeX();
  const ring = (edge: "in" | "out") => {
    const ms = edge === "in" ? doc.fadeIn : doc.fadeOut;
    const t = edge === "in" ? doc.in + ms / 1000 : doc.out - ms / 1000;
    const p = pct(t);
    if (p < 0 || p > 100) return null;
    const down = (e: RPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e: RPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const at = stageTime(e.currentTarget, e.clientX);
      const d = useDocument.getState().doc!;
      const v = (edge === "in" ? at - d.in : d.out - at) * 1000;
      (edge === "in" ? actions.setFadeIn : actions.setFadeOut)(v, false);
    };
    const up = (e: RPointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      useDocument.getState().commit();
    };
    return (
      <div
        key={edge}
        className="absolute top-[31px] z-[3] w-0"
        style={{ left: `${p}%` }}
      >
        <div
          role="slider"
          aria-label={edge === "in" ? "Fade in" : "Fade out"}
          aria-valuenow={ms}
          aria-valuetext={fadeLabel(ms)}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="absolute -top-[6px] -left-[6px] size-[12px] cursor-ew-resize touch-none rounded-full border-[1.5px] border-mauve bg-base shadow-[0_0_8px_var(--fade-shade)]"
        />
        {ms > 0 && (
          <span
            className={cn(
              "pointer-events-none absolute -top-[7px] font-mono text-[10px] whitespace-nowrap text-mauve",
              edge === "in" ? "left-[10px]" : "right-[10px]",
            )}
          >
            fade {fadeLabel(ms)}
          </span>
        )}
      </div>
    );
  };
  return (
    <>
      {ring("in")}
      {ring("out")}
    </>
  );
}

/** Board 1g: focused handle tooltip with its Home/End targets. */
function HandleTooltip() {
  const focus = useUi((s) => s.focus);
  const doc = useDocument((s) => s.doc)!;
  const playhead = usePlayback((s) => s.playhead);
  const duration = useMedia((s) => s.info!.duration);
  const { pct } = useTimeX();
  if (focus === "playhead") return null;
  const isIn = focus === "in";
  const p = pct(doc[focus]);
  if (p < 0 || p > 100) return null;
  const flip = p > 70;
  const row = (k: string, text: ReactNode) => (
    <span className="flex items-center gap-[6px]">
      <Kbd>{k}</Kbd>
      {text}
    </span>
  );
  return (
    <div
      role="tooltip"
      className={cn(
        "absolute z-[7] flex -translate-y-full flex-col gap-[7px] rounded-[8px] bg-mantle px-[11px] py-[9px] whitespace-nowrap shadow-md",
        flip && "-translate-x-full",
      )}
      style={{
        top: `calc(50% + ${RULER / 2}px - 22px)`,
        left: `${p}%`,
        margin: flip ? "-14px 0 0 -14px" : "-14px 0 0 14px",
      }}
    >
      <div className="flex items-baseline gap-[8px]">
        <span className="font-mono text-[10px] font-semibold tracking-[.08em] text-lavender">
          {isIn ? "IN" : "OUT"}
        </span>
        <span className="font-mono text-[16px]">{formatTime(doc[focus])}</span>
      </div>
      <div className="flex flex-col gap-[4px] text-[11px] text-subtext0">
        {isIn
          ? row("Home", `move In to start · ${formatTime(0)}`)
          : row("Home", `move Out to playhead · ${formatTime(playhead)}`)}
        {isIn
          ? row("End", `move In to playhead · ${formatTime(playhead)}`)
          : row("End", `move Out to end · ${formatTime(duration)}`)}
      </div>
    </div>
  );
}

/** Board 1c: zero-crossing snap marker and callout in the sample view. */
function SnapCallout({ channels }: { channels: number }) {
  const snap = useUi((s) => s.snap);
  const doc = useDocument((s) => s.doc)!;
  const { pct } = useTimeX();
  if (!snap || !doc.declick || Math.abs(doc[snap.edge] - snap.time) > 1e-6)
    return null;
  const at = pct(snap.time);
  const req = pct(snap.requested);
  if (at < 0 || at > 100) return null;
  const lanes = laneCount(channels);
  const centres = Array.from({ length: lanes }, (_, i) => (i + 0.5) / lanes);
  const isIn = snap.edge === "in";
  // Callout sits outside the kept range unless that would leave the stage.
  const left = isIn ? at > 30 : at > 70;
  return (
    <>
      <div
        className="pointer-events-none absolute bottom-0 z-[3] w-0 border-l border-dashed border-subtext0"
        style={{ top: RULER, left: `${req}%` }}
      />
      <div
        className="pointer-events-none absolute top-[28px] z-[3] -translate-x-1/2 rounded-[4px] bg-base px-[4px] py-px font-mono text-[10px] whitespace-nowrap text-subtext0"
        style={{ left: `${req}%` }}
      >
        pressed {isIn ? "I" : "O"} · {formatTime(snap.requested)}
      </div>
      {centres.map((c) => (
        <div
          key={c}
          className="pointer-events-none absolute z-[5] -mt-[6px] -ml-[6px] size-[12px] rounded-full border-2 border-zc bg-base shadow-[0_0_10px_color-mix(in_srgb,var(--zc)_55%,transparent)]"
          style={{
            left: `${at}%`,
            top: `calc(${RULER}px + (100% - ${RULER}px) * ${c})`,
          }}
        />
      ))}
      <div
        className={cn(
          "pointer-events-none absolute z-[6] flex -translate-y-1/2 items-center gap-[8px] rounded-[8px] border border-zc/60 bg-base px-[9px] py-[5px] whitespace-nowrap shadow-md",
          left && "-translate-x-full",
        )}
        style={{
          top: `calc(${RULER}px + (100% - ${RULER}px) * 0.5)`,
          left: `${at}%`,
          marginLeft: left ? -14 : 14,
        }}
      >
        <Magnet size={14} className="text-zc" />
        <span className="flex flex-col leading-[1.3]">
          <span className="text-[11.5px]">Snapped to zero crossing</span>
          <span className="font-mono text-[10.5px] text-subtext0">
            {deltaMs(snap.time - snap.requested)} ·{" "}
            {channels === 1
              ? "mono"
              : channels === 2
                ? "L+R"
                : `${channels} ch`}{" "}
            · then 5 ms micro-fade
          </span>
        </span>
      </div>
    </>
  );
}
