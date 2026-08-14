#!/usr/bin/env bash
set -euo pipefail

site_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
skill_dir=${CODEX_SKILLS_DIR:-"$HOME/.codex/skills"}/demo-video-production/scripts
expected_video_count=4
actual_video_count=$(find "$site_dir/assets/demos" -maxdepth 1 -type f -name 'hikari-demo-*.webm' | wc -l | tr -d ' ')

if [[ "$actual_video_count" != "$expected_video_count" ]]; then
  echo "expected $expected_video_count demonstration videos, found $actual_video_count" >&2
  exit 1
fi

python3 "$skill_dir/validate_demo_media.py" \
  "$site_dir" --min-duration 30 --max-duration 90 --require-audio
python3 "$skill_dir/validate_video_embed.py" "$site_dir/index.html"
