#!/usr/bin/env bash
# Install the woice icon into the user's hicolor theme under the Wayland app id
# `woice`, so shells can resolve it for `tauri dev` windows. No .desktop file.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/src-tauri/icons"
theme="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"

for s in 16 32 48 64 128 256 512; do
  install -Dm644 "$icons/${s}x${s}.png" "$theme/${s}x${s}/apps/woice.png"
done
install -Dm644 "$icons/icon.svg" "$theme/scalable/apps/woice.svg"

if command -v gtk-update-icon-cache >/dev/null; then
  gtk-update-icon-cache -f -t "$theme" || true
fi
echo "Installed woice icons into $theme"
