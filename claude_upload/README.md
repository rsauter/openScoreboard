# Open Scoreboard

A free, open-source sports scoreboard for floorball, hockey, and other sports.  
No database. No Docker. Just `npm install && npm start`.

## Features

- Live scoreboard with WebSocket sync across all connected devices
- Configurable sport templates via YAML files
- Penalty tracking with queue, badge (misconduct), and companion penalty support
- Timeout management
- Crash recovery via local `state.json`
- Multilingual UI (DE / FR / IT / EN)
- TV/projector display output (`/display.html`)

## Quick Start

```bash
git clone https://github.com/rsauter/openscoreboard.git
cd openscoreboard
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

For development (hot reload):

```bash
npm run dev
```

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

## Crash Recovery

The server writes `state.json` every 5 seconds during an active game.  
On restart, it automatically restores the last unfinished game.  
The file is deleted when a game ends or is reset.

## Port Configuration

Default port is `3000`. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

## License

MIT