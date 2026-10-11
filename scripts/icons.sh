#!/usr/bin/env bash
# Rasterize the board 2a mark into src-tauri/icons: pixel-snapped 16 px mark,
# 32 px small mark, full mark with glow from 48 px up. Needs rsvg-convert (dev shell).
set -euo pipefail
cd "$(dirname "$0")/../src-tauri/icons"
r() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }
r icon-16.svg 16 16x16.png
r icon-32.svg 32 32x32.png
for s in 48 64 128 256 512; do r icon.svg $s ${s}x${s}.png; done
cp 256x256.png 128x128@2x.png
cp 512x512.png icon.png
