#!/usr/bin/env bash
set -euo pipefail
# rollback.sh — openScoreboard (runs ON the target device)
#
# Switches back to an earlier release: re-points `current` and restarts the
# service. Takes seconds, needs no network and no build.
#
#   bash rollback.sh                  → back to the release in `previous`
#   bash rollback.sh <release-name>   → to a specific release in releases/
#   bash rollback.sh --list           → show available releases
#
# Optional second argument: base dir (default ~/openScoreboard).
#
# Data is NOT rolled back — settings, license, device secret and game state in
# data/ stay as they are, so a venue's PIN, Fleet identity and a running game
# survive. A snapshot of data/ is taken first (backups/pre-rollback-*.tgz).
# If the newer release changed a data file format that the older release can't
# read, restore the matching pre-deploy snapshot manually:
#   sudo systemctl stop openscoreboard
#   tar -xzf ~/openScoreboard/backups/pre-<release>-<ts>.tgz -C ~/openScoreboard/data
#   sudo systemctl start openscoreboard
#
# Test hook: OSB_SYSTEMCTL="<cmd>" replaces `sudo systemctl`.

ARG="${1:-}"
BASE_DIR="${2:-$HOME/openScoreboard}"
SERVICE_NAME="openscoreboard"
HEALTH_TIMEOUT=30
STABLE_SECONDS=5

if [[ -n "${OSB_SYSTEMCTL:-}" ]]; then
  read -r -a SYSTEMCTL <<< "$OSB_SYSTEMCTL"
else
  SYSTEMCTL=(sudo systemctl)
fi

log()  { echo "[INFO] $*"; }
warn() { echo "[WARN] $*" >&2; }
die()  { echo "Error: $*" >&2; exit 1; }

link_name() { [[ -L "$BASE_DIR/$1" ]] && basename "$(readlink "$BASE_DIR/$1")" || true; }

service_port() {
  local p=""
  if [[ -f "$BASE_DIR/data/.env" ]]; then
    p="$(grep -E '^PORT=' "$BASE_DIR/data/.env" | tail -1 | cut -d= -f2- | tr -d "\"' \r" || true)"
  fi
  echo "${p:-3000}"
}

health_release() {
  node -e '
    const http = require("http");
    const req = http.get({ host: "127.0.0.1", port: process.argv[1], path: "/api/health", timeout: 2000 }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => { try { console.log(JSON.parse(b).release || ""); } catch { process.exit(1); } });
    });
    req.on("error", () => process.exit(1));
    req.on("timeout", () => { req.destroy(); process.exit(1); });
  ' "$1" 2>/dev/null
}

wait_for_release() {
  local deadline=$((SECONDS + $3)) got
  while (( SECONDS < deadline )); do
    got="$(health_release "$1" || true)"
    [[ "$got" == "$2" ]] && return 0
    sleep 1
  done
  return 1
}

switch_link() {
  ln -sfn "releases/$2" "$BASE_DIR/$1.tmp"
  mv -Tf "$BASE_DIR/$1.tmp" "$BASE_DIR/$1"
}

activate() {
  local name="$1" port
  port="$(service_port)"
  "${SYSTEMCTL[@]}" restart "$SERVICE_NAME" || return 1
  wait_for_release "$port" "$name" "$HEALTH_TIMEOUT" || return 1
  sleep "$STABLE_SECONDS"
  [[ "$(health_release "$port" || true)" == "$name" ]] || return 1
  "${SYSTEMCTL[@]}" is-active --quiet "$SERVICE_NAME"
}

[[ -L "$BASE_DIR/current" ]] || die "$BASE_DIR has no release layout (no 'current' link) — nothing to roll back."
CURRENT="$(link_name current)"
PREVIOUS="$(link_name previous)"

if [[ "$ARG" == "--list" ]]; then
  for dir in $(ls -1dt "$BASE_DIR"/releases/*/ | sed 's#/$##'); do
    rel="$(basename "$dir")"; mark=""
    [[ "$rel" == "$CURRENT" ]] && mark=" <- current"
    [[ "$rel" == "$PREVIOUS" ]] && mark=" <- previous (default rollback target)"
    [[ "$rel" == legacy-* ]] && mark="$mark (legacy, not a rollback target)"
    echo "$rel$mark"
  done
  exit 0
fi

TARGET="${ARG:-$PREVIOUS}"
[[ -n "$TARGET" ]] || die "No previous release recorded. Use --list and pass a release name."
[[ "$TARGET" != legacy-* ]] || die "Legacy installs predate the shared data/ directory and can't be rolled back to."
[[ -d "$BASE_DIR/releases/$TARGET" ]] || die "Release '$TARGET' not found. Available: $(ls -1 "$BASE_DIR/releases" | tr '\n' ' ')"
[[ "$TARGET" != "$CURRENT" ]] || die "'$TARGET' is already the active release."

if [[ -n "$(ls -A "$BASE_DIR/data" 2>/dev/null)" ]]; then
  mkdir -p "$BASE_DIR/backups"
  tar -czf "$BASE_DIR/backups/pre-rollback-$(date -u +%Y%m%d-%H%M%S).tgz" -C "$BASE_DIR/data" .
fi

log "Rolling back: $CURRENT -> $TARGET"
switch_link current "$TARGET"
if activate "$TARGET"; then
  switch_link previous "$CURRENT"
  log "Rollback complete — $TARGET is live."
else
  warn "$TARGET did not become healthy. Switching back to $CURRENT..."
  switch_link current "$CURRENT"
  if activate "$CURRENT"; then
    die "Rollback to $TARGET failed; $CURRENT is running again."
  fi
  die "Rollback failed and $CURRENT is not healthy either. Check: journalctl -u $SERVICE_NAME -n 50"
fi
