#!/usr/bin/env bash
set -euo pipefail
# deploy-release.sh — openScoreboard
#
# Lives permanently on the Pi (or any target device) under
# dev-tools/deploy-release.sh — NOT run from the dev machine. Extracts a
# release tarball produced by package-release.sh directly into the current
# project directory and restarts the service. No git involved.
#
# Safe by construction, not by exclusion: the tarball never contains
# settings.json, license.json, state.json, device-secret.json, or
# state-archive/ in the first place (see package-release.sh), so a plain
# extraction on top of the existing install can never touch a venue's data
# — there's nothing in the archive that could clobber it.
#
# Usage (run ON the Pi, from inside the project directory):
#   bash dev-tools/deploy-release.sh /path/to/openscoreboard-<version>.tar.gz

RELEASE_TAR="${1:-}"
if [[ -z "$RELEASE_TAR" || ! -f "$RELEASE_TAR" ]]; then
  echo "Usage: bash dev-tools/deploy-release.sh /path/to/release.tar.gz" >&2
  exit 1
fi

if [[ ! -f "package.json" ]] || ! grep -q '"name": "openscoreboard"' package.json; then
  echo "Error: run this from inside the openscoreboard project directory." >&2
  exit 1
fi

PROJECT_DIR="$(pwd)"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "[INFO] Extracting $(basename "$RELEASE_TAR")..."
tar -xzf "$RELEASE_TAR" -C "$STAGE_DIR"

# The tarball contains exactly one top-level folder (the release name).
RELEASE_DIR="$(find "$STAGE_DIR" -mindepth 1 -maxdepth 1 -type d)"
if [[ -z "$RELEASE_DIR" ]]; then
  echo "Error: unexpected tarball layout (no top-level release folder found)." >&2
  exit 1
fi

if [[ -f "$RELEASE_DIR/RELEASE_INFO.txt" ]]; then
  echo "[INFO] Deploying:"
  sed 's/^/  /' "$RELEASE_DIR/RELEASE_INFO.txt"
fi

echo "[INFO] Replacing dist/, package.json, package-lock.json, sports-templates/..."
rm -rf "$PROJECT_DIR/dist"
cp -R "$RELEASE_DIR/dist" "$PROJECT_DIR/dist"
cp "$RELEASE_DIR/package.json" "$RELEASE_DIR/package-lock.json" "$PROJECT_DIR/"
rm -rf "$PROJECT_DIR/sports-templates"
cp -R "$RELEASE_DIR/sports-templates" "$PROJECT_DIR/sports-templates"
[[ -f "$RELEASE_DIR/RELEASE_INFO.txt" ]] && cp "$RELEASE_DIR/RELEASE_INFO.txt" "$PROJECT_DIR/"

echo "[INFO] Installing production dependencies..."
cd "$PROJECT_DIR"
npm ci --omit=dev

echo "[INFO] Restarting service..."
sudo systemctl restart openscoreboard
sleep 1
sudo systemctl status openscoreboard --no-pager -l | head -5

echo "[INFO] Deploy complete."