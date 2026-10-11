import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { homeDir } from "@tauri-apps/api/path";
import * as actions from "@/app/actions";
import { onKeyDown } from "@/app/perform";
import { takeLaunchOptions } from "@/lib/backend";
import { useThemeFollower } from "@/lib/theme";
import type { ExportProgress } from "@/lib/types";
import { useMedia } from "@/store/media";
import { usePlayback } from "@/store/playback";
import { COMPACT_BELOW, useUi } from "@/store/ui";
import {
  DoneDialog,
  ExportDialog,
  ShortcutReference,
} from "@/components/Dialogs";
import { EmptyState, ErrorState } from "@/components/EmptyState";
import { Header } from "@/components/Header";
import { KeyBar } from "@/components/KeyBar";
import { Overview } from "@/components/Overview";
import { Sidebar } from "@/components/Sidebar";
import { Stage } from "@/components/Stage";
import { Transport } from "@/components/Transport";

/** Hidden `<audio>` fed by the preview server; drives the playhead per frame. */
function AudioEngine() {
  const ref = useRef<HTMLAudioElement>(null);
  const url = useMedia((s) => s.previewUrl);
  const playing = usePlayback((s) => s.playing);
  useEffect(() => {
    actions.registerAudio(ref.current);
    if (ref.current) ref.current.volume = usePlayback.getState().volume;
    return () => actions.registerAudio(null);
  }, []);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      actions.tickPlayback();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return (
    <audio
      ref={ref}
      src={url ?? undefined}
      preload="auto"
      onError={() => void actions.onAudioError()}
      onLoadedMetadata={actions.onAudioLoaded}
      onEnded={() =>
        usePlayback.setState({ playing: false, selectionOnly: false })
      }
      className="hidden"
    />
  );
}

function useAppEvents() {
  useThemeFollower();
  useEffect(() => {
    let alive = true;
    const unlisten: (() => void)[] = [];
    const keep = (u: () => void) => (alive ? unlisten.push(u) : u());
    window.addEventListener("keydown", onKeyDown, true);
    const resize = () => useUi.setState({ windowWidth: window.innerWidth });
    window.addEventListener("resize", resize);
    resize();
    listen<ExportProgress>("export-progress", (e) => {
      if (useUi.getState().overlay === "export")
        useUi.setState({ progress: e.payload });
    }).then(keep);
    getCurrentWindow()
      .onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === "enter" || p.type === "over")
          useUi.setState({ dragOver: true });
        else if (p.type === "leave") useUi.setState({ dragOver: false });
        else if (p.type === "drop") {
          useUi.setState({ dragOver: false });
          if (p.paths[0] && !useUi.getState().overlay)
            void actions.openFile(p.paths[0]);
        }
      })
      .then(keep);
    homeDir()
      .then((home) => useMedia.setState({ home }))
      .catch(() => {});
    takeLaunchOptions()
      .then((launch) => {
        useMedia.setState({ launch });
        if (launch.input) void actions.openFile(launch.input);
      })
      .catch(() => {});
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", resize);
      unlisten.forEach((u) => u());
    };
  }, []);
}

export default function App() {
  useAppEvents();
  const status = useMedia((s) => s.status);
  const hasDoc = useMedia((s) => !!s.info);
  const overlay = useUi((s) => s.overlay);
  const sidebar = useUi((s) => s.sidebar);
  const drawer = useUi((s) => s.drawer);
  const compact = useUi((s) => s.windowWidth) < COMPACT_BELOW;
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-base">
      <Header />
      <main className="relative flex min-h-0 flex-1">
        {hasDoc ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <Stage />
            <Overview />
            <Transport />
          </div>
        ) : status === "error" ? (
          <ErrorState />
        ) : (
          <EmptyState />
        )}
        {hasDoc && compact && drawer && (
          <div
            className="absolute inset-0 z-[7] bg-scrim"
            onClick={() => useUi.setState({ drawer: false })}
          />
        )}
        {hasDoc && (compact ? drawer : sidebar) && <Sidebar />}
      </main>
      <KeyBar />
      {overlay === "export" && <ExportDialog />}
      {overlay === "done" && <DoneDialog />}
      {overlay === "help" && <ShortcutReference />}
      <AudioEngine />
      <div className="pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_0_1px_var(--ctp-surface0)]" />
    </div>
  );
}
