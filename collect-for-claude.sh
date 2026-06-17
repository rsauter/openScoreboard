#!/bin/bash
# collect_for_claude.sh — openScoreboard
#
# Sammelt alle relevanten Projektdateien in ein flaches Verzeichnis,
# damit sie bequem ins Claude-Projekt hochgeladen werden können.
# Pfade werden mit Unterstrichen statt Schrägstrichen abgeflacht,
# z.B. src/client/pages/GameStart.vue → src_client_pages_GameStart.vue
#
# Usage:
#   chmod +x collect_for_claude.sh
#   ./collect_for_claude.sh
#
# Ergebnis liegt in ./claude_upload/

set -e

OUT_DIR="./claude_upload"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Dateien/Verzeichnisse, die eingesammelt werden sollen.
# Anpassen falls sich die Projektstruktur ändert.
INCLUDE_PATTERNS=(
  "package.json"
  "tsconfig.json"
  "tsconfig.server.json"
  "vite.config.ts"
  "server.ts"
  "README.md"
  ".gitignore"
  "src/**/*.ts"
  "src/**/*.vue"
  "src/**/*.html"
  "src/**/*.css"
  "src/**/*.json"
  "sports-templates/*.yaml"
  "sports-templates/*.yml"
)

# Verzeichnisse, die NIE eingesammelt werden (auch falls sie zufällig matchen)
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
  # globstar für ** Patterns aktivieren
  shopt -s globstar nullglob
  for file in $pattern; do
    [[ -f "$file" ]] || continue
    is_excluded "$file" && continue

    # Pfad abflachen: / → _
    flat_name=$(echo "$file" | sed 's/\//_/g')
    cp "$file" "$OUT_DIR/$flat_name"
    count=$((count + 1))
  done
  shopt -u globstar nullglob
done

echo "✅ $count Dateien gesammelt in $OUT_DIR/"
echo ""
echo "Nächster Schritt: Inhalt von $OUT_DIR ins Claude-Projekt hochladen."