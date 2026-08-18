#!/usr/bin/env bash
set -euo pipefail
# deploy-to-pi.sh — openScoreboard
#
# One-command deploy: builds + packages a release (package-release.sh),
# copies the tarball AND deploy-release.sh to the target device, and runs
# it there. deploy-release.sh itself is sent fresh every time (it's tiny),
# so this works identically for an existing install (update) or a brand-
# new/freshly wiped device (first-time setup, including installing the
# systemd service) — no manual pre-setup step needed on the device.
#
# Usage:
#   ./dev-tools/deploy-to-pi.sh [--skip-build] <ssh-user>@<pi-host> [remote-project-dir]
#
# --skip-build: don't rebuild/repackage — just take the newest .tar.gz
#   already sitting in releases/ (e.g. because you just ran
#   package-release.sh, or an earlier deploy-to-pi.sh, a moment ago).
#
# Examples:
#   ./dev-tools/deploy-to-pi.sh hornetsrmw-scoreboard@hrmw-scoreboard.local
#   ./dev-tools/deploy-to-pi.sh --skip-build hornetsrmw-scoreboard@hrmw-scoreboard.local
#
# remote-project-dir defaults to ~/openscoreboard if omitted.

SKIP_BUILD=false
if [[ "${1:-}" == "--skip-build" ]]; then
  SKIP_BUILD=true
  shift
fi

TARGET="${1:-}"
REMOTE_DIR="${2:-openscoreboard}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./dev-tools/deploy-to-pi.sh [--skip-build] <ssh-user>@<pi-host> [remote-project-dir]" >&2
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

echo "[INFO] Copying release + deploy script to ${TARGET}..."
scp "$LATEST_RELEASE" dev-tools/deploy-release.sh "${TARGET}:~/"

echo "[INFO] Deploying on ${TARGET} (project dir: ~/${REMOTE_DIR})..."
ssh "$TARGET" "bash ~/deploy-release.sh ~/${RELEASE_FILENAME} ~/${REMOTE_DIR} && rm ~/${RELEASE_FILENAME} ~/deploy-release.sh"

echo "[INFO] Deploy to ${TARGET} complete."