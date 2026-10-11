import { useEffect } from "react";
import { create } from "zustand";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Bumped whenever the system colour scheme changes; canvases redraw on it. */
export const useTheme = create<{ version: number }>()(() => ({ version: 0 }));

let cache: Colors | null = null;
const bump = () => {
  cache = null;
  useTheme.setState((s) => ({ version: s.version + 1 }));
};

/** Follows `prefers-color-scheme` and Tauri's theme events. */
export function useThemeFollower() {
  useEffect(() => {
    const mq =
      typeof matchMedia === "function"
        ? matchMedia("(prefers-color-scheme: dark)")
        : null;
    mq?.addEventListener("change", bump);
    let unlisten: (() => void) | undefined;
    let alive = true;
    getCurrentWindow()
      .onThemeChanged(() => requestAnimationFrame(bump))
      .then((u) => (alive ? (unlisten = u) : u()))
      .catch(() => {});
    document.fonts?.ready.then(bump);
    return () => {
      alive = false;
      mq?.removeEventListener("change", bump);
      unlisten?.();
    };
  }, []);
}

export interface Colors {
  wave: string;
  dim: string;
  peak: string;
  fade: string;
  tick: string;
  label: string;
  skeleton: string;
  mid: string;
  accent: string;
  zc: string;
}
const ROLES: Record<keyof Colors, string> = {
  wave: "--wave-fill",
  dim: "--wave-dim",
  peak: "--wave-peak",
  fade: "--fade-line",
  tick: "--ctp-overlay0",
  label: "--ctp-subtext0",
  skeleton: "--ctp-surface0",
  mid: "--ctp-surface1",
  accent: "--ctp-lavender",
  zc: "--zc",
};
/** Canvas colours from the CSS custom properties, cached until the theme changes. */
export function colors(): Colors {
  if (cache) return cache;
  const cs = getComputedStyle(document.documentElement);
  cache = Object.fromEntries(
    Object.entries(ROLES).map(([k, v]) => [
      k,
      cs.getPropertyValue(v).trim() || "gray",
    ]),
  ) as unknown as Colors;
  return cache;
}
