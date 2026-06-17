#!/bin/bash
# collect-for-claude.sh — openScoreboard
#
# Collects all relevant project files into a flat directory so they can
# be conveniently uploaded to the Claude project.
# Paths are flattened using underscores instead of slashes, e.g.
# src/client/pages/GameStart.vue → src_client_pages_GameStart.vue
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

# Files/patterns to collect.
# Adjust if the project structure changes.
INCLUDE_PATTERNS=(
  "package.json"
  "tsconfig.json"
  "tsconfig.server.json"
  "vite.config.ts"
  "server.ts"
  "README.md"
  "ARCHITECTURE.md"
  ".gitignore"
  "src/**/*.ts"
  "src/**/*.vue"
  "src/**/*.html"
  "src/**/*.css"
  "src/**/*.json"
  "sports-templates/*.yaml"
  "sports-templates/*.yml"
)

# Directories that are NEVER collected (even if they happen to match a pattern)
EXCLUDE_DIRS=(
  "node_modules"
  "dist"
  "public"
  ".git"
  "claude_upload"
)

is_excluded() {
  local path="$1"
  for dir in "${EXCLUDE_DIRS[@]}"; do
    if [[ "$path" == *"/$dir/"* ]] || [[ "$path" == "$dir/"* ]]; then
      return 0
    fi
  done
  return 1
}

count=0
for pattern in "${INCLUDE_PATTERNS[@]}"; do
  # enable globstar for ** patterns
  shopt -s globstar nullglob
  for file in $pattern; do
    [[ -f "$file" ]] || continue
    is_excluded "$file" && continue

    # flatten path: / → _
    flat_name=$(echo "$file" | sed 's/\//_/g')
    cp "$file" "$OUT_DIR/$flat_name"
    echo "  + $file → $flat_name"
    count=$((count + 1))
  done
  shopt -u globstar nullglob
done

echo ""
echo "✅ $count file(s) collected in $OUT_DIR/"
echo ""
echo "Next step: upload the contents of $OUT_DIR to the Claude project."