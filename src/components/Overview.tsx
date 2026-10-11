import { useEffect, useRef, type PointerEvent as RPointerEvent } from "react";
import { drawOverview } from "@/canvas/draw";
import { prepare, schedule } from "@/canvas/scheduler";
import { colors, useTheme } from "@/lib/theme";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { useView } from "@/store/view";

const EDGE = 6;

/** Whole-file minimap with a draggable viewport (pan body, zoom edges, click to centre). */
export function Overview() {
  const strip = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const peaks = useMedia((s) => s.peaks)!;
  const peaksVersion = useMedia((s) => s.peaksVersion);
  const doc = useDocument((s) => s.doc)!;
  const start = useView((s) => s.start);
  const span = useView((s) => s.span);
  const duration = useView((s) => s.duration);
  const theme = useTheme((s) => s.version);
  const drag = useRef<{
    mode: "pan" | "left" | "right";
    x0: number;
    start: number;
    span: number;
  } | null>(null);
  const loading = !peaks.done;

  const draw = useRef(() => {});
  draw.current = () => {
    const p = prepare(canvas.current);
    if (p)
      drawOverview(p.g, p.w, p.h, peaks, doc.in, doc.out, loading, colors());
  };
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const ro = new ResizeObserver(() => schedule(() => draw.current()));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(
    () => schedule(() => draw.current()),
    [peaks, peaksVersion, doc.in, doc.out, loading, theme],
  );

  const secPerPx = () => duration / Math.max(1, strip.current!.clientWidth);
  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = strip.current!.getBoundingClientRect();
    const x = e.clientX - r.left;
    const vl = (start / duration) * r.width;
    const vr = ((start + span) / duration) * r.width;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (x >= vl - EDGE && x <= vl + EDGE && span < duration)
      drag.current = { mode: "left", x0: x, start, span };
    else if (x >= vr - EDGE && x <= vr + EDGE && span < duration)
      drag.current = { mode: "right", x0: x, start, span };
    else if (x > vl && x < vr)
      drag.current = { mode: "pan", x0: x, start, span };
    else {
      const t = (x / r.width) * duration;
      useView.getState().set({ start: t - span / 2, span });
      drag.current = { mode: "pan", x0: x, start: t - span / 2, span };
    }
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = strip.current!.getBoundingClientRect();
    const dt = (e.clientX - r.left - d.x0) * secPerPx();
    const v = useView.getState();
    if (d.mode === "pan") v.set({ start: d.start + dt, span: d.span });
    else if (d.mode === "left") {
      const end = d.start + d.span;
      const s = Math.min(d.start + dt, end - 1e-3);
      v.set({ start: s, span: end - s });
    } else v.set({ start: d.start, span: Math.max(1e-3, d.span + dt) });
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const vpL = (start / duration) * 100;
  const vpW = (span / duration) * 100;
  return (
    <div className="relative h-[52px] flex-none bg-mantle px-[12px] py-[8px]">
      <div className="rule-x absolute inset-x-0 top-0" />
      <div
        ref={strip}
        aria-label="Overview"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative h-[36px] cursor-pointer touch-none overflow-hidden rounded-[6px] bg-base"
      >
        <canvas ref={canvas} className="absolute inset-0 block size-full" />
        {!loading && (
          <div
            data-testid="overview-viewport"
            className="absolute inset-y-0 flex min-w-[6px] cursor-grab items-center justify-between rounded-[6px] border border-ov-viewport bg-ov-fill px-[2px]"
            style={{ left: `${vpL}%`, width: `${vpW}%` }}
          >
            <span className="h-[14px] w-[2px] cursor-ew-resize rounded-[1px] bg-ov-viewport" />
            <span className="h-[14px] w-[2px] cursor-ew-resize rounded-[1px] bg-ov-viewport" />
          </div>
        )}
      </div>
    </div>
  );
}
