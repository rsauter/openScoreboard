#!/usr/bin/env bash
set -euo pipefail
# deploy-to-pi.sh — openScoreboard
#
# One-command deploy: builds + packages a release (package-release.sh),
# copies the tarball, its checksum and the device-side scripts to the target
# device, and runs deploy-release.sh there. The scripts are sent fresh every
# time, so this works identically for an existing install (update), a legacy
# flat install (one-time migration to the release layout) and a brand-new /
# wiped device (first-time setup incl. systemd service).
#
# On the device the release is smoke-tested, switched in, health-checked and
# automatically rolled back if it doesn't come up (see deploy-release.sh).
# Manual rollback later:
#   ssh <ssh-user>@<pi-host> 'bash ~/openScoreboard/dev-tools/rollback.sh'
#
# Usage:
#   ./dev-tools/deploy-to-pi.sh [--skip-build] <ssh-user>@<pi-host> [remote-base-dir]
#
# --skip-build: don't rebuild/repackage — just take the newest .tar.gz
#   already sitting in releases/ (e.g. because you just ran
#   package-release.sh, or an earlier deploy-to-pi.sh, a moment ago).
#
# Examples:
#   ./dev-tools/deploy-to-pi.sh hornetsrmw-scoreboard@hrmw-scoreboard.local
#   ./dev-tools/deploy-to-pi.sh --skip-build hornetsrmw-scoreboard@hrmw-scoreboard.local
#
# remote-base-dir (relative to the remote home) defaults to openScoreboard.
# An installation under a different name (e.g. older hall Pis: openscoreboard) must be
# passed explicitly: ./dev-tools/deploy-to-pi.sh <user>@<host> openscoreboard

SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
  shift
fi

TARGET="${1:-}"
REMOTE_DIR="${2:-openScoreboard}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./dev-tools/deploy-to-pi.sh [--skip-build] <ssh-user>@<pi-host> [remote-base-dir]" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ "$SKIP_BUILD" == true ]]; then
  if ! ls releases/*.tar.gz &>/dev/null; then
    echo "Error: --skip-build given but releases/ has no .tar.gz yet — run" >&2
    echo "       dev-tools/package-release.sh at least once first." >&2
    exit 1
  fi
  echo "[INFO] --skip-build: using the newest existing release, not rebuilding."
else
  ./dev-tools/package-release.sh
fi

# Always the newest by modification time, regardless of which branch above ran.
LATEST_RELEASE="$(ls -t releases/*.tar.gz | head -1)"
RELEASE_FILENAME="$(basename "$LATEST_RELEASE")"
echo "[INFO] Deploying: ${RELEASE_FILENAME}"

echo "[INFO] Copying release + scripts to ${TARGET}..."
scp "$LATEST_RELEASE" "${LATEST_RELEASE}.sha256" dev-tools/deploy-release.sh dev-tools/rollback.sh "${TARGET}:~/"

echo "[INFO] Deploying on ${TARGET} (base dir: ~/${REMOTE_DIR})..."
# Cleanup only after a successful deploy; the release itself now lives in
# ~/<base>/releases/ on the device, so the tarball isn't needed there anymore.
ssh "$TARGET" "bash ~/deploy-release.sh ~/${RELEASE_FILENAME} ~/${REMOTE_DIR} && rm -f ~/${RELEASE_FILENAME} ~/${RELEASE_FILENAME}.sha256 ~/deploy-release.sh ~/rollback.sh"

echo "[INFO] Deploy to ${TARGET} complete."
