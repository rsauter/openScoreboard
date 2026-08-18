#!/usr/bin/env bash
set -euo pipefail
# deploy-release.sh — openScoreboard
#
# Extracts a release tarball produced by package-release.sh directly into
# a project directory and (re)starts the service. No git involved.
# Handles two cases with the same script:
#   - UPDATE: project-dir already has an openScoreboard install → replaces
#     dist/, package.json, package-lock.json, sports-templates/, runs
#     `npm ci`, restarts the existing systemd service.
#   - FIRST-TIME SETUP (brand-new / freshly wiped device): project-dir is
#     empty or doesn't exist yet → same file replacement, then also
#     installs + enables a systemd service from the template bundled in
#     the release, since none exists yet to restart.
#
# Safe by construction, not by exclusion: the tarball never contains
# settings.json, license.json, state.json, device-secret.json, or
# state-archive/ in the first place (see package-release.sh), so extracting
# on top of an existing install can never touch a venue's data — there's
# nothing in the archive that could clobber it. On first-time setup those
# files simply don't exist yet; the app falls back to its defaults (e.g.
# PIN 0000) until configured via Settings.
#
# Usage (run ON the target device):
#   bash deploy-release.sh /path/to/release.tar.gz [project-dir]
# project-dir defaults to the current directory if omitted.

RELEASE_TAR="${1:-}"
PROJECT_DIR="${2:-$(pwd)}"

if [[ -z "$RELEASE_TAR" || ! -f "$RELEASE_TAR" ]]; then
  echo "Usage: bash deploy-release.sh /path/to/release.tar.gz [project-dir]" >&2
  exit 1
fi

# Guard: a non-empty target directory must already look like an
# openScoreboard install — refuses to extract on top of some unrelated
# non-empty directory by mistake. An empty or not-yet-existing directory
# is always fine (first-time setup case).
if [[ -d "$PROJECT_DIR" && -n "$(ls -A "$PROJECT_DIR" 2>/dev/null)" ]]; then
  if [[ ! -f "$PROJECT_DIR/package.json" ]] || ! grep -q '"name": "openscoreboard"' "$PROJECT_DIR/package.json"; then
    echo "Error: $PROJECT_DIR exists and is non-empty, but doesn't look like an openScoreboard install." >&2
    echo "Point this at an empty/nonexistent directory for first-time setup, or at an existing install to update it." >&2
    exit 1
  fi
fi

IS_FIRST_INSTALL=false
[[ ! -f "$PROJECT_DIR/package.json" ]] && IS_FIRST_INSTALL=true
mkdir -p "$PROJECT_DIR"

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

# Keep this script itself in place inside the project for next time, so a
# future deploy-to-pi.sh run (or manual re-run) always finds it here too.
mkdir -p "$PROJECT_DIR/dev-tools"
if [[ "$(readlink -f "$0" 2>/dev/null)" != "$(readlink -f "$PROJECT_DIR/dev-tools/deploy-release.sh" 2>/dev/null)" ]]; then
  cp "$0" "$PROJECT_DIR/dev-tools/deploy-release.sh"
fi

# Same for the kiosk-launch helper — always kept current on the device,
# even though starting it is a separate manual step (see its own header).
if [[ -f "$RELEASE_DIR/start-display-kiosk.sh" ]]; then
  cp "$RELEASE_DIR/start-display-kiosk.sh" "$PROJECT_DIR/dev-tools/start-display-kiosk.sh"
  chmod +x "$PROJECT_DIR/dev-tools/start-display-kiosk.sh"
fi

echo "[INFO] Installing production dependencies..."
cd "$PROJECT_DIR"
npm ci --omit=dev

SERVICE_NAME="openscoreboard"
if ! systemctl list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "${SERVICE_NAME}.service"; then
  echo "[INFO] No systemd service found — installing it now (first-time setup)."
  if [[ -f "$RELEASE_DIR/openscoreboard.service.template" ]]; then
    sed -e "s#__PROJECT_DIR__#$PROJECT_DIR#g" -e "s#__USER__#$(whoami)#g" \
      "$RELEASE_DIR/openscoreboard.service.template" | sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable "${SERVICE_NAME}"
  else
    echo "[WARN] No service template in this release — skipping. Create" >&2
    echo "       /etc/systemd/system/${SERVICE_NAME}.service manually before" >&2
    echo "       the app will run automatically." >&2
  fi
fi

echo "[INFO] Restarting service..."
sudo systemctl restart "${SERVICE_NAME}"
sleep 1
sudo systemctl status "${SERVICE_NAME}" --no-pager -l | head -5

if [[ "$IS_FIRST_INSTALL" == true ]]; then
  echo
  echo "[INFO] First-time setup complete. settings.json/license.json don't"
  echo "       exist yet — the app runs with defaults (PIN 0000) until you"
  echo "       change them in Settings."
fi

echo "[INFO] Deploy complete."