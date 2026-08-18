#!/usr/bin/env bash
set -euo pipefail
# deploy-to-pi.sh — openScoreboard
#
# One-command deploy: builds + packages a release (package-release.sh),
# copies the tarball to the target device, and runs deploy-release.sh
# there. Requires deploy-release.sh to already exist on the target device
# at ~/openscoreboard/dev-tools/deploy-release.sh (copy it there once
# manually — it's not re-transferred by this script, since it doesn't
# change often and this keeps the transfer itself minimal).
#
# Usage:
#   ./dev-tools/deploy-to-pi.sh <ssh-user>@<pi-host> [remote-project-dir]
# Example:
#   ./dev-tools/deploy-to-pi.sh hornetsrmw-scoreboard@hrmw-scoreboard.local
#
# remote-project-dir defaults to ~/openscoreboard if omitted.

TARGET="${1:-}"
REMOTE_DIR="${2:-openscoreboard}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: ./dev-tools/deploy-to-pi.sh <ssh-user>@<pi-host> [remote-project-dir]" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

./dev-tools/package-release.sh

LATEST_RELEASE="$(ls -t releases/*.tar.gz | head -1)"
RELEASE_FILENAME="$(basename "$LATEST_RELEASE")"

echo "[INFO] Copying ${RELEASE_FILENAME} to ${TARGET}..."
scp "$LATEST_RELEASE" "${TARGET}:~/${RELEASE_FILENAME}"

echo "[INFO] Deploying on ${TARGET}..."
ssh "$TARGET" "cd ${REMOTE_DIR} && bash dev-tools/deploy-release.sh ~/${RELEASE_FILENAME} && rm ~/${RELEASE_FILENAME}"

echo "[INFO] Deploy to ${TARGET} complete."