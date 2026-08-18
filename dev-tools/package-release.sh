#!/usr/bin/env bash
set -euo pipefail
# package-release.sh — openScoreboard
#
# Builds the app and packages exactly what's needed to run in production
# into a single tarball, WITHOUT requiring git on the target device (Pi).
# Mirrors the "packaged deploy, not git pull" preference: transfer one
# file, extract, restart — nothing else touches the Pi's filesystem.
#
# Deliberately EXCLUDES every per-installation runtime/data file, so a
# deploy can never clobber a running venue's data:
#   settings.json, license.json, state.json, device-secret.json,
#   state-archive/ — none of these are ever written by npm run build or
#   read from anywhere inside dist/, so they're simply never part of the
#   tarball in the first place (nothing to "exclude" at deploy time —
#   see deploy-release.sh, which just extracts on top).
#
# Included in the release:
#   dist/                 — built server + client (npm run build output)
#   package.json           — for `npm ci` on the target device
#   package-lock.json       (pins exact dependency versions)
#   sports-templates/      — YAML sport definitions, loaded on server start
#   RELEASE_INFO.txt       — git commit + build timestamp, for traceability
#                            (so `sudo systemctl status` + this file together
#                            tell you exactly what's running on the Pi)
#
# Usage: run from anywhere inside the repo:
#   ./dev-tools/package-release.sh
# Produces: releases/openscoreboard-<version>-<gitshort>-<timestamp>.tar.gz

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Warning: working tree has uncommitted changes." >&2
  echo "The release will reflect what's on disk right now, not the last commit." >&2
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
GIT_SHORT="$(git rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE_NAME="openscoreboard-${VERSION}-${GIT_SHORT}-${TIMESTAMP}"

echo "[INFO] Building..."
npm run build

echo "[INFO] Packaging release: ${RELEASE_NAME}"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$STAGE_DIR/$RELEASE_NAME"
cp -R dist "$STAGE_DIR/$RELEASE_NAME/dist"
cp package.json package-lock.json "$STAGE_DIR/$RELEASE_NAME/"
cp -R sports-templates "$STAGE_DIR/$RELEASE_NAME/sports-templates"

cat > "$STAGE_DIR/$RELEASE_NAME/RELEASE_INFO.txt" <<EOF
openScoreboard release
version:    ${VERSION}
git commit: $(git rev-parse HEAD)
git branch: $(git rev-parse --abbrev-ref HEAD)
built:      $(date -u +"%Y-%m-%dT%H:%M:%SZ")
built on:   $(hostname)
EOF

mkdir -p releases
tar -czf "releases/${RELEASE_NAME}.tar.gz" -C "$STAGE_DIR" "$RELEASE_NAME"

echo "[INFO] Done: releases/${RELEASE_NAME}.tar.gz"
echo
echo "Next steps:"
echo "  scp releases/${RELEASE_NAME}.tar.gz <pi-user>@<pi-host>:~/"
echo "  ssh <pi-user>@<pi-host> 'bash ~/openscoreboard/dev-tools/deploy-release.sh ~/${RELEASE_NAME}.tar.gz'"
echo "(or just run dev-tools/deploy-to-pi.sh <pi-user>@<pi-host> to do both in one step)"