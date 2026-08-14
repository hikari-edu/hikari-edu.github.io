#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "Uso: $0 <video-bruto.webm> <narracao.txt> <video-final.webm>" >&2
  exit 1
fi

raw_video=$1
narration_text=$2
output_video=$3
engine=${HIKARI_NARRATION_ENGINE:-openai}
voice=${HIKARI_NARRATOR_VOICE:-coral}
audio_base=$(mktemp "${TMPDIR:-/tmp}/hikari-narration.XXXXXX")
audio_file=
trap 'rm -f "$audio_base" "$audio_base.aiff" "$audio_base.mp3"' EXIT

[[ -f "$raw_video" && -f "$narration_text" ]] || {
  echo "Vídeo ou roteiro de narração não encontrado." >&2
  exit 1
}

case "$engine" in
  openai)
    : "${OPENAI_API_KEY:?Defina OPENAI_API_KEY para gerar a narração neural.}"
    payload=$(jq -Rs --arg voice "$voice" '{
      model: "gpt-4o-mini-tts",
      voice: $voice,
      input: .,
      response_format: "mp3",
      instructions: "Fale em português do Brasil, com voz adulta, clara e natural. Mantenha ritmo conversacional e profissional, com pausas breves entre as ideias. Evite tom publicitário, monotonia, pressa e entonação artificial."
    }' "$narration_text")
    curl --fail --silent --show-error https://api.openai.com/v1/audio/speech \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H 'Content-Type: application/json' \
      --data "$payload" \
      -o "$audio_base.mp3"
    audio_file="$audio_base.mp3"
    ;;
  macos)
    voice=${HIKARI_NARRATOR_VOICE:-Luciana}
    say -v "$voice" -r "${HIKARI_NARRATOR_RATE:-145}" -f "$narration_text" -o "$audio_base.aiff"
    audio_file="$audio_base.aiff"
    ;;
  *)
    echo "Motor de narração inválido: $engine. Use openai ou macos." >&2
    exit 1
    ;;
esac
duration=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$raw_video")
mkdir -p "$(dirname "$output_video")"

ffmpeg -v error -y \
  -i "$raw_video" -i "$audio_file" \
  -filter_complex '[1:a]aresample=48000,apad[audio]' \
  -map 0:v:0 -map '[audio]' -t "$duration" \
  -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 \
  -c:a libopus -b:a 96k \
  "$output_video"
