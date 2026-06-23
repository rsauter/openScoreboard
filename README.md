# Open Scoreboard

A free, open-source sports scoreboard for floorball, hockey, and other sports.  
No database. No Docker. Just `npm install && npm start`.

> **Free for your club.** Use, modify, and run openScoreboard for your own
> club, league, or federation — even at ticketed or sponsored events — at no
> cost. Reselling it as a hosted/managed service to other organizations
> requires a commercial agreement (see [License](#license)).

## Features

- Live scoreboard with WebSocket sync across all connected devices
- Configurable sport templates via YAML files
- Penalty tracking with queue, badge (misconduct), and companion penalty support
- Timeout management
- Crash recovery via local `state.json`
- Multilingual UI (DE / FR / IT / EN)
- Integrated manual with usage instructions (`/help`)
- TV/projector display output (`/display.html`)

## Quick Start

```bash
git clone https://github.com/rsauter/openscoreboard.git
cd openscoreboard
npm install
npm run quickstart
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

`npm run quickstart` builds the app and starts the server in one step —
ideal for trying it out or a first-time setup.

For development (hot reload):

```bash
npm run dev
```

For production use (e.g. on a Raspberry Pi via systemd), build once and
start separately, so restarts are fast:

```bash
npm run build
npm start
```

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP port for the server | `3000` |
| `OPERATOR_PIN` | Fixed operator PIN. If unset, a PIN is generated and stored in `settings.json` on first run | auto-generated |

## Sport Templates

Templates are YAML files in the `sports-templates/` directory.  
Edit them with any text editor — the server loads them on startup.

```yaml
slug: my-sport
name: My Sport
isDefault: false

periods:
  count: 3
  durationMinutes: 20
  breakMinutes: 10

overtime:
  enabled: true
  periods: 1
  durationMinutes: 5
  suddenDeath: true
  breakMinutes: 5

shootout:
  enabled: true
  breakMinutes: 3

penalties:
  maxActiveSlots: 2
  queueEnabled: true
  queueOrderEditable: true
  types:
    - id: minor
      label: "2 Min"
      durationSeconds: 120
      displayMode: slot
      clearableByGoal: true
    - id: major
      label: "5 Min"
      durationSeconds: 300
      displayMode: slot
      clearableByGoal: false
```

Mark a template as `isDefault: true` to pre-select it in the GameStart view.

## Views

| URL | Purpose |
|-----|---------|
| `/` | GameStart — configure and launch a game |
| `/operator` | Live game control (score, clock, penalties) |
| `/display.html` | TV/projector output |
| `/settings` | Language and display preferences |
| `/help` | Integrated manual |

## Crash Recovery

The server writes `state.json` every 5 seconds during an active game.  
On restart, it attempts to restore the last unfinished game.  
The file is deleted when a game ends or is reset.

> **Note:** Crash recovery is implemented and works in normal testing, but has
> not yet been verified end-to-end under all real-world failure conditions
> (e.g. power loss mid-write). Treat it as a safety net, not a guarantee —
> feedback from real-world use is welcome.

## Port Configuration

Default port is `3000`. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## Architecture

For details on design decisions, deployment setup (Raspberry Pi, systemd),
and known limitations, see [ARCHITECTURE.md](./ARCHITECTURE.md).

## License

openScoreboard is source-available under the
[Business Source License 1.1](./LICENSE).

In short:
- You may use, copy, modify, and run this software freely — including for
  your own club, league, or federation, even if you charge admission or
  accept sponsorship.
- You may **not** offer this software (or a derivative of it) as a hosted,
  managed, or supported product/service to other organizations without a
  separate commercial agreement.
- On **2029-06-23**, this version automatically becomes available under the
  Apache License 2.0.

Interested in a managed rollout, hardware delivery, or federation-branded
deployment? Get in touch via [sluiten-scoreboard.com](https://sluiten-scoreboard.com).