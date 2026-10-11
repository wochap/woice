import {
  Copy,
  FolderOpen,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import { useState } from "react";
import * as actions from "@/app/actions";
import { tildify } from "@/model/exportSettings";
import { formatBytes } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useMedia } from "@/store/media";
import { useUi } from "@/store/ui";
import { Button } from "./ui/button";
import { Kbd } from "./ui/kbd";

/** Board 1e: drop zone. */
export function EmptyState() {
  const dragOver = useUi((s) => s.dragOver);
  const loading = useMedia((s) => s.status) === "loading";
  return (
    <div className="flex flex-1 p-[20px]">
      <div
        data-testid="drop-zone"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-[14px] rounded-[14px] border-[1.5px] border-dashed text-center transition-colors",
          dragOver ? "border-lavender bg-sel-wash" : "border-surface2",
        )}
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 50% 42%, var(--sel-wash), transparent 60%)",
        }}
      >
        <div className="grid size-[64px] place-items-center rounded-[16px] border border-lavender text-lavender shadow-[0_0_28px_var(--sel-glow)]">
          <Waveform size={30} />
        </div>
        <div className="text-[20px] tracking-[-.01em]">
          {loading ? "Opening…" : "Drop an audio or video file"}
        </div>
        <div className="flex items-center gap-[8px] text-[13px] text-subtext1">
          or press <Kbd className="px-[6px] text-[11px]">Ctrl</Kbd>
          <Kbd className="px-[6px] text-[11px]">O</Kbd>to open one
        </div>
        <Button
          variant="primary"
          size="lg"
          className="mt-[4px] gap-[8px]"
          onClick={() => void actions.openDialogAndLoad()}
        >
          <FolderOpen size={14} />
          Open file…
        </Button>
        <div className="mt-[18px] max-w-[520px] font-mono text-[11px] leading-[1.7] font-normal text-overlay1">
          mp3 · wav · flac · ogg · opus · m4a · aac · aiff
          <br />
          audio track of mp4 · mkv · webm · mov
        </div>
      </div>
    </div>
  );
}

/** The monospace well text, also what Copy details copies. */
export function errorDetails(
  detail: string,
  path: string,
  size: number | null,
  home: string | null,
) {
  return `${detail}\n${tildify(path, home)}${size != null ? ` · ${formatBytes(size)}` : ""}`;
}

/** Board 1f: unreadable file, recoverable. */
export function ErrorState() {
  const failure = useMedia((s) => s.failure)!;
  const home = useMedia((s) => s.home);
  const [copied, setCopied] = useState(false);
  const details = errorDetails(
    failure.detail,
    failure.path,
    failure.size,
    home,
  );
  const copy = async () => {
    await navigator.clipboard.writeText(details);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex flex-1 p-[20px]">
      <div className="flex flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-surface1">
        <div
          role="alert"
          className="flex w-[460px] max-w-full flex-col gap-[12px] rounded-[14px] bg-mantle p-[20px] shadow-md"
        >
          <div className="flex items-center gap-[10px]">
            <WarningCircle size={20} className="text-red" />
            <span className="text-[17px]">{failure.title}</span>
          </div>
          <p className="m-0 text-[13px] leading-[1.5] text-pretty text-subtext1">
            {failure.reason}
          </p>
          <div
            data-testid="error-details"
            className="rounded-[8px] bg-crust px-[10px] py-[8px] font-mono text-[11px] leading-[1.6] font-normal break-all whitespace-pre-wrap text-subtext0 select-text"
          >
            {details}
          </div>
          <div className="mt-[4px] flex items-center gap-[8px]">
            <Button
              variant="primary"
              className="h-[32px] gap-[8px] px-[12px] text-[13px]"
              onClick={() => void actions.openDialogAndLoad()}
            >
              <FolderOpen size={14} />
              Open another…
              <span className="font-mono text-[10px] opacity-80">Ctrl O</span>
            </Button>
            <Button
              variant="ghost"
              className="h-[32px] gap-[6px] px-[10px] text-[13px]"
              onClick={() => void copy()}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy details"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
