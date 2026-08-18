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

### Horn broadcasts to every connected client, configurable per role
The server broadcasts `{ type: 'BUZZER', reason, hornOutput }` over the same
WebSocket used for `STATE` — every connected client (Operator, every open
Display instance) receives it regardless of auth status, since `broadcast()`
iterates all sockets unconditionally. `hornOutput` (`'operator' | 'display' |
'both'`, set once per venue/device in **Settings**, not per game) travels
with the message itself, resolved fresh from `settings.json` at broadcast
time — changing it in Settings takes effect on the very next horn, no need
to push a live config-changed event to already-connected clients.

Each client checks `hornOutput` **before** attempting `Audio.play()`, not
after. This matters because of the next point:

**Browser autoplay policy.** Chrome (and Chromium-based kiosks) blocks
unmuted `Audio.play()` until the page has received at least one user
gesture. The Operator gets this "for free" via PIN login/button clicks; the
Display is a passive, unattended view and never gets one on its own.
Solution: `playBuzzer()` tries to play regardless, and if the *first*
attempt is rejected, a small non-blocking corner hint ("Tap to enable
sound") appears — any click anywhere on the page unlocks it permanently for
that browser tab (Chrome remembers a gesture for the page's whole lifetime).
Crucially, if `hornOutput` excludes a client's own role, that client never
calls `play()` at all — so a Display that isn't supposed to make sound can
never show this hint to the audience on the public-facing video wall, and a
muted Operator setup won't try to play either.

**For an unattended Display (Pi kiosk or a notebook feeding a beamer with
nobody there to tap anything), the tap-hint is not a usable unlock
mechanism** — there's no touchscreen/mouse. The real fix is starting
Chrome/Chromium with:

```
--autoplay-policy=no-user-gesture-required
```

With this flag, the browser never blocks in the first place, so the hint
simply never appears — no interaction needed. See "Setup notes" below for
concrete startup commands. This flag has no effect on the hint's absence
when `hornOutput` already excludes the Display; the two mechanisms address
different problems (whether the client should try to play at all, vs.
whether the browser lets a client that *should* play actually do so
unattended).

### Templates matched via `slug`, not `name` or period configuration
`SportsTemplate.slug` is the stable, unique identifier (sourced from the
YAML field `slug`, falling back to the filename without extension). The
server detects duplicates on load and skips them with an error message
instead of crashing. The `SET_CONFIG` client command carries `templateSlug`,
so the server can unambiguously assign the correct penalty configuration
(penalty durations, slots, queue) when a game is started. Matching by
period count/duration was the original (error-prone) approach and was
discarded.

A template missing a valid `name` field is skipped the same way (logged,
not fatal) — a single malformed YAML file must never take the whole server
down with it. This was previously not the case: `loadYamlTemplates()`'s
final sort called `.localeCompare()` directly on `name`, so one bad
template crashed the entire process on every restart (systemd's
auto-restart loop just kept re-crashing it). Found via a real deploy where
one `sports-templates/*.yaml` file ended up without a usable `name` at
runtime; root cause of *why* that file lacked one wasn't conclusively
identified, but the fix makes the failure mode itself harmless either way.

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

### Fixed dev port (5174), not Vite's default
Vite's default dev port (5173) is also `scoreboardFLEET`'s default — and
Fleet has that exact port hard-coded into its OAuth redirect URIs at
Google/Microsoft/Infomaniak (see scoreboardFLEET's ARCHITECTURE notes).
Whichever of the two projects starts first used to grab 5173, silently
pushing the other onto 5174 — meaning Fleet's OAuth post-login redirect
would land on the wrong project (or nowhere) purely depending on start
order, with no error to point at why. Fixed by pinning openScoreboard's dev
port to `5174` with `strictPort: true`, so it never contends for 5173 and
fails loudly (instead of silently falling back) if 5174 is somehow already
taken by something else.

### `tsconfig.server.json`
A separate tsconfig for the server build (`vite build && tsc --project
tsconfig.server.json`). Uses `module: Node16` / `moduleResolution: Node16`
(not the deprecated `"node"` option, which throws a deprecation error under
newer TypeScript versions).

### Fleet device pairing (ADR-0015, Fleet-side) — short code flow
The Settings UI's "Mit Fleet verbinden" section calls this server's own
`POST /api/pairing/initiate`, which proxies to Fleet's
`POST {FLEET_URL}/api/pairing/initiate` (same "browser never talks to Fleet
directly" pattern as the existing `/api/license/pair` stub). Fleet returns a
short code (10 min validity) that the ClubAdmin enters into Fleet's own UI.
The browser then polls this server's `GET /api/pairing/status/:code` every
3 seconds, which itself proxies to Fleet's status endpoint. Once the code
is claimed, the resolved `organizationName` is persisted into `license.json`
immediately; `subscriptionStatus`/`licenseValidUntil` are a separate,
not-yet-designed concept (see "Open items" below) and are intentionally
left untouched by this flow.

The countdown shown to the user is recomputed from `Date.now()` vs.
`expiresAt` on every tick (same drift-resistant pattern as the game clock),
not a fixed decrement — so it stays correct even if the browser tab was
backgrounded or the laptop was asleep.

### Fleet device trust secret (ADR-0016, Fleet-side) — trust-on-first-use
Fleet now accepts an optional `deviceSecret` field on `POST /api/heartbeat`,
`POST /api/pairing/initiate`, and `POST /api/license/pair`. Whichever call
arrives first for a given `fleetInstanceId` establishes the secret on
Fleet's side; every later call must send the same value or Fleet rejects it.

This device's secret is generated once (256-bit random, hex-encoded) and
persisted in its own `device-secret.json` — deliberately **not** inside
`license.json`. `GET /api/license` returns the full `LicenseInfo` object
straight off disk for the Settings UI; keeping the secret in a separate file
that no route ever serializes back out means it structurally cannot leak to
the browser, even if `LicenseInfo` gains fields later. See
`src/server/deviceSecret.ts`.

`POST /api/instances/:id/profile` also accepts `deviceSecret` on the Fleet
side, but openScoreboard doesn't call that endpoint (no client-side profile
push exists yet), so it isn't wired up here.

### Bug fix: heartbeat was reporting a second, divergent instance ID
Before this change, `initFleetHeartbeat()` resolved `fleetInstanceId` by
reading `settings.json` — but an earlier session had already migrated that
value out of `settings.json` into `license.json` (see `ensureLicenseFile()`).
Since the field was gone from `settings.json`, the heartbeat code generated
a **new** random UUID on every restart and wrote it back to `settings.json`,
so heartbeats used a different instance ID than pairing/license calls did.
Fixed by having `server.ts` pass the already-resolved `license.json`
`fleetInstanceId` straight into `initFleetHeartbeat()`, removing the dead
settings.json-based resolution entirely.

### `license.json` was never gitignored
`license.json` contains this installation's `fleetInstanceId` and was
missing from `.gitignore` — unlike `settings.json` and `state.json`, which
are the same category of per-installation runtime file. Fixed alongside
adding the new `device-secret.json` to `.gitignore`. Worth checking git
history for any previously committed `license.json` on existing clones.

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

If a future requirement needs a Chromium kiosk running directly on the Pi
(e.g. no separate TV/browser device available), it does **not** require
switching to a full Desktop image or the Pi 4 / 2 GB recommendation below —
see `dev-tools/start-display-kiosk.sh`, which runs a bare `xinit` X session
with Chromium as its only application (no window manager, no login/desktop
session at all) directly on top of Lite. This is far lighter than a full
desktop environment; the memory comparison below is about Desktop vs. Lite
as the base OS, which is a separate question from whether a full desktop
environment is running at all.

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
  runs `node dist/bootstrap.js` from the project's `WorkingDirectory` — see
  `dev-tools/openscoreboard.service.template`. **Not `node dist/server.js`
  directly:** `bootstrap.ts` exists specifically to load `.env` before
  `server.ts`'s imports run (dynamic `import('./server')`, see the comment
  in `bootstrap.ts`); starting `server.js` directly silently skips that,
  so any `.env`-provided variable (e.g. `FLEET_HEARTBEAT_URL`) never
  reaches the process. An earlier manually-created systemd unit on the
  reference Pi had this wrong for some time — found when a from-scratch
  redeploy exposed it. Starts automatically on boot (`enabled`), restarts
  automatically on crash, and keeps running independent of any SSH
  session. Confirmed working across a full power-cycle (`sudo reboot`)
  including correct `state.json` recovery of an in-progress game.
- Deployment/update flow on the Pi: `git pull && npm install && npm run
  build && sudo systemctl restart openscoreboard` — no reboot needed for a
  plain code update. **Superseded by the packaged-release flow below** for
  day-to-day deploys; this git-based flow remains useful for one-off manual
  fixes directly on the device.
- **Packaged-release deploy (preferred over `git pull` on the Pi):** the Pi
  never runs `git` at all. `dev-tools/package-release.sh` (run on the dev
  machine) builds the app and tars up exactly what production needs —
  `dist/`, `package.json`, `package-lock.json`, `sports-templates/` — into
  `releases/<name>.tar.gz`. Per-installation runtime/data files
  (`settings.json`, `license.json`, `state.json`, `device-secret.json`,
  `state-archive/`) are never part of the tarball in the first place, so
  deploying can't clobber a venue's data — there's nothing to "exclude" at
  deploy time, it's excluded by construction at packaging time.
  `dev-tools/deploy-release.sh` lives permanently on the Pi and extracts a
  transferred tarball directly on top of the existing install, then runs
  `npm ci --omit=dev` and restarts the systemd service.
  `dev-tools/deploy-to-pi.sh <user>@<host>` on the dev machine chains
  package → `scp` → remote deploy into one command. See the scripts'
  header comments for exact usage.
- **If the Display device is unattended (no touchscreen/mouse to tap the
  autoplay hint) and `hornOutput` includes it:** start Chrome/Chromium with
  `--autoplay-policy=no-user-gesture-required` so the horn plays
  automatically from the first buzzer, with no interaction needed. This
  matters regardless of whether Chromium runs as a local kiosk on the Pi or
  in a regular browser on a separate notebook feeding the beamer via HDMI —
  the flag is what makes it unattended-safe, `--kiosk` alone only controls
  fullscreen chrome (no relation to sound).
  - **Pi / Linux kiosk (headless Lite install, no desktop environment):**
    `dev-tools/start-display-kiosk.sh` runs a bare `xinit` X session with
    Chromium as its only application — not a full desktop, no window
    manager, no login session — needed precisely because Pi OS Lite (the
    documented/recommended base — see "Raspberry Pi" above) has no X
    server running at all to attach a plain `chromium-browser --kiosk ...`
    command to over SSH. One-time OS prerequisite (a fresh Lite install has
    none of this): `sudo apt install --no-install-recommends xserver-xorg
    xinit chromium-browser`. Every release keeps the script itself current
    on the device (see "Packaged-release deploy" below); trigger it
    remotely once the board should go live:
    `ssh <pi-user>@<pi-host> 'bash ~/openscoreboard/dev-tools/start-display-kiosk.sh'`
  - **Linux with a desktop environment already running** (X or Wayland,
    e.g. a notebook, or a Pi deliberately set up with Desktop instead of
    Lite): the simpler direct command works, since a display to attach to
    already exists —
    `chromium-browser --kiosk --autoplay-policy=no-user-gesture-required
    --noerrdialogs --disable-infobars http://localhost:3000/display.html`
  - **Windows notebook:**
    `"C:\Program Files\Google\Chrome\Application\chrome.exe"
    --autoplay-policy=no-user-gesture-required --kiosk
    http://<pi-host>:3000/display.html`
  - **macOS notebook:** Chrome's `--kiosk` is unreliable on macOS (long-
    standing Chromium issue, not specific to this project) — start without
    it and switch to fullscreen manually (Cmd+Ctrl+F) instead:
    `open -n -a "Google Chrome" --args
    --autoplay-policy=no-user-gesture-required
    http://<pi-host>:3000/display.html`. The `-n` forces a genuinely new
    Chrome process — if Chrome is already running, `open -a` just
    refocuses the existing window and silently ignores the new `--args`.
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

- **Railway + Fleet pairing: ephemeral storage caveat (accepted for now).**
  `license.json` and `device-secret.json` are gitignored runtime files, same
  category as `settings.json` — on Railway's ephemeral containers, a
  redeployment resets them, meaning `fleetInstanceId` and `deviceSecret` are
  regenerated and Fleet sees it as a brand-new device requiring re-pairing.
  Not an issue on the Pi (persistent process/disk), which is the intended
  production target for real clients. Railway is treated as a staging/test
  environment for now, not a real Fleet-paired deployment target — if that
  changes, a persistent volume for the project root would be needed first.
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