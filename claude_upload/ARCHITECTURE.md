# openScoreboard — Architecture Notes

## What is this?

Open-source variant of the scoreboard system, as a standalone repo:
**https://github.com/rsauter/openscoreboard**

Split off from `sluitenScoreboard` (Matchuhr) — deliberately greenfield, not
a fork. Both codebases are expected to diverge over time.

## Core principle: no infrastructure

- **No Docker, no database, no Prisma.**
- Target deployment: `git clone && npm install && npm start` — runs on a
  Raspberry Pi. **Confirmed working on Pi 3B (1 GB RAM) with Raspberry Pi OS
  Lite 64-bit** — see "Raspberry Pi OS: Lite vs. Desktop" below for the
  memory data behind this recommendation.
- YAML files in `sports-templates/` are the **only** source for sport
  configurations (no database sync as in Matchuhr).

## Components (only 3, deliberately reduced)

1. **GameStart** (`/`) — teams as free text + colour (no autocomplete, no
   team database), sport template via dropdown, sourced from YAML templates
2. **Operator** (`/operator`) — live game control
3. **Display** (`/display.html`) — TV/projector output, separate Vite entry
   point, no vue-i18n, own locale handling via localStorage

**Deliberately NOT included:** Dashboard, Manager, team/player management,
planned matches, database-backed template management.

## Key technical decisions (as of chore/init)

### Templates matched via `slug`, not `name` or period configuration
`SportsTemplate.slug` is the stable, unique identifier (sourced from the
YAML field `slug`, falling back to the filename without extension). The
server detects duplicates on load and skips them with an error message
instead of crashing. The `SET_CONFIG` client command carries `templateSlug`,
so the server can unambiguously assign the correct penalty configuration
(penalty durations, slots, queue) when a game is started. Matching by
period count/duration was the original (error-prone) approach and was
discarded.

### `PROJECT_ROOT` fix for dev vs. prod paths
In dev mode (`tsx`, run from the project root), `__dirname` points to the
project root, but in the production build (`dist/server.js`) it points to
`dist/`. Without a fix, `sports-templates/`, `public/`, and `state.json`
were not found in the build. Solution: a `PROJECT_ROOT` constant that
detects whether `__dirname` ends in `.../dist` and, if so, goes up one
level.

### State recovery without a database
`state.json` lives in the project root and is written every 5 seconds
during an active game (not in the `pregame`/`ended` state); it is deleted
when a game ends or is reset. On server start, an unfinished game is
automatically restored. The file is listed in `.gitignore` (a pure runtime
artifact).

**Verified in practice (not just reviewed in logic):** during the Pi 3
deployment test, an active game was interrupted both by closing the SSH
session running `npm start` and by a full `sudo reboot` mid-game. In both
cases, the systemd-managed service came back up and correctly restored the
in-progress game (score, phase, remaining time) from `state.json` without
manual intervention.

### The Vite dev server needs a proxy
`vite.config.ts` requires a `server.proxy` block forwarding `/api` and
`/socket` to `http://localhost:3000` (WebSocket: `ws: true`). Without this,
`fetch()` calls in dev mode (Vite running on its own port, e.g. 5173) go
nowhere — the symptom was an empty template dropdown despite the YAML
templates being loaded correctly on the server side.

### `tsconfig.server.json`
A separate tsconfig for the server build (`vite build && tsc --project
tsconfig.server.json`). Uses `module: Node16` / `moduleResolution: Node16`
(not the deprecated `"node"` option, which throws a deprecation error under
newer TypeScript versions).

## Deployment

### Railway (currently live)
- The Custom Build Command **must** explicitly be `npm install && npm run
  build` — a custom build command appears to skip Railpack's automatic
  install step, which led to `npm: not found` (exit code 127).
- Root Directory: `/` (repo root, where `package.json` lives).
- Cost: negligible for sporadic use (cent range per game day at 0.5
  vCPU/256MB). At 24/7 uptime, roughly $10–12/month. Currently on Railway's
  "Free Trial" ($5 one-time credit, 30-day limit) — afterwards a switch to
  the Hobby plan ($5/month) will be needed.

### Raspberry Pi (tested on hardware, venue use)

**Confirmed working setup: Pi 3B, Raspberry Pi OS Lite 64-bit, Node.js 22,
no Chromium kiosk.** The earlier assumption that a Pi 4 and 2 GB RAM are
required (because of a Chromium kiosk) does not hold for the current usage
pattern, where the operator and display are accessed from regular browsers
on other devices on the same network (laptop, tablet, TV browser pointed
at `/display.html`) rather than from a kiosk running locally on the Pi
itself. Under that pattern, a Pi 3 with 1 GB RAM running headless (no
desktop environment) is sufficient — see memory data below.

If a future requirement needs a Chromium kiosk running directly on the
Pi (e.g. no separate TV/browser device available), the Pi 4 / 2 GB
recommendation should be re-evaluated specifically for that scenario, since
Chromium itself is the memory-heavy component, not openScoreboard.

#### Raspberry Pi OS: Lite vs. Desktop (memory comparison)

Tested on two Pi 3B units, otherwise identical hardware and openScoreboard
version, using `free -h`:

| State | Used | Available | Swap used |
|---|---|---|---|
| Lite, openScoreboard running | 176 Mi | 729 Mi | 0 B |
| Desktop, idle (GUI active, no app) | 376 Mi | 529 Mi | 17 Mi |
| Desktop, openScoreboard running (GUI active) | 262 Mi | 643 Mi | **172 Mi** |
| Desktop, openScoreboard running (GUI disabled via `systemctl set-default multi-user.target`) | 224 Mi | 680 Mi | 0 B |

**Conclusion:** Desktop's GUI alone uses ~376 Mi of the Pi 3's 1 GB before
the app even runs. With the GUI active, running openScoreboard pushes the
system into active swapping (172 Mi), which on a microSD card means real
performance degradation and extra wear. Disabling the desktop GUI
(`raspi-config` → boot to console, or `sudo systemctl set-default
multi-user.target`) recovers most of the difference (0 swap, 680 Mi
available) but Lite remains ~50 Mi leaner even then, presumably due to
background services (Bluetooth, printing, etc.) still installed but idle.

**Recommendation: use Raspberry Pi OS Lite for venue deployments.** Desktop
with GUI disabled is a viable fallback if a desktop environment is needed
for other reasons on the same device, but offers no advantage for a
dedicated scoreboard Pi.

#### Setup notes
- The Pi 4 (2019 model onward) has built-in Wi-Fi + Bluetooth, no dongle
  needed. Pi 3B also has built-in Wi-Fi/Bluetooth.
- Wi-Fi: multiple networks can be stored simultaneously via
  NetworkManager (`nmcli connection add type wifi ...`); the Pi connects
  automatically to whichever known network is in range, with optional
  `connection.autoconnect-priority` to prefer one over another. Tested
  successfully for a home network plus a venue (arena) WPA2 network added
  in advance, without needing to be on-site.
- SSH is disabled by default on a fresh Raspberry Pi OS install; enable via
  `sudo systemctl enable ssh && sudo systemctl start ssh` (or during
  imaging via Raspberry Pi Imager's advanced options).
- Autostart/crash recovery: a systemd service
  (`/etc/systemd/system/openscoreboard.service`) with `Restart=on-failure`
  runs `node dist/server.js` from the project's `WorkingDirectory`. Starts
  automatically on boot (`enabled`), restarts automatically on crash, and
  keeps running independent of any SSH session. Confirmed working across a
  full power-cycle (`sudo reboot`) including correct `state.json` recovery
  of an in-progress game.
- Deployment/update flow on the Pi: `git pull && npm install && npm run
  build && sudo systemctl restart openscoreboard` — no reboot needed for a
  plain code update.
- microSD card note: a brand-new card failed `Raspberry Pi Imager`'s
  write-verification twice in a row when written via a USB-C dongle's SD
  slot. Reformatting the card (Disk Utility on macOS, MS-DOS/FAT, Master
  Boot Record scheme) and restarting Raspberry Pi Imager resolved it on the
  next attempt. If a verify failure recurs after reformatting, suspect the
  card reader/dongle rather than the card itself, and try an alternative
  reader before replacing the card again.
- With Wayland (the Bookworm default), community reports mention frequent
  kiosk issues — only relevant if a Chromium kiosk is used; not applicable
  to the current browser-based operator/display setup. If a kiosk is
  introduced later and problems arise, switch back to X11
  (`raspi-config` → Advanced Options → Wayland → X11).
- Important for venue use: disable screen saver/power saving if a kiosk is
  used, set a static IP/hostname for the Pi for predictable access, and
  rely on the systemd service (above) for automatic recovery after a power
  outage.

## Open items / next steps

- **Pi deployment tested successfully** on Pi 3B / Raspberry Pi OS Lite —
  see above. Still open: end-to-end crash recovery has now been observed
  informally (SSH disconnect + full reboot mid-game both recovered
  correctly) but has not been formally tested/documented as a repeatable
  procedure; avoid public reliability claims beyond what's been observed.
- On-site Wi-Fi provisioning UX for the Pi (captive hotspot / setup page)
  is still an open friction point — current approach requires the venue
  SSID/password to be known and added via `nmcli` in advance, not
  self-service on-site.
- `engines: { "node": ">=20" }` in `package.json` — confirmed present;
  Node 22 was used for the Pi 3 test deployment and works without the
  `EBADENGINE` warnings seen under Node 20 for some dependencies
  (`vue-i18n`, `@intlify/*`, `concurrently`, which request Node ≥22).
- Medium term: deliberate divergence from sluitenScoreboard is expected and
  accepted (no sync effort planned between the two repos)

### Client-side persistence: `localStorage` for all local state

All client-side persistent data is stored in `localStorage` — not
`sessionStorage`. Rationale: the operator must survive browser restarts
without re-authenticating; the display on the TV browser must survive page
reloads without losing its locale setting.

`sessionStorage` is not used anywhere intentionally.

All keys use the `osb.` namespace prefix to avoid collisions with other
tools on the same device:

| Key | Type | Description |
|-----|------|-------------|
| `osb.auth.token` | string | Operator auth token (set after PIN login) |
| `osb.locale` | string | Selected UI language (`de`/`fr`/`it`/`en`) |
| `osb.theme` | string | Selected DaisyUI theme name |

### Auth: PIN-based operator access

All routes except `/display.html` require a valid auth token. The PIN is
resolved in this order:

1. `settings.json` in the project root (written when operator changes PIN in Settings)
2. `OPERATOR_PIN` environment variable
3. Default `0000` (server logs a warning on startup; Statusbar shows a
   persistent warning to the operator)

`settings.json` is listed in `.gitignore` — it is never committed and
survives deployments only as long as the container/process persists. On
Railway (ephemeral containers), a redeployment resets to ENV or default.
On a Raspberry Pi (persistent process), it survives indefinitely.

**Flow:**
- `POST /api/auth/login` with `{ pin }` → returns `{ token }` (a random
  UUID, stored server-side in memory; no JWT, no crypto dependency)
- Token sent as `Authorization: Bearer <token>` on all protected REST calls
- WebSocket: token sent as first message `{ type: "AUTH", token }`; server
  closes connection if invalid
- Vue Router navigation guard checks `localStorage.getItem('osb.auth.token')`
  before entering any route except `/display` (which is a separate HTML file
  and never guarded)

## Conventions (shared with the sluitenScoreboard project)

- One Git branch per chat session, named identically
- Commits/push at the end of the session, new session = new chat
- Communication in German, code/logs in English
- `[INFO]`/`[WARN]`/`[ERROR]` prefixes instead of a logging library
- `#region`/`#endregion` blocks for code organisation
