# openScoreboard — Architecture Notes

## What is this?

Open-source variant of the scoreboard system, as a standalone repo:
**https://github.com/rsauter/openscoreboard**

Split off from `sluitenScoreboard` (Matchuhr) — deliberately greenfield, not
a fork. Both codebases are expected to diverge over time.

## Core principle: no infrastructure

- **No Docker, no database, no Prisma.**
- Target deployment: `git clone && npm install && npm start` — runs on a
  Raspberry Pi (Pi 4 or newer recommended, at least 2 GB RAM because of the
  Chromium kiosk).
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

### Raspberry Pi (planned/recommended for venue use)
- The Pi 4 (2019 model onward) has built-in Wi-Fi + Bluetooth, no dongle
  needed.
- At least 2 GB RAM recommended (Chromium kiosk mode is memory-hungry,
  >512 MB at idle alone).
- Setup sketch: the Pi runs the Node server locally, Chromium in kiosk mode
  displays `display.html` via HDMI on a projector/LED wall/video cube, and
  a laptop on the same network operates `/operator` via browser.
- With Wayland (the Bookworm default), community reports mention frequent
  kiosk issues — if problems arise, switch back to X11
  (`raspi-config` → Advanced Options → Wayland → X11).
- Important for venue use: disable screen saver/power saving, set a static
  IP/hostname for the Pi, configure autostart via systemd plus a Chromium
  autostart script for automatic recovery after a power outage.

## Open items / next steps

- Pi deployment has not yet been tested in practice (only worked through
  conceptually)
- Crash recovery (`state.json`) has not been verified end-to-end locally by
  killing the server during an active game — only the logic has been
  reviewed
- `engines: { "node": ">=20" }` in `package.json` was suggested; whether it
  was adopted is unclear — worth checking
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