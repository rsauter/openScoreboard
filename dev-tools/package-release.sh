#!/usr/bin/env bash
set -euo pipefail
# package-release.sh — openScoreboard
#
# Builds the app and packages EVERYTHING needed to run it into a single,
# self-contained tarball — including production node_modules — so the target
# device (Pi) needs neither git, nor npm, nor a network connection to deploy.
# Mirrors the "packaged deploy, not git pull" preference: transfer one file,
# unpack, switch, done.
#
# Why node_modules is bundled: `npm ci` on the Pi deletes node_modules first
# and then downloads. With no (or flaky) internet in a sports hall that leaves
# the device with a half-installed app. The production dependency tree is pure
# JavaScript (express, ws, yaml — the client libraries are bundled by Vite and
# live in devDependencies), so a tree installed on the build host runs
# unchanged on the Pi's ARM CPU. This script verifies that no native addon
# (*.node) slipped in.
#
# Deliberately EXCLUDES every per-installation runtime/data file
# (settings.json, license.json, device-secret.json, state.json,
# state-archive/, .env). Those live in the device's shared data/ directory
# (see deploy-release.sh and ARCHITECTURE.md), so a release can never clobber
# venue data — nothing in the archive could.
#
# Release contents (one top-level folder named after the release):
#   dist/                          — built server + client
#   node_modules/                  — production dependencies only
#   package.json, package-lock.json
#   sports-templates/              — YAML sport definitions
#   RELEASE_INFO.txt               — release name, git commit, build time
#   openscoreboard.service.template, start-display-kiosk.sh,
#   deploy-release.sh, rollback.sh — device-side tooling matching this release
#
# If dev-tools/release-public.pem exists it is shipped as release-public.pem.
# The on-device updater trusts exactly that key to verify the NEXT update
# (Ed25519 signature, see publish-release.mjs). Without the file the build is
# still valid, but its updater stays inactive.
#
# Portable: runs on macOS (BSD tools) and Linux. Hashing goes through Node.
#
# Usage: run from anywhere inside the repo:
#   ./dev-tools/package-release.sh [--allow-dirty]
#   --allow-dirty  do not ask when the working tree has uncommitted changes
#                  (needed when called non-interactively)
# Produces: releases/<release-name>.tar.gz (+ .sha256); the last stdout line
# before the hints is TARBALL_PATH=<path> for scripts.

ALLOW_DIRTY=0
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  echo "Error: not inside a git repository." >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "[WARN] Working tree has uncommitted changes." >&2
  echo "       The release will reflect what's on disk right now, not the last commit." >&2
  if [[ "$ALLOW_DIRTY" != "1" ]]; then
    [[ -t 0 ]] || { echo "Error: non-interactive run with uncommitted changes. Commit them or pass --allow-dirty." >&2; exit 1; }
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  fi
fi

VERSION="$(node -p "require('./package.json').version")"
GIT_SHORT="$(git rev-parse --short HEAD)"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE_NAME="openscoreboard-${VERSION}-${GIT_SHORT}-${TIMESTAMP}"

# Dev dependencies are needed for the build itself (vite, tsc).
echo "[INFO] Installing build dependencies (npm ci)..."
npm ci

echo "[INFO] Building..."
npm run build

echo "[INFO] Packaging release: ${RELEASE_NAME}"

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT
OUT="$STAGE_DIR/$RELEASE_NAME"

mkdir -p "$OUT"
cp -R dist "$OUT/dist"
cp package.json package-lock.json "$OUT/"
cp -R sports-templates "$OUT/sports-templates"
cp dev-tools/openscoreboard.service.template \
   dev-tools/start-display-kiosk.sh \
   dev-tools/deploy-release.sh \
   dev-tools/rollback.sh "$OUT/"

if [[ -f dev-tools/release-public.pem ]]; then
  cp dev-tools/release-public.pem "$OUT/release-public.pem"
  echo "[INFO] Including release-public.pem (the updater of this build is active)."
else
  echo "[WARN] dev-tools/release-public.pem not found: the updater of this build stays inactive." >&2
fi

cat > "$OUT/RELEASE_INFO.txt" <<INFO
openScoreboard release
release:    ${RELEASE_NAME}
version:    ${VERSION}
git commit: $(git rev-parse HEAD)
git branch: $(git rev-parse --abbrev-ref HEAD)
built:      $(date -u +"%Y-%m-%dT%H:%M:%SZ")
built on:   $(hostname)
INFO

echo "[INFO] Installing production dependencies into the release..."
( cd "$OUT" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund )

# Guard: a native addon would be built for THIS machine's CPU, not the Pi's.
if NATIVE="$(find "$OUT/node_modules" -name '*.node' -print -quit)" && [[ -n "$NATIVE" ]]; then
  echo "Error: native addon found in production dependencies: $NATIVE" >&2
  echo "       Bundled node_modules would not run on the Pi (different CPU architecture)." >&2
  exit 1
fi

# Guard: the built server must be loadable at all.
node --check "$OUT/dist/bootstrap.js"

mkdir -p releases
TARBALL="releases/${RELEASE_NAME}.tar.gz"
# COPYFILE_DISABLE: macOS tar would otherwise add AppleDouble (._*) files to the archive.
COPYFILE_DISABLE=1 tar -czf "$TARBALL" -C "$STAGE_DIR" "$RELEASE_NAME"
# Same "<hash>  <file>" format as sha256sum (deploy-release.sh verifies it with `sha256sum -c`),
# but computed with Node because macOS has no sha256sum.
node -e '
  const fs = require("fs"), c = require("crypto"), f = process.argv[1];
  const h = c.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  fs.writeFileSync(f + ".sha256", h + "  " + require("path").basename(f) + "\n");
' "$TARBALL"

echo "[INFO] Done: ${TARBALL} ($(du -h "$TARBALL" | cut -f1))"
echo "TARBALL_PATH=${TARBALL}"
echo
echo "Next steps:"
echo "  node dev-tools/publish-release.mjs    (sign + publish to Compass, canary)"
echo "  ./dev-tools/deploy-to-pi.sh --skip-build <pi-user>@<pi-host>"
echo "  (builds + deploys in one step without --skip-build)"
