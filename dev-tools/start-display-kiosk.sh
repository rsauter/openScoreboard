#!/usr/bin/env bash
set -euo pipefail
# start-display-kiosk.sh — openScoreboard
#
# Launches a bare X server with Chromium as its ONLY application (true
# kiosk mode) on the Pi's own HDMI output — deliberately NOT a full desktop
# environment (no window manager, no login session). Matches the
# Lite/headless Pi setup documented in ARCHITECTURE.md: X exists only for
# the duration of this one Chromium window.
#
# REQUIRES ROOT (run with sudo). An SSH session has no virtual terminal
# (VT) of its own the way a physical console login does — X fails with
# "Cannot open /dev/tty0 (Permission denied)" if started plainly over SSH.
# `openvt` allocates and attaches to a free VT instead, but needs root to
# do so.
#
# TRADE-OFF, deliberate for now (see ARCHITECTURE.md): running as root
# means Chromium's sandbox has to be disabled (--no-sandbox) — Chromium
# refuses to run sandboxed as uid 0 at all. Acceptable for a single-purpose
# kiosk that only ever loads openScoreboard's own /display.html, not for a
# general-purpose browser. The "proper" fix (a dedicated non-root kiosk
# user with logind/seat VT permissions via udev) is more setup than this
# warrants right now.
#
# Meant to run ON the Pi — trigger it remotely over SSH with -t so sudo
# can prompt for a password (skip -t/the prompt if you've set up
# passwordless sudo for this):
#   ssh -t <pi-user>@<pi-host> 'sudo bash ~/openscoreboard/dev-tools/start-display-kiosk.sh'
#
# To stop it again:
#   ssh -t <pi-user>@<pi-host> 'sudo pkill -f "Xorg :0"; sudo pkill -f "chromium.*--kiosk"'
#
# Usage:
#   sudo bash dev-tools/start-display-kiosk.sh [url]
# url defaults to http://localhost:3000/display.html

if [[ "$EUID" -ne 0 ]]; then
  echo "Error: run this with sudo (needed to attach to the local VT)." >&2
  echo "  ssh -t <pi-user>@<pi-host> 'sudo bash ~/openscoreboard/dev-tools/start-display-kiosk.sh'" >&2
  exit 1
fi

URL="${1:-http://localhost:3000/display.html}"

# Package/binary naming differs by OS: older Raspbian used "chromium-browser",
# current Raspberry Pi OS (Debian Bookworm base) just ships "chromium".
# Try both rather than hardcoding one and failing silently on the other.
CHROMIUM_BIN=""
for candidate in chromium-browser chromium; do
  if command -v "$candidate" &>/dev/null; then
    CHROMIUM_BIN="$(command -v "$candidate")"
    break
  fi
done
if [[ -z "$CHROMIUM_BIN" ]]; then
  echo "Error: neither chromium-browser nor chromium found on PATH." >&2
  echo "Install it first: sudo apt install --no-install-recommends chromium" >&2
  exit 1
fi
if ! command -v xinit &>/dev/null; then
  echo "Error: xinit not found." >&2
  echo "Install it first: sudo apt install --no-install-recommends xserver-xorg xinit" >&2
  exit 1
fi
if ! command -v openvt &>/dev/null; then
  echo "Error: openvt not found (usually part of the 'kbd' package)." >&2
  echo "Install it first: sudo apt install --no-install-recommends kbd" >&2
  exit 1
fi

# Clean up any previous kiosk session first, so re-running this script
# (e.g. after a code update) reliably gets a fresh window instead of
# failing to bind display :0 because a previous X is still holding it.
# Also remove any leftover log file from an earlier non-sudo run: modern
# kernels (fs.protected_regular) refuse to let root open-for-write a file
# in a sticky world-writable dir like /tmp if it's owned by a different
# user, so a stale log from a previous attempt can silently block this
# entire backgrounded command from ever starting.
pkill -f "Xorg :0" 2>/dev/null || true
pkill -f "chromium.*--kiosk" 2>/dev/null || true
rm -f /tmp/openscoreboard-kiosk.log
sleep 1

# Disable the translate prompt via Chromium's enterprise policy mechanism,
# not just command-line flags. The --disable-translate /
# --disable-features=Translate,TranslateUI flags below proved insufficient
# on this Chromium version — Google renames the internal feature flags
# often enough that they're not reliable across versions. The managed
# policy file is the one mechanism Chromium consistently honors regardless
# of version. Written to both possible policy directories since the
# package name (and therefore its policy path) differs between "chromium"
# and "chromium-browser" — harmless to write the one that doesn't apply,
# Chromium simply won't find anything there to read.
for policy_dir in /etc/chromium/policies/managed /etc/chromium-browser/policies/managed; do
  mkdir -p "$policy_dir"
  cat > "$policy_dir/openscoreboard-kiosk.json" <<'POLICY_EOF'
{
  "TranslateEnabled": false
}
POLICY_EOF
done

setsid nohup openvt -f -- xinit "$CHROMIUM_BIN" \
  --kiosk \
  --no-sandbox \
  --autoplay-policy=no-user-gesture-required \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-features=Translate,TranslateUI \
  --disable-session-crashed-bubble \
  --check-for-update-interval=31536000 \
  "$URL" \
  -- :0 -nocursor \
  > /tmp/openscoreboard-kiosk.log 2>&1 < /dev/null &
disown

sleep 2
echo "[INFO] Kiosk starting against $URL"
echo "[INFO] Logs: /tmp/openscoreboard-kiosk.log"
echo "[INFO] To stop: sudo pkill -f 'Xorg :0'; sudo pkill -f 'chromium.*--kiosk'"