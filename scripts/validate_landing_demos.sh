#!/usr/bin/env bash
set -euo pipefail

site_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
skill_dir=${CODEX_SKILLS_DIR:-"$HOME/.codex/skills"}/demo-video-production/scripts

python3 "$skill_dir/validate_demo_media.py" \
  "$site_dir" --min-duration 45 --max-duration 75 --require-audio
python3 "$skill_dir/validate_video_embed.py" "$site_dir/index.html"
