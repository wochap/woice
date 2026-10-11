#!/usr/bin/env bash
# Generate the 10 s sine+noise test fixtures into src-tauri/tests/fixtures (gitignored).
# Needs ffmpeg with libmp3lame, libopus, libvorbis and libx264 (ffmpeg-full in the dev shell).
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/src-tauri/tests/fixtures"
mkdir -p "$out"
cd "$out"
f() { ffmpeg -hide_banner -nostdin -v error -y "$@"; }

L='0.5*sin(2*PI*220*t)+0.1*(random(0)-0.5)'
R='0.5*sin(2*PI*330*t)+0.1*(random(1)-0.5)'
stereo=(-f lavfi -i "aevalsrc=${L}|${R}:s=48000:c=stereo:d=10")
mono=(-f lavfi -i "aevalsrc=${L}:s=48000:c=mono:d=10")

f "${stereo[@]}" -c:a libmp3lame -b:a 192k stereo.mp3
f "${mono[@]}" -c:a libmp3lame -b:a 128k mono.mp3
f "${stereo[@]}" -c:a aac -b:a 192k stereo-aac.m4a
f "${mono[@]}" -c:a aac -b:a 128k mono-aac.m4a
f "${mono[@]}" -c:a libopus -b:a 64k mono.opus
f "${stereo[@]}" -c:a libopus -b:a 128k stereo-opus.ogg
f "${stereo[@]}" -c:a libvorbis -b:a 160k stereo-vorbis.ogg
f "${stereo[@]}" -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 stereo-24.flac
f "${mono[@]}" -c:a flac -sample_fmt s16 mono.flac
f "${stereo[@]}" -c:a pcm_s16le stereo-16.wav
f "${stereo[@]}" -c:a pcm_s24le stereo-24.wav
f "${mono[@]}" -c:a pcm_s16le mono-16.wav
f "${stereo[@]}" -c:a pcm_s16be stereo.aiff
f -f lavfi -i "aevalsrc=${L}|${R}:s=96000:c=stereo:d=10" -c:a flac -sample_fmt s32 -bits_per_raw_sample 24 hires-24-96.flac
f -f lavfi -i "aevalsrc=${L}|${R}|${L}|${R}|0.1*${L}|0.2*${R}:s=48000:c=5.1:d=10" -c:a flac surround-5.1.flac
# Pure 100 Hz sine: zero crossings every 5 ms from t = 0.
f -f lavfi -i "aevalsrc=0.5*sin(2*PI*100*t):s=48000:c=mono:d=10" -c:a pcm_s16le sine-mono.wav
f -f lavfi -i "testsrc2=s=320x240:r=25:d=10" "${stereo[@]}" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -c:a aac -b:a 128k -shortest stereo-video.mp4
f -f lavfi -i "testsrc2=s=320x240:r=25:d=2" -c:v libx264 -preset ultrafast video-only.mp4
# moov at the end, cut off: "moov atom not found".
f "${mono[@]}" -c:a aac -b:a 128k -movflags -faststart full.m4a
head -c "$(( $(stat -c %s full.m4a) / 2 ))" full.m4a > truncated.m4a
rm full.m4a
ls -1 "$out"
