import {
  ArrowClockwise,
  ArrowCounterClockwise,
  FolderOpen,
  SidebarSimple,
  X,
} from "@phosphor-icons/react";
import * as actions from "@/app/actions";
import { tildify } from "@/model/exportSettings";
import { canRedo, canUndo } from "@/store/history";
import { formatBytes, formatTime } from "@/lib/time";
import type { MediaInfo } from "@/lib/types";
import { useDocument } from "@/store/document";
import { useMedia } from "@/store/media";
import { COMPACT_BELOW, useUi } from "@/store/ui";
import { Button, IconButton } from "./ui/button";
import { Chip } from "./ui/chip";

/** Header chips: codec, rate, layout, depth (lossless), bitrate, duration. */
export function chips(info: MediaInfo): string[] {
  const out = [
    info.codec,
    `${+(info.sampleRate / 1000).toFixed(1)} kHz`,
    info.channelLayout,
  ];
  if (info.lossless && info.bitDepth) out.push(`${info.bitDepth}-bit`);
  if (info.bitrate) {
    const k = Math.round(info.bitrate / 1000);
    out.push(
      info.lossless
        ? `≈${k.toLocaleString("en-US").replace(/,/g, " ")} kbps`
        : `${k} kbps`,
    );
  }
  out.push(formatTime(info.duration));
  return out;
}

function Mark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      className="flex-none"
      aria-hidden
    >
      <path
        d="M5.5 3H3.5v10h2M10.5 3h2v10h-2"
        fill="none"
        stroke="var(--ctp-lavender)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <rect
        x="6.5"
        y="6"
        width="1"
        height="4"
        rx=".5"
        fill="var(--ctp-subtext1)"
      />
      <rect
        x="8"
        y="4.5"
        width="1"
        height="7"
        rx=".5"
        fill="var(--ctp-subtext1)"
      />
      <rect
        x="9.5"
        y="6.5"
        width="1"
        height="3"
        rx=".5"
        fill="var(--ctp-subtext1)"
      />
    </svg>
  );
}

export function Header() {
  const status = useMedia((s) => s.status);
  const info = useMedia((s) => s.info);
  const failure = useMedia((s) => s.failure);
  const home = useMedia((s) => s.home);
  const history = useDocument((s) => s.history);
  const width = useUi((s) => s.windowWidth);
  const sidebar = useUi((s) => s.sidebar);
  const drawer = useUi((s) => s.drawer);
  const compact = width < COMPACT_BELOW;
  const hasFile = !!info;
  let name = "woice";
  let dir = "No file open";
  let list: { l: string; error?: boolean }[] = [];
  if (info) {
    name = info.name;
    dir = tildify(info.dir, home);
    list = chips(info).map((l) => ({ l }));
  } else if (failure) {
    name = failure.path.split("/").pop() ?? failure.path;
    dir = tildify(failure.path.slice(0, failure.path.lastIndexOf("/")), home);
    list = [{ l: "unreadable", error: true }];
    if (failure.size != null) list.push({ l: formatBytes(failure.size) });
  } else if (status === "loading") dir = "Opening…";
  if (compact && list.length) list = list.slice(-1);
  const sideOpen = compact ? drawer : sidebar;
  return (
    <header
      data-tauri-drag-region
      className="relative flex h-[44px] flex-none items-center gap-[12px] bg-crust pr-[8px] pl-[12px]"
    >
      <Mark />
      <div
        data-tauri-drag-region
        className="flex max-w-[280px] min-w-0 flex-col leading-[1.25]"
      >
        <span data-tauri-drag-region className="truncate text-[13px]">
          {name}
        </span>
        <span
          data-tauri-drag-region
          className="truncate font-mono text-[10.5px] font-normal text-subtext0"
        >
          {dir}
        </span>
      </div>
      <div
        data-tauri-drag-region
        className="flex min-w-0 gap-[4px] overflow-hidden"
      >
        {list.map((c, i) => (
          <Chip key={i} tone={c.error ? "error" : "neutral"}>
            {c.l}
          </Chip>
        ))}
      </div>
      <div data-tauri-drag-region className="flex-1 self-stretch" />
      <div className="flex items-center gap-[2px]">
        {!compact && hasFile && (
          <>
            <IconButton
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              disabled={!canUndo(history)}
              onClick={() => useDocument.getState().undo()}
            >
              <ArrowCounterClockwise size={18} />
            </IconButton>
            <IconButton
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              disabled={!canRedo(history)}
              onClick={() => useDocument.getState().redo()}
            >
              <ArrowClockwise size={18} />
            </IconButton>
            <span className="mx-[6px] h-[18px] w-px bg-surface1" />
          </>
        )}
        {compact ? (
          <IconButton
            title="Open (Ctrl+O)"
            aria-label="Open"
            onClick={() => void actions.openDialogAndLoad()}
          >
            <FolderOpen size={18} />
          </IconButton>
        ) : (
          hasFile && (
            <Button
              variant="secondary"
              className="pr-[8px] pl-[10px]"
              onClick={() => void actions.openDialogAndLoad()}
            >
              <FolderOpen size={14} />
              Open
              <span className="font-mono text-[10px] text-subtext0">
                Ctrl O
              </span>
            </Button>
          )
        )}
        {hasFile && (
          <IconButton
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
            active={sideOpen}
            className="ml-[4px]"
            onClick={() =>
              useUi.setState(
                compact ? { drawer: !drawer } : { sidebar: !sidebar },
              )
            }
          >
            <SidebarSimple size={18} className="-scale-x-100" />
          </IconButton>
        )}
        <IconButton
          title="Close (Ctrl+Q)"
          aria-label="Close"
          danger
          className="ml-[2px]"
          onClick={() => void actions.quit()}
        >
          <X size={18} />
        </IconButton>
      </div>
      <div className="rule-x absolute inset-x-0 bottom-0" />
    </header>
  );
}
