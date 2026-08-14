#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Uso: $0 <video-bruto.webm> <narracao.txt> <video-final.webm>" >&2
  exit 1
fi

raw_video=$1
narration_text=$2
output_video=$3
voice=${HIKARI_NARRATOR_VOICE:-Luciana}
rate=${HIKARI_NARRATOR_RATE:-145}
audio_file=$(mktemp "${TMPDIR:-/tmp}/hikari-narration.XXXXXX.aiff")
trap 'rm -f "$audio_file"' EXIT

[[ -f "$raw_video" && -f "$narration_text" ]] || {
  echo "Vídeo ou roteiro de narração não encontrado." >&2
  exit 1
}

say -v "$voice" -r "$rate" -f "$narration_text" -o "$audio_file"
duration=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$raw_video")
mkdir -p "$(dirname "$output_video")"

ffmpeg -v error -y \
  -i "$raw_video" -i "$audio_file" \
  -filter_complex '[1:a]aresample=48000,apad[audio]' \
  -map 0:v:0 -map '[audio]' -t "$duration" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 \
  -c:a libopus -b:a 96k \
  "$output_video"
