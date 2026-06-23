#!/bin/bash
# collect-for-claude.sh — openScoreboard
#
# Collects all relevant project files into a flat directory so they can
# be conveniently uploaded to the Claude project.
# Paths are flattened using underscores instead of slashes, e.g.
# src/client/pages/GameStart.vue → src_client_pages_GameStart.vue
#
# DYNAMIC VERSION: instead of a hand-maintained file list, this script
# scans three zones by file extension, so new files show up automatically:
#   - repo root         (top-level only, not recursive)
#   - src/              (recursive — all code/config files)
#   - sports-templates/ (recursive — all .yaml templates)
# Only text/code extensions are collected; binary assets (.mp3, .svg, .png, …)
# are intentionally skipped — not useful for a Claude upload.
#
# Lives under ./dev-tools/ but always operates relative to the repo root,
# regardless of the directory it's invoked from.
#
# CROSS-PLATFORM NOTE:
# Written against bash 3.2 (what macOS ships by default — Apple won't bundle
# GPLv3 software, so newer bash isn't there unless installed separately via
# Homebrew). Runs unmodified on macOS, Linux, and Windows (Git Bash / WSL).
# Avoided on purpose: mapfile, associative arrays, globstar (**), and
# eval-built find expressions. Uses plain `find ... -print0` piped into a
# `while read -r -d ''` loop, with extension/exclusion checks done in plain
# shell via `case` — no bash-4-only features anywhere.
#
# Usage:
#   chmod +x dev-tools/collect-for-claude.sh
#   ./dev-tools/collect-for-claude.sh
#
# Result is placed in <repo-root>/claude_upload/

set -e

# Resolve repo root: this script lives in <repo-root>/dev-tools, so go up one.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

OUT_DIR="./claude_upload"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Extensions to collect (text/code only — no binary assets).
# To track a new extension, just add it here — nothing else to touch.
EXTENSIONS="ts vue css html json yaml yml md"

# Directory names to always exclude when walking recursively.
EXCLUDE_DIRS="node_modules .git dist build claude_upload .vite coverage"

# Returns true (0) if $1 (a path) passes through any excluded directory.
is_excluded() {
  local path="$1"
  local dir
  for dir in $EXCLUDE_DIRS; do
    case "$path" in
      */"$dir"/*) return 0 ;;
    esac
  done
  return 1
}

# Returns true (0) if $1 (a filename) ends in one of EXTENSIONS (case-insensitive).
has_wanted_extension() {
  local lower
  lower=$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')
  local ext
  for ext in $EXTENSIONS; do
    case "$lower" in
      *".$ext") return 0 ;;
    esac
  done
  return 1
}

collect() {
  local src="$1"
  local rel="${src#./}"
  local flat="${rel//\//_}"
  cp "$src" "$OUT_DIR/$flat"
  echo "  + $src → $flat"
}

echo "── Root files (top-level only) ──────────────────────────────────────────"
while IFS= read -r -d '' f; do
  base="${f##*/}"
  if has_wanted_extension "$base"; then
    collect "$f"
  fi
done < <(find . -maxdepth 1 -type f -print0)
# .gitignore has no extension matched above — grab it explicitly if present
[[ -f "./.gitignore" ]] && collect "./.gitignore"

echo "── src/ (recursive) ─────────────────────────────────────────────────────"
if [[ -d "./src" ]]; then
  while IFS= read -r -d '' f; do
    is_excluded "$f" && continue
    base="${f##*/}"
    if has_wanted_extension "$base"; then
      collect "$f"
    fi
  done < <(find ./src -type f -print0)
fi

echo "── sports-templates/ (recursive) ────────────────────────────────────────"
if [[ -d "./sports-templates" ]]; then
  while IFS= read -r -d '' f; do
    is_excluded "$f" && continue
    base="${f##*/}"
    case "$base" in
      *.[Yy][Aa][Mm][Ll]|*.[Yy][Mm][Ll]) collect "$f" ;;
    esac
  done < <(find ./sports-templates -type f -print0)
fi

echo ""
echo "✅ Files gesammelt in $OUT_DIR/"

echo "start generating folder.md"
# Run from REPO_ROOT (current cwd) so the scan covers the whole project,
# but point its output directly at claude_upload/folder.md via env var —
# avoids writing a stray folder.md into the repo root and avoids double
# headers from echo+append.
FOLDER_MD_OUTPUT="$OUT_DIR/folder.md" "$SCRIPT_DIR/generate-folder-md.sh"
ls "$OUT_DIR/"