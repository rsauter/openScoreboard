#!/bin/bash
# collect-for-claude.sh — openScoreboard
#
# Collects all relevant project files into a flat directory so they can
# be conveniently uploaded to the Claude project.
# Paths are flattened using underscores instead of slashes, e.g.
# src/client/pages/GameStart.vue → src_client_pages_GameStart.vue
#
# Plain bash, no globstar/** — works with the bash 3.2 that ships
# with macOS as well as any modern bash on Linux/Windows (Git Bash, WSL).
#
# Usage:
#   chmod +x collect-for-claude.sh
#   ./collect-for-claude.sh
#
# Result is placed in ./claude_upload/

set -e

OUT_DIR="./claude_upload"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

collect() {
  local src="$1"
  if [[ ! -f "$src" ]]; then
    echo "  ! skip (not found): $src"
    return
  fi
  local rel="${src#./}"
  local flat="${rel//\//_}"
  cp "$src" "$OUT_DIR/$flat"
  echo "  + $src → $flat"
}

# ── Root files ──────────────────────────────────────────────────────────────
collect "./server.ts"
collect "./package.json"
collect "./tsconfig.json"
collect "./tsconfig.server.json"
collect "./vite.config.ts"
collect "./README.md"
collect "./ARCHITECTURE.md"
collect "./.gitignore"

# ── src/client ──────────────────────────────────────────────────────────────
collect "./src/client/index.ts"
collect "./src/client/index.html"
collect "./src/client/shared.ts"
collect "./src/client/style.css"
collect "./src/client/display.html"
collect "./src/client/display.ts"
collect "./src/client/App.vue"
collect "./src/client/vite-env.d.ts"

# ── src/client/components ──────────────────────────────────────────────────
collect "./src/client/components/TopNav.vue"

# ── src/client/router ──────────────────────────────────────────────────────
collect "./src/client/router/index.ts"

# ── src/client/i18n (locales) ──────────────────────────────────────────────
collect "./src/client/i18n/index.ts"
collect "./src/client/i18n/en.json"
collect "./src/client/i18n/de.json"
collect "./src/client/i18n/fr.json"
collect "./src/client/i18n/it.json"

# ── src/client/pages ────────────────────────────────────────────────────────
collect "./src/client/pages/GameStart.vue"
collect "./src/client/pages/Operator.vue"
collect "./src/client/pages/Display.vue"
collect "./src/client/pages/Settings.vue"

# ── src/shared ──────────────────────────────────────────────────────────────
collect "./src/shared/types.ts"

# ── sports-templates ────────────────────────────────────────────────────────
collect "./sports-templates/floorball-gf-single-nl-finals.yaml"
collect "./sports-templates/floorball-gf-single-tournament.yaml"
collect "./sports-templates/floorball-gf-single.yaml"
collect "./sports-templates/floorball-gf-tournament-finals.yaml"
collect "./sports-templates/floorball-gf-tournament.yaml"
collect "./sports-templates/floorball-kf-ejuniors.yaml"
collect "./sports-templates/floorball-kf-single.yaml"
collect "./sports-templates/floorball-kf-tournament-finals.yaml"
collect "./sports-templates/floorball-kf-tournament.yaml"
collect "./sports-templates/handball.yaml"
collect "./sports-templates/icehockey-nl-playoff.yaml"

echo ""
echo "✅ Files gesammelt in $OUT_DIR/"
ls "$OUT_DIR/"