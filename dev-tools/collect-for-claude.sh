#!/usr/bin/env bash
set -euo pipefail
# collect-for-claude.sh — openScoreboard
#
# Collects all git-tracked files (plus untracked-but-not-gitignored files)
# from the current repository into ./dev-tools/collect-for-claude as a
# FLAT folder: each file is renamed so its original path is encoded in the
# filename (path separators replaced with "_"), e.g.
#   src/client/index.ts  ->  src_client_index.ts
# This makes it easy to drag-and-drop the whole folder into a chat upload.
# A FOLDER_STRUCTURE.md documenting the ORIGINAL nested structure is
# generated alongside the files, and the whole output directory is zipped
# at the end so it can be uploaded as a single file.
#
# Mirrors scoreboardFLEET's collect-for-claude.sh pattern for consistency
# across the sluiten-scoreboard ecosystem.
#
# Difference vs. Fleet: openScoreboard's repo also contains binary assets
# (audio, images, fonts, etc.) that are useless for a Claude upload — they
# just burn context. These are skipped via BINARY_EXTENSIONS below, same
# intent as the previous two-script version.
#
# Works on macOS and Linux. Requires: git, bash, awk.
# Usage: run from anywhere inside the target repo:
#   ./dev-tools/collect-for-claude.sh

OUTPUT_DIR="dev-tools/collect-for-claude"

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
REPO_NAME="$(basename "$REPO_ROOT")"

# Safety denylist: never collect these even if tracked by mistake
DENY_PATTERNS=(
  ".env"
  ".env.*"
  "*.pem"
  "*.key"
  "*secret*"
  "*.sqlite"
)

# Binary/asset extensions: not useful for a Claude upload, only bloat it.
# Add new binary extensions here if new asset types show up in the repo.
BINARY_EXTENSIONS=(
  "*.mp3" "*.wav" "*.ogg"
  "*.png" "*.jpg" "*.jpeg" "*.gif" "*.svg" "*.ico" "*.webp"
  "*.woff" "*.woff2" "*.ttf" "*.eot"
  "*.zip" "*.tar.gz" "*.gz"
)

echo "Collecting files for $REPO_NAME ..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

FILE_LIST="$(mktemp)"
{
  git ls-files
  git ls-files --others --exclude-standard
} | sort -u > "$FILE_LIST"

KEPT_LIST="$(mktemp)"
COUNT=0

while IFS= read -r file; do
  [ -z "$file" ] && continue

  # never re-collect our own output directory
  case "$file" in
    dev-tools/collect-for-claude/*) continue ;;
    dev-tools/collect-for-claude.zip) continue ;;
  esac

  base="$(basename "$file")"

  skip=0
  for pattern in "${DENY_PATTERNS[@]}"; do
    # shellcheck disable=SC2254
    case "$base" in
      $pattern) skip=1; break ;;
    esac
  done
  [ "$skip" -eq 1 ] && continue

  for pattern in "${BINARY_EXTENSIONS[@]}"; do
    # shellcheck disable=SC2254
    case "$base" in
      $pattern) skip=1; break ;;
    esac
  done
  [ "$skip" -eq 1 ] && continue

  [ -f "$file" ] || continue

  flat_name="$(echo "$file" | sed 's/\//_/g')"
  cp "$file" "$OUTPUT_DIR/$flat_name"
  echo "$file" >> "$KEPT_LIST"
  COUNT=$((COUNT + 1))
done < "$FILE_LIST"
rm -f "$FILE_LIST"

echo "Copied $COUNT files (flattened)."

# --- Generate FOLDER_STRUCTURE.md (reflects the ORIGINAL nested structure) ---
STRUCTURE_FILE="$OUTPUT_DIR/FOLDER_STRUCTURE.md"
{
  echo "# Folder structure: $REPO_NAME"
  echo ""
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "Files included: $COUNT"
  echo ""
  echo "Note: files in this folder are flattened (path separators replaced"
  echo "with \"_\" in the filename). This tree shows the ORIGINAL structure."
  echo "Binary assets (audio, images, fonts, archives) are excluded from"
  echo "the collection — not useful for a Claude upload."
  echo ""
  echo '```'
  awk -F'/' '
  {
    path = ""
    n = split($0, parts, "/")
    for (i = 1; i <= n; i++) {
      if (i < n) {
        path = (path == "" ? parts[i] : path "/" parts[i])
        if (!(path in seen)) {
          indent = ""
          for (j = 1; j < i; j++) indent = indent "  "
          print indent "|-- " parts[i] "/"
          seen[path] = 1
        }
      } else {
        indent = ""
        for (j = 1; j < i; j++) indent = indent "  "
        print indent "|-- " parts[i]
      }
    }
  }' "$KEPT_LIST"
  echo '```'
} > "$STRUCTURE_FILE"
rm -f "$KEPT_LIST"

echo "Structure written to $STRUCTURE_FILE"

# --- Zip the collected output ---
ZIP_PATH="dev-tools/collect-for-claude.zip"
rm -f "$ZIP_PATH"
if command -v zip > /dev/null 2>&1; then
  # Standard on macOS and most Linux distros
  (cd "$OUTPUT_DIR" && zip -rq "../../$ZIP_PATH" .)
elif command -v ditto > /dev/null 2>&1; then
  # macOS fallback (ditto ships with every macOS install)
  ditto -c -k --sequesterRsrc --keepParent "$OUTPUT_DIR" "$ZIP_PATH"
else
  # Last-resort fallback: tar.gz instead of zip
  ZIP_PATH="dev-tools/collect-for-claude.tar.gz"
  tar -czf "$ZIP_PATH" -C "$(dirname "$OUTPUT_DIR")" "$(basename "$OUTPUT_DIR")"
  echo "Note: 'zip' not found, created a .tar.gz instead."
fi

echo "Zipped output to $ZIP_PATH"
echo ""
echo "Done. Upload $ZIP_PATH to the Claude project."