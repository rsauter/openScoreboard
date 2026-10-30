#!/usr/bin/env bash
set -euo pipefail
# deploy-release.sh — openScoreboard (runs ON the target device)
#
# Installs a release tarball produced by package-release.sh using an
# immutable-release layout, so a bad release can be undone in seconds:
#
#   <base-dir>/                      default: ~/openscoreboard
#     releases/<release-name>/       one folder per release, never modified
#     current  -> releases/<name>    the active release (systemd runs this)
#     previous -> releases/<name>    the release that was active before
#     data/                          settings.json, license.json, device-secret.json,
#                                    state.json, state-archive/, .env  (shared)
#     backups/                       data snapshots taken before every deploy
#     dev-tools/                     deploy-release.sh, rollback.sh, kiosk script
#
# Deploy sequence — nothing live is touched until step 4:
#   1. Verify checksum (if a .sha256 file sits next to the tarball) and unpack
#      into a staging folder.
#   2. Validate the release (required files, node can parse it).
#   3. Smoke test: start the new release on a spare port with an empty temporary
#      data dir and wait for /api/health to report the new release name.
#   4. Snapshot data/, re-point `current`, (re)install the systemd unit, restart.
#   5. Health check: /api/health must report the new release and stay up for a
#      few seconds. If not, `current` is switched back automatically.
#   6. Prune old releases (the newest few are kept for rollback).
#
# Three starting situations are detected automatically:
#   - release layout already present → normal update
#   - brand-new/empty device         → first-time setup incl. systemd unit
#   - legacy flat install (dist/, settings.json, ... directly in <base-dir>)
#                                    → one-time migration into the layout above.
#     The old code is archived as releases/legacy-<timestamp>. If the first
#     release fails its health check, the legacy install is restored as it was.
#     (Legacy code does not know DATA_DIR, so it is NOT a rollback.sh target.)
#
# Usage:
#   bash deploy-release.sh /path/to/release.tar.gz [base-dir]
#
# Test hooks (not for production use):
#   OSB_SYSTEMCTL="<cmd>"  replaces `sudo systemctl`
#   OSB_SKIP_UNIT=1        skips installing/updating the systemd unit

RELEASE_TAR="${1:-}"
BASE_DIR="${2:-$HOME/openscoreboard}"
SERVICE_NAME="openscoreboard"
KEEP_RELEASES=3        # incl. current and previous
KEEP_BACKUPS=10
HEALTH_TIMEOUT=30      # seconds to wait for the new release to report healthy
STABLE_SECONDS=5       # must still be healthy after this many more seconds

if [[ -n "${OSB_SYSTEMCTL:-}" ]]; then
  read -r -a SYSTEMCTL <<< "$OSB_SYSTEMCTL"
else
  SYSTEMCTL=(sudo systemctl)
fi

log()  { echo "[INFO] $*"; }
warn() { echo "[WARN] $*" >&2; }
die()  { echo "Error: $*" >&2; exit 1; }

# #region ─── Helpers ────────────────────────────────────────────────────────

# Port the service listens on: PORT from data/.env, default 3000 (as in server.ts).
service_port() {
  local p=""
  if [[ -f "$BASE_DIR/data/.env" ]]; then
    p="$(grep -E '^PORT=' "$BASE_DIR/data/.env" | tail -1 | cut -d= -f2- | tr -d "\"' \r" || true)"
  fi
  echo "${p:-3000}"
}

# Prints the `release` field of /api/health on 127.0.0.1:<port>; fails if unreachable.
# Uses node (guaranteed to exist) instead of curl.
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

# wait_for_release <port> <expected-release> <timeout-seconds>
wait_for_release() {
  local deadline=$((SECONDS + $3)) got
  while (( SECONDS < deadline )); do
    got="$(health_release "$1" || true)"
    [[ "$got" == "$2" ]] && return 0
    sleep 1
  done
  return 1
}

# Atomically (re)points <base-dir>/<link> at releases/<name>.
switch_link() {
  ln -sfn "releases/$2" "$BASE_DIR/$1.tmp"
  mv -Tf "$BASE_DIR/$1.tmp" "$BASE_DIR/$1"
}

link_name() {
  [[ -L "$BASE_DIR/$1" ]] && basename "$(readlink "$BASE_DIR/$1")" || true
}

# Restarts the service and verifies that <release> is what answers, and keeps answering.
activate() {
  local name="$1" port
  port="$(service_port)"
  "${SYSTEMCTL[@]}" restart "$SERVICE_NAME" || return 1
  wait_for_release "$port" "$name" "$HEALTH_TIMEOUT" || return 1
  sleep "$STABLE_SECONDS"
  [[ "$(health_release "$port" || true)" == "$name" ]] || return 1
  "${SYSTEMCTL[@]}" is-active --quiet "$SERVICE_NAME"
}

# Starts a release on a spare port with a throw-away data dir and checks /api/health.
smoke_test() {
  local dir="$1" name="$2" port tmp pid ok=1
  port=$((20000 + RANDOM % 10000))
  tmp="$(mktemp -d)"
  ( cd "$dir" && exec env PORT="$port" DATA_DIR="$tmp" NODE_ENV=production \
      node dist/bootstrap.js > "$tmp/smoke.log" 2>&1 ) &
  pid=$!
  if wait_for_release "$port" "$name" 20; then ok=0; fi
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if (( ok != 0 )); then
    warn "Smoke test output:"
    tail -20 "$tmp/smoke.log" >&2 || true
  fi
  rm -rf "$tmp"
  return "$ok"
}

install_unit() {
  [[ "${OSB_SKIP_UNIT:-0}" == "1" ]] && return 0
  local template="$1" unit="/etc/systemd/system/${SERVICE_NAME}.service" rendered
  [[ -f "$template" ]] || { warn "No service template in this release — unit not touched."; return 0; }
  rendered="$(sed -e "s#__BASE_DIR__#$BASE_DIR#g" -e "s#__USER__#$(whoami)#g" "$template")"
  if [[ ! -f "$unit" ]] || [[ "$(cat "$unit")" != "$rendered" ]]; then
    log "Installing/updating systemd unit."
    printf '%s\n' "$rendered" | sudo tee "$unit" > /dev/null
    "${SYSTEMCTL[@]}" daemon-reload
    "${SYSTEMCTL[@]}" enable "$SERVICE_NAME"
  fi
}

LEGACY_DATA_ITEMS=(.env settings.json license.json device-secret.json state.json state-archive)
LEGACY_CODE_ITEMS=(dist node_modules package.json package-lock.json sports-templates RELEASE_INFO.txt)

# #endregion

# #region ─── Legacy migration ───────────────────────────────────────────────

LEGACY_TS=""

migrate_legacy() {
  LEGACY_TS="$(date -u +%Y%m%d-%H%M%S)"
  local f items=()
  log "Legacy flat install detected — migrating to the release layout."
  mkdir -p "$BASE_DIR/data" "$BASE_DIR/backups" "$BASE_DIR/releases/legacy-$LEGACY_TS"

  for f in "${LEGACY_DATA_ITEMS[@]}"; do [[ -e "$BASE_DIR/$f" ]] && items+=("$f"); done
  if (( ${#items[@]} )); then
    tar -czf "$BASE_DIR/backups/pre-migration-$LEGACY_TS.tgz" -C "$BASE_DIR" "${items[@]}"
    log "Backed up installation data to backups/pre-migration-$LEGACY_TS.tgz"
  fi
  if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
    cp "/etc/systemd/system/${SERVICE_NAME}.service" "$BASE_DIR/backups/${SERVICE_NAME}.service.pre-migration-$LEGACY_TS"
  fi

  "${SYSTEMCTL[@]}" stop "$SERVICE_NAME" || true
  for f in "${items[@]}"; do mv "$BASE_DIR/$f" "$BASE_DIR/data/$f"; done
  for f in "${LEGACY_CODE_ITEMS[@]}"; do
    [[ -e "$BASE_DIR/$f" ]] && mv "$BASE_DIR/$f" "$BASE_DIR/releases/legacy-$LEGACY_TS/$f"
  done
}

# Puts the legacy install back exactly as it was (used if the first release fails).
restore_legacy() {
  warn "Restoring the legacy install from before the migration..."
  local f
  "${SYSTEMCTL[@]}" stop "$SERVICE_NAME" || true
  rm -f "$BASE_DIR/current" "$BASE_DIR/previous"
  for f in "${LEGACY_DATA_ITEMS[@]}"; do
    [[ -e "$BASE_DIR/data/$f" ]] && mv "$BASE_DIR/data/$f" "$BASE_DIR/$f"
  done
  for f in "${LEGACY_CODE_ITEMS[@]}"; do
    [[ -e "$BASE_DIR/releases/legacy-$LEGACY_TS/$f" ]] && mv "$BASE_DIR/releases/legacy-$LEGACY_TS/$f" "$BASE_DIR/$f"
  done
  if [[ -f "$BASE_DIR/backups/${SERVICE_NAME}.service.pre-migration-$LEGACY_TS" && "${OSB_SKIP_UNIT:-0}" != "1" ]]; then
    sudo cp "$BASE_DIR/backups/${SERVICE_NAME}.service.pre-migration-$LEGACY_TS" "/etc/systemd/system/${SERVICE_NAME}.service"
    "${SYSTEMCTL[@]}" daemon-reload
  fi
  mkdir -p "$BASE_DIR/failed"
  [[ -d "$BASE_DIR/releases/$NAME" ]] && mv "$BASE_DIR/releases/$NAME" "$BASE_DIR/failed/$NAME"
  rmdir "$BASE_DIR/releases/legacy-$LEGACY_TS" "$BASE_DIR/releases" "$BASE_DIR/data" 2>/dev/null || true
  "${SYSTEMCTL[@]}" restart "$SERVICE_NAME" || true
  # Any answer from /api/health counts here — the legacy build may predate the `release` field.
  local deadline=$((SECONDS + 20)) up=false
  while (( SECONDS < deadline )); do
    if health_release "$(service_port)" > /dev/null; then up=true; break; fi
    sleep 1
  done
  if [[ "$up" == true ]]; then
    warn "Legacy install restored and answering. The failed release is kept in $BASE_DIR/failed/$NAME."
  else
    warn "Legacy install restored, but it is NOT answering on /api/health. Check: journalctl -u $SERVICE_NAME -n 50"
  fi
}

# #endregion

# ─── Preconditions ──────────────────────────────────────────────────────────

if [[ -z "$RELEASE_TAR" || ! -f "$RELEASE_TAR" ]]; then
  echo "Usage: bash deploy-release.sh /path/to/release.tar.gz [base-dir]" >&2
  exit 1
fi
command -v node > /dev/null || die "node not found on PATH."

# Decide which situation we are in.
MODE=""
if [[ -L "$BASE_DIR/current" ]]; then
  MODE="update"
elif [[ -f "$BASE_DIR/package.json" ]]; then
  grep -q '"name": "openscoreboard"' "$BASE_DIR/package.json" \
    || die "$BASE_DIR has a package.json, but it is not an openScoreboard install."
  MODE="legacy"
elif [[ ! -d "$BASE_DIR" || -z "$(ls -A "$BASE_DIR" 2>/dev/null)" ]]; then
  MODE="fresh"
else
  die "$BASE_DIR is non-empty but doesn't look like an openScoreboard install. Use an empty/nonexistent directory for first-time setup."
fi
log "Mode: $MODE (base dir: $BASE_DIR)"

mkdir -p "$BASE_DIR"
STAGE_DIR="$(mktemp -d "$BASE_DIR/.incoming-XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

# ─── 1. Verify + unpack ─────────────────────────────────────────────────────

if [[ -f "${RELEASE_TAR}.sha256" ]]; then
  ( cd "$(dirname "$RELEASE_TAR")" && sha256sum -c "$(basename "${RELEASE_TAR}.sha256")" > /dev/null ) \
    || die "Checksum mismatch — the tarball is corrupt or was not fully transferred."
  log "Checksum OK."
else
  warn "No .sha256 file next to the tarball — skipping checksum verification."
fi

log "Unpacking $(basename "$RELEASE_TAR")..."
tar -xzf "$RELEASE_TAR" -C "$STAGE_DIR"
RELEASE_DIR="$(find "$STAGE_DIR" -mindepth 1 -maxdepth 1 -type d)"
[[ -n "$RELEASE_DIR" && "$(echo "$RELEASE_DIR" | wc -l)" -eq 1 ]] \
  || die "Unexpected tarball layout (expected exactly one top-level release folder)."
NAME="$(basename "$RELEASE_DIR")"

# ─── 2. Validate ────────────────────────────────────────────────────────────

for required in dist/bootstrap.js node_modules/express/package.json package.json RELEASE_INFO.txt; do
  [[ -e "$RELEASE_DIR/$required" ]] || die "Release is incomplete: $required is missing."
done
grep -q "^release:[[:space:]]*${NAME}\$" "$RELEASE_DIR/RELEASE_INFO.txt" \
  || die "RELEASE_INFO.txt does not name this release ($NAME) — refusing to deploy."
node --check "$RELEASE_DIR/dist/bootstrap.js"
log "Deploying:"
sed 's/^/  /' "$RELEASE_DIR/RELEASE_INFO.txt"

if [[ "$MODE" == "update" && "$(link_name current)" == "$NAME" ]]; then
  log "$NAME is already the active release — nothing to do."
  exit 0
fi
[[ ! -e "$BASE_DIR/releases/$NAME" ]] || die "releases/$NAME already exists but is not active. Remove it first if you want to redeploy it."

# ─── 3. Smoke test (live install untouched) ─────────────────────────────────

log "Smoke test: starting the new release on a spare port..."
smoke_test "$RELEASE_DIR" "$NAME" || die "Smoke test failed — the new release does not start. Nothing was changed."
log "Smoke test passed."

# ─── 4. Switch ──────────────────────────────────────────────────────────────

if [[ "$MODE" == "legacy" ]]; then
  migrate_legacy
fi
mkdir -p "$BASE_DIR/releases" "$BASE_DIR/data" "$BASE_DIR/backups"
mv "$RELEASE_DIR" "$BASE_DIR/releases/$NAME"
touch "$BASE_DIR/releases/$NAME"   # mtime = deploy time, used for pruning order

PREV="$(link_name current)"
if [[ "$MODE" == "update" ]] && [[ -n "$(ls -A "$BASE_DIR/data" 2>/dev/null)" ]]; then
  TS="$(date -u +%Y%m%d-%H%M%S)"
  tar -czf "$BASE_DIR/backups/pre-$NAME-$TS.tgz" -C "$BASE_DIR/data" .
  log "Data snapshot: backups/pre-$NAME-$TS.tgz"
fi

switch_link current "$NAME"
install_unit "$BASE_DIR/releases/$NAME/openscoreboard.service.template"

# ─── 5. Health check, automatic rollback ────────────────────────────────────

log "Restarting service and waiting for ${NAME} to report healthy..."
if activate "$NAME"; then
  [[ -n "$PREV" ]] && switch_link previous "$PREV"
  log "Release $NAME is live."
else
  warn "Release $NAME failed its health check."
  "${SYSTEMCTL[@]}" status "$SERVICE_NAME" --no-pager -l 2>&1 | head -15 >&2 || true
  mkdir -p "$BASE_DIR/failed"
  if [[ "$MODE" == "legacy" ]]; then
    restore_legacy
    die "Deploy failed; the previous (legacy) install was restored."
  elif [[ -n "$PREV" ]]; then
    warn "Rolling back to $PREV..."
    switch_link current "$PREV"
    if activate "$PREV"; then
      mv "$BASE_DIR/releases/$NAME" "$BASE_DIR/failed/$NAME" 2>/dev/null || true
      die "Deploy failed; rolled back to $PREV (running OK). Failed release kept in $BASE_DIR/failed/$NAME."
    fi
    die "Deploy failed AND the rollback to $PREV did not become healthy either. Check: journalctl -u $SERVICE_NAME -n 50"
  else
    die "First-time deploy failed. Check: journalctl -u $SERVICE_NAME -n 50"
  fi
fi

# ─── 6. Housekeeping ────────────────────────────────────────────────────────

# Keep the device-side tooling in step with the deployed release.
mkdir -p "$BASE_DIR/dev-tools"
if [[ "$(readlink -f "$0" 2>/dev/null)" != "$(readlink -f "$BASE_DIR/dev-tools/deploy-release.sh" 2>/dev/null)" ]]; then
  cp "$0" "$BASE_DIR/dev-tools/deploy-release.sh"
fi
for f in rollback.sh start-display-kiosk.sh; do
  [[ -f "$BASE_DIR/releases/$NAME/$f" ]] && cp "$BASE_DIR/releases/$NAME/$f" "$BASE_DIR/dev-tools/$f" && chmod +x "$BASE_DIR/dev-tools/$f"
done

# Prune: always keep current + previous, fill up to KEEP_RELEASES with the newest others.
CURRENT_NAME="$(link_name current)"; PREVIOUS_NAME="$(link_name previous)"
KEPT=0
while IFS= read -r dir; do
  rel="$(basename "$dir")"
  if [[ "$rel" == "$CURRENT_NAME" || "$rel" == "$PREVIOUS_NAME" ]]; then KEPT=$((KEPT + 1)); continue; fi
  if (( KEPT < KEEP_RELEASES )); then KEPT=$((KEPT + 1)); continue; fi
  log "Pruning old release $rel"
  rm -rf "$dir"
done < <(ls -1dt "$BASE_DIR"/releases/*/ 2>/dev/null | sed 's#/$##')
ls -1t "$BASE_DIR"/backups/pre-*.tgz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
ls -1dt "$BASE_DIR"/failed/*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf

if [[ "$MODE" == "fresh" ]]; then
  echo
  log "First-time setup complete. settings.json/license.json don't exist yet — the app"
  log "runs with defaults (PIN 0000) until you change them in Settings. Put an optional"
  log ".env (PORT, FLEET_*) into $BASE_DIR/data/ and restart the service."
fi
if [[ "$MODE" == "legacy" ]]; then
  log "Migration complete. Old code is archived in releases/legacy-$LEGACY_TS (not a rollback target)."
fi
log "Deploy complete. Roll back with: bash $BASE_DIR/dev-tools/rollback.sh"
