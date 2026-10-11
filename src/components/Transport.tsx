import {
  ArrowLineLeft,
  ArrowLineRight,
  ArrowsInLineHorizontal,
  ArrowsOutLineHorizontal,
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Pause,
  Play,
  PlayCircle,
  Repeat,
  SpeakerHigh,
} from "@phosphor-icons/react";
import * as actions from "@/app/actions";
import { formatTime, spanLabel, zoomLabel } from "@/lib/time";
import { useDocument } from "@/store/document";
import { usePlayback } from "@/store/playback";
import { COMPACT_BELOW, useUi } from "@/store/ui";
import { useView } from "@/store/view";
import { Button, IconButton } from "./ui/button";
import { Slider } from "./ui/slider";

const Sep = ({ wide }: { wide?: boolean }) => (
  <span
    className={`h-[18px] w-px bg-surface1 ${wide ? "mx-[10px]" : "mx-[6px]"}`}
  />
);

export function Transport() {
  const playing = usePlayback((s) => s.playing);
  const playhead = usePlayback((s) => s.playhead);
  const loop = usePlayback((s) => s.loop);
  const volume = usePlayback((s) => s.volume);
  const doc = useDocument((s) => s.doc)!;
  const span = useView((s) => s.span);
  const duration = useView((s) => s.duration);
  const compact = useUi((s) => s.windowWidth) < COMPACT_BELOW;
  return (
    <div className="relative flex h-[46px] flex-none items-center gap-[2px] bg-mantle px-[10px]">
      <div className="rule-x absolute inset-x-0 top-0" />
      <button
        type="button"
        title={playing ? "Pause (Space)" : "Play (Space)"}
        aria-label={playing ? "Pause" : "Play"}
        onClick={actions.togglePlay}
        className="mr-[4px] grid h-[30px] w-[34px] place-items-center rounded-[8px] border border-lavender bg-transparent text-lavender hover:bg-lavender/12"
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <IconButton
        title="Play selection (Shift+Space)"
        aria-label="Play selection"
        onClick={actions.playSelection}
      >
        <PlayCircle size={18} />
      </IconButton>
      <IconButton
        title="Loop selection (L)"
        aria-label="Loop selection"
        active={loop}
        onClick={actions.toggleLoop}
      >
        <Repeat size={18} />
      </IconButton>
      <Sep />
      <IconButton
        title="Jump to In"
        aria-label="Jump to In"
        onClick={() => actions.seek(doc.in)}
      >
        <ArrowLineLeft size={18} />
      </IconButton>
      <IconButton
        title="Jump to Out"
        aria-label="Jump to Out"
        onClick={() => actions.seek(doc.out)}
      >
        <ArrowLineRight size={18} />
      </IconButton>
      <div className="ml-[12px] flex items-baseline gap-[10px] font-mono whitespace-nowrap">
        <span className="text-[14px]" aria-label="Playhead">
          {formatTime(playhead)}
        </span>
        <span className="text-[11px] text-subtext0">
          SEL{" "}
          <span className="text-lavender">{formatTime(doc.out - doc.in)}</span>
        </span>
      </div>
      <div className="flex-1" />
      {compact ? (
        <IconButton
          title="Fit (Ctrl+0)"
          aria-label="Fit"
          onClick={() => useView.getState().fit()}
        >
          <ArrowsOutLineHorizontal size={18} />
        </IconButton>
      ) : (
        <>
          <div
            className="flex items-center gap-[8px] text-subtext1"
            title="Monitor volume — playback only, not exported"
          >
            <SpeakerHigh size={18} />
            <Slider
              label="Monitor volume"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={actions.setVolume}
              tone="neutral"
              valueText={`${Math.round(volume * 100)}%`}
              className="w-[76px]"
            />
            <span className="text-[10.5px] text-subtext0">Monitor</span>
          </div>
          <Sep wide />
          <div className="flex items-center gap-[2px]">
            <IconButton
              small
              title="Zoom out (Ctrl+−)"
              aria-label="Zoom out"
              onClick={actions.zoomOut}
            >
              <MagnifyingGlassMinus size={18} />
            </IconButton>
            <span
              className="flex min-w-[74px] flex-col text-center font-mono text-[11.5px] leading-[1.15]"
              aria-label="Zoom"
            >
              <span>{zoomLabel(duration / span)}</span>
              <span className="text-[9.5px] text-subtext0">
                {spanLabel(span)}
              </span>
            </span>
            <IconButton
              small
              title="Zoom in (Ctrl+=)"
              aria-label="Zoom in"
              onClick={actions.zoomIn}
            >
              <MagnifyingGlassPlus size={18} />
            </IconButton>
            <Button
              size="sm"
              className="ml-[6px]"
              onClick={() => useView.getState().fit()}
            >
              Fit
            </Button>
            <Button
              size="sm"
              className="ml-[4px] gap-[6px]"
              onClick={actions.zoomToSelection}
            >
              <ArrowsInLineHorizontal size={14} />
              Zoom to selection
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
