import {
  CheckCircle,
  Circle,
  CircleNotch,
  FileAudio,
  FolderOpen,
  Keyboard,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import * as actions from "@/app/actions";
import { GROUPS, SHORTCUTS } from "@/lib/shortcuts";
import { formatBytes } from "@/lib/time";
import { tildify } from "@/model/exportSettings";
import { useMedia } from "@/store/media";
import { useUi } from "@/store/ui";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Kbd, Keys } from "./ui/kbd";
import { ProgressBar } from "./ui/progress";

/** `0:01.9`: minutes and tenths, as in the export dialog. */
export const clock = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** Board 1h: blocking export progress. */
export function ExportDialog() {
  const progress = useUi((s) => s.progress);
  const [started] = useState(() => performance.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const t = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(t);
  }, []);
  if (!progress) return null;
  const elapsed = (now - started) / 1000;
  const p = progress.percent;
  const eta = p > 1 ? (elapsed * (100 - p)) / p : null;
  return (
    <Dialog label="Exporting" width={440} className="gap-[14px]">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px]">Exporting</span>
        <span className="font-mono text-[14px] text-lavender">
          {Math.round(p)}%
        </span>
      </div>
      <div className="-mt-[8px] font-mono text-[11.5px] text-subtext1">
        {progress.outName}
        <br />
        <span className="text-subtext0">{progress.formatLine || " "}</span>
      </div>
      <ProgressBar value={p} label="Export progress" />
      <div className="flex flex-col gap-[6px]">
        {progress.steps.map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-[8px] text-[12.5px] ${s.state === "pending" ? "text-subtext0" : "text-text"}`}
          >
            {s.state === "done" ? (
              <CheckCircle size={14} className="text-green" />
            ) : s.state === "active" ? (
              <CircleNotch size={14} className="animate-spin text-lavender" />
            ) : (
              <Circle size={14} className="text-overlay0" />
            )}
            <span className="flex-1">{s.label}</span>
            <span className="font-mono text-[11px] text-subtext0">
              {s.note}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-[2px] flex items-center justify-between">
        <span className="font-mono text-[11px] text-subtext0">
          elapsed {clock(elapsed)}
          {eta != null && ` · eta ${clock(eta)}`}
        </span>
        <Button
          className="gap-[8px]"
          onClick={() => void actions.cancelExport()}
        >
          Cancel
          <Kbd className="py-[2px] shadow-none">Esc</Kbd>
        </Button>
      </div>
    </Dialog>
  );
}

/** Board 1h-d: export done (`--on-done stay`). */
export function DoneDialog() {
  const result = useUi((s) => s.result);
  const home = useMedia((s) => s.home);
  if (!result) return null;
  return (
    <Dialog label="Exported" width={440} className="gap-[12px]">
      <div className="flex items-center gap-[10px]">
        <CheckCircle size={20} className="text-green" />
        <span className="text-[17px]">Exported</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-subtext0">
          took {clock(result.tookMs / 1000)}
        </span>
      </div>
      <div className="flex items-center gap-[8px] rounded-[8px] border border-rule bg-mantle px-[10px] py-[8px]">
        <FileAudio size={14} className="shrink-0 text-subtext1" />
        <span className="font-mono text-[11px] leading-[1.5] font-normal break-all select-text">
          {tildify(result.path, home)}
        </span>
      </div>
      <div className="font-mono text-[11px] text-subtext0">
        {formatBytes(result.size)} · {result.formatLine}
        {result.actualStart != null &&
          ` · starts at ${result.actualStart.toFixed(3)} s (packet)`}
      </div>
      <div className="mt-[4px] flex items-center gap-[8px]">
        <Button
          variant="ghost"
          className="gap-[8px] px-[8px] text-subtext1"
          onClick={() => useUi.setState({ overlay: null, result: null })}
        >
          Keep editing
          <Kbd className="py-[2px] shadow-none">Esc</Kbd>
        </Button>
        <span className="flex-1" />
        <Button onClick={() => void actions.quit()}>Exit</Button>
        <Button
          variant="primary"
          className="gap-[8px] pr-[10px] pl-[12px]"
          onClick={() => void actions.revealResult()}
        >
          <FolderOpen size={14} />
          Reveal
          <kbd className="rounded-[4px] border border-lavender px-[5px] py-[2px] font-mono text-[10px] text-lavender">
            Enter
          </kbd>
        </Button>
      </div>
    </Dialog>
  );
}

/** Board 1i: the `?` reference, rendered from SHORTCUTS. */
export function ShortcutReference() {
  return (
    <Dialog
      label="Keyboard shortcuts"
      width={860}
      className="gap-[16px] px-[22px] pt-[20px] pb-[18px]"
    >
      <div className="flex items-center gap-[10px]">
        <Keyboard size={18} className="text-lavender" />
        <span className="text-[17px]">Keyboard shortcuts</span>
        <span className="flex-1" />
        <span className="flex items-center gap-[6px] text-[11px] text-subtext0">
          <Kbd>Esc</Kbd>close
        </span>
      </div>
      <div className="grid grid-cols-3 gap-x-[28px] gap-y-[16px]">
        {GROUPS.map((g) => (
          <div key={g} className="flex flex-col gap-[5px]">
            <span
              className="section-head mb-[2px] pb-[4px]"
              style={{
                background:
                  "linear-gradient(to right,var(--rule),transparent) no-repeat bottom/100% 1px",
              }}
            >
              {g}
            </span>
            {SHORTCUTS.filter((s) => s.group === g).map((s) => (
              <div
                key={s.label}
                className="flex min-h-[22px] items-center gap-[10px]"
              >
                <span className="flex min-w-[96px] flex-none">
                  <Keys keys={s.keys} />
                </span>
                <span className="text-[12px] text-text">{s.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="text-[11px] text-subtext0">
        When the In or Out handle is focused (Tab), the arrow keys move the
        handle instead of the playhead. Shift + wheel scrolls the timeline.
      </div>
    </Dialog>
  );
}
