import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { parse as parseYaml } from 'yaml';
import type { GameState, Penalty, PenaltyType, PenaltySettings, CompanionType, ClientCommand, ServerMessage, SportsTemplate, ArchivedStateInfo } from './src/shared/types';

// #region ─── Infrastructure ───────────────────────────────────────────────────

// In dev (tsx, run from project root) __dirname IS the project root.
// In prod (compiled to dist/server.js) __dirname is dist/, so go one level up.
const PROJECT_ROOT = __dirname.endsWith(path.sep + 'dist') ? path.join(__dirname, '..') : __dirname;

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(PROJECT_ROOT, 'public')));
app.use(express.json());

// #endregion

// #region ─── Default Penalty Config ───────────────────────────────────────────

const DEFAULT_PENALTY_TYPES: PenaltyType[] = [
  { id: 'minor',      label: '2 Min',   durationSeconds: 120, displayMode: 'slot',  clearableByGoal: true  },
  { id: 'major',      label: '5 Min',   durationSeconds: 300, displayMode: 'slot',  clearableByGoal: false },
  { id: 'misconduct', label: "10'",     durationSeconds: 600, displayMode: 'badge', clearableByGoal: false },
  { id: 'minor2p2',   label: '2+2 Min', durationSeconds: 240, displayMode: 'slot',  clearableByGoal: true, chainSeconds: 120 },
];

const DEFAULT_PENALTY_SETTINGS: PenaltySettings = {
  maxActiveSlots: 2, queueEnabled: true, queueOrderEditable: true,
};

// #endregion

// #region ─── YAML Template Loading ───────────────────────────────────────────

let loadedTemplates: SportsTemplate[] = [];

function loadYamlTemplates(): void {
  const dir = path.join(PROJECT_ROOT, 'sports-templates');
  if (!fs.existsSync(dir)) {
    console.warn('[WARN] sports-templates directory not found, using no templates');
    return;
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  const results: SportsTemplate[] = [];

  for (const file of files) {
    try {
      const raw  = fs.readFileSync(path.join(dir, file), 'utf-8');
      const data = parseYaml(raw) as any;

      const slug = data.slug ?? file.replace(/\.ya?ml$/, '');
      if (results.some(t => t.slug === slug)) {
        console.error(`[ERROR] Duplicate template slug "${slug}" in ${file} — skipping (slugs must be distinct)`);
        continue;
      }

      const tmpl: SportsTemplate = {
        id:              results.length + 1,   // Stable order-based ID (no DB)
        slug,
        name:            data.name,
        numPeriods:      data.periods?.count          ?? 3,
        periodDuration:  data.periods?.durationMinutes ?? 20,
        breakDuration:   data.periods?.breakMinutes    ?? 10,
        hasOvertime:     data.overtime?.enabled        ?? false,
        numOtPeriods:    data.overtime?.periods        ?? 1,
        otDuration:      data.overtime?.durationMinutes ?? 5,
        otSuddenDeath:   data.overtime?.suddenDeath    ?? true,
        otBreakDuration: data.overtime?.breakMinutes   ?? 5,
        hasShootout:     data.shootout?.enabled        ?? false,
        soBreakDuration: data.shootout?.breakMinutes   ?? 5,
        isDefault:       data.isDefault               ?? false,
        createdAt:       new Date().toISOString(),
        penaltyTypes:    (data.penalties?.types ?? []).map((t: any) => ({
          id:              t.id,
          label:           t.label,
          durationSeconds: t.durationSeconds,
          displayMode:     t.displayMode ?? 'slot',
          clearableByGoal: t.clearableByGoal ?? true,
          chainSeconds:    t.chainSeconds,
        })),
        penaltySettings: {
          maxActiveSlots:     data.penalties?.maxActiveSlots     ?? 2,
          queueEnabled:       data.penalties?.queueEnabled       ?? true,
          queueOrderEditable: data.penalties?.queueOrderEditable ?? true,
        },
      };
      results.push(tmpl);
    } catch (e: any) {
      console.error(`[ERROR] Failed to load template ${file}: ${e.message}`);
    }
  }

  // Sort: default first, then alphabetically
  results.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return  1;
    return a.name.localeCompare(b.name);
  });

  // Re-assign IDs after sort
  results.forEach((t, i) => { t.id = i + 1; });

  loadedTemplates = results;
  console.log(`[INFO] Loaded ${results.length} sport template(s) from sports-templates/`);
}

// #endregion

// #region ─── Game State ───────────────────────────────────────────────────────

const STATE_FILE   = path.join(PROJECT_ROOT, 'state.json');
const ARCHIVE_DIR  = path.join(PROJECT_ROOT, 'state-archive');

function createInitialState(): GameState {
  return {
    numPeriods: 3, periodDuration: 1200, breakDuration: 600,
    hasOvertime: true, numOtPeriods: 1, otDuration: 300, otSuddenDeath: true,
    otBreakDuration: 300, hasShootout: true, soBreakDuration: 180,
    penaltyTypes:    DEFAULT_PENALTY_TYPES,
    penaltySettings: DEFAULT_PENALTY_SETTINGS,
    homeTeam: 'Home', awayTeam: 'Away',
    homeColor: '#00d4ff', awayColor: '#ff6b6b',
    homeAbbr: 'HOM', awayAbbr: 'AWY',
    homeScore: 0, awayScore: 0, homeShootout: 0, awayShootout: 0,
    phase: 'pregame', currentPeriod: 1, currentOtPeriod: 0,
    timeRemaining: 1200, running: false, lastTick: null,
    penalties: [],
    homeTimeouts: 1, awayTimeouts: 1, timeoutActive: null, timeoutRemaining: 30,
  };
}

let state: GameState = createInitialState();

/** Persists the current state to state.json for crash recovery. */
function saveStateToFile(): void {
  try {
    // Don't persist pregame — nothing to recover
    if (state.phase === 'pregame' || state.phase === 'ended') return;
    fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, running: false, lastTick: null }));
  } catch (e: any) {
    console.error('[ERROR] State save failed:', e.message);
  }
}

/** Restores state from state.json on server start (if an unfinished game exists). */
function loadStateFromFile(): void {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as GameState;
    if (saved.phase && saved.phase !== 'ended' && saved.phase !== 'pregame') {
      state = { ...saved, running: false, lastTick: null };
      console.log(`[WARN] Recovered unfinished game: ${saved.homeTeam} vs ${saved.awayTeam} | Phase: ${saved.phase} | Time: ${Math.floor(saved.timeRemaining)}s`);
    }
  } catch (e: any) {
    console.error('[ERROR] Failed to restore state:', e.message);
  }
}

/** Builds a filesystem-safe slug from a team name (for archive filenames). */
function slugifyTeamName(name: string): string {
  return (name || '').trim().replace(/[^a-zA-Z0-9äöüÄÖÜ]+/g, '-').replace(/^-+|-+$/g, '') || 'X';
}

/**
 * Archives state.json when a game ends, instead of deleting it.
 * Renamed to state_<timestamp>_<home>-vs-<away>.json inside state-archive/,
 * so finished matches can be reviewed or cleaned up later via Settings.
 */
function archiveStateFile(): void {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
    const home = slugifyTeamName(state.homeTeam);
    const away = slugifyTeamName(state.awayTeam);
    const archivedName = `state_${ts}_${home}-vs-${away}.json`;

    // Write the final state directly into the archive (covers the case where
    // state.json hasn't been written yet, e.g. a very short game).
    fs.writeFileSync(
      path.join(ARCHIVE_DIR, archivedName),
      JSON.stringify({ ...state, running: false, lastTick: null }),
    );
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (e: any) {
    console.error('[ERROR] State archive failed:', e.message);
  }
}

/** Removes state.json without archiving (used on RESET before a game has produced a result). */
function discardStateFile(): void {
  try { if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE); } catch { }
}

setInterval(saveStateToFile, 5000);

// #endregion

// #region ─── Penalty Helpers ──────────────────────────────────────────────────

function getActiveSlotCount(team: 'home' | 'away'): number {
  return state.penalties.filter(
    p => p.team === team && p.status === 'running' && p.displayMode === 'slot'
  ).length;
}

function calcRemaining(duration: number): number {
  const frac = state.timeRemaining - Math.floor(state.timeRemaining);
  return frac > 0 ? duration - 1 + frac : duration;
}

function promoteQueue(team: 'home' | 'away'): void {
  const queued = state.penalties
    .filter(p => p.team === team && p.status === 'queued')
    .sort((a, b) => (a.queuePosition ?? 99) - (b.queuePosition ?? 99));

  for (const pen of queued) {
    if (getActiveSlotCount(team) < state.penaltySettings.maxActiveSlots) {
      pen.status        = 'running';
      pen.remaining     = calcRemaining(pen.duration);
      pen.queuePosition = null;
      queued.splice(queued.indexOf(pen), 1);
      queued.forEach((p, i) => { p.queuePosition = i + 1; });
    } else break;
  }
}

function unblockWaiting(expiredId: number): void {
  const badge = state.penalties.find(
    p => p.blockedByPenaltyId === expiredId && p.status === 'waiting'
  );
  if (badge) { badge.status = 'running'; badge.remaining = calcRemaining(badge.duration); }

  const chain = state.penalties.find(
    p => p.blockedByPenaltyId === expiredId && p.status === 'waiting' && p.parentPenaltyId !== null
  );
  if (chain) { chain.status = 'running'; chain.remaining = calcRemaining(chain.duration); }
}

// #endregion

// #region ─── REST API ─────────────────────────────────────────────────────────

/** GET /api/health — simple reachability check (no DB in this open-source build). */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** GET /api/sport-templates — returns all YAML-loaded templates */
app.get('/api/sport-templates', (_req, res) => {
  res.json(loadedTemplates);
});

/** GET /api/state — returns current game state (for reconnecting clients) */
app.get('/api/state', (_req, res) => {
  res.json(state);
});

/** GET /api/states — lists archived (finished) game states for the Settings page. */
app.get('/api/states', (_req, res) => {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return res.json([]);

    const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.json'));
    const infos: ArchivedStateInfo[] = [];

    for (const filename of files) {
      try {
        const raw  = fs.readFileSync(path.join(ARCHIVE_DIR, filename), 'utf-8');
        const data = JSON.parse(raw) as GameState;
        const stat = fs.statSync(path.join(ARCHIVE_DIR, filename));
        infos.push({
          filename,
          archivedAt:   stat.mtime.toISOString(),
          homeTeam:     data.homeTeam,
          awayTeam:     data.awayTeam,
          homeScore:    data.homeScore,
          awayScore:    data.awayScore,
          homeShootout: data.homeShootout,
          awayShootout: data.awayShootout,
          phase:        data.phase,
        });
      } catch (e: any) {
        console.error(`[ERROR] Failed to read archived state ${filename}: ${e.message}`);
      }
    }

    // Newest first
    infos.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
    res.json(infos);
  } catch (e: any) {
    console.error('[ERROR] Failed to list archived states:', e.message);
    res.status(500).json({ error: 'Failed to list archived states' });
  }
});

/** DELETE /api/states/:filename — removes a single archived game state file. */
app.delete('/api/states/:filename', (req, res) => {
  const { filename } = req.params;

  // Guard against path traversal — only allow our own naming pattern.
  if (!/^state_[\w.\-]+\.json$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join(ARCHIVE_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
    fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e: any) {
    console.error(`[ERROR] Failed to delete archived state ${filename}:`, e.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

/** SPA catch-all */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.endsWith('.html')) return next();
  res.sendFile(path.join(PROJECT_ROOT, 'public', 'index.html'));
});

// #endregion

// #region ─── Game Phase Logic ─────────────────────────────────────────────────

function advancePhase(): void {
  switch (state.phase) {
    case 'pregame':
      state.phase         = 'period';
      state.timeRemaining = state.periodDuration;
      break;
    case 'period':
      if (state.currentPeriod < state.numPeriods) {
        state.phase         = 'break';
        state.timeRemaining = state.breakDuration;
      } else if (state.hasOvertime) {
        state.phase           = 'ot_break';
        state.timeRemaining   = state.otBreakDuration;
        state.currentOtPeriod = 0;
      } else if (state.hasShootout) {
        state.phase         = 'so_break';
        state.timeRemaining = state.soBreakDuration;
      } else {
        state.phase = 'ended';
        archiveStateFile();
      }
      break;
    case 'break':
      state.currentPeriod++;
      state.phase         = 'period';
      state.timeRemaining = state.periodDuration;
      break;
    case 'ot_break':
      state.currentOtPeriod++;
      state.phase         = 'overtime';
      state.timeRemaining = state.otDuration;
      break;
    case 'overtime':
      if (state.numOtPeriods === null || state.currentOtPeriod < state.numOtPeriods) {
        state.phase         = 'ot_break';
        state.timeRemaining = state.otBreakDuration;
      } else if (state.hasShootout) {
        state.phase         = 'so_break';
        state.timeRemaining = state.soBreakDuration;
      } else {
        state.phase = 'ended';
        archiveStateFile();
      }
      break;
    case 'so_break':
      state.phase = 'shootout';
      break;
    case 'shootout':
      state.phase = 'ended';
      archiveStateFile();
      break;
  }
}

// #endregion

// #region ─── WebSocket ────────────────────────────────────────────────────────

function broadcast(msg: ServerMessage): void {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'STATE', state }));
  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientCommand;
      await handleCommand(msg);
    } catch (e) {
      console.error('[ERROR] WebSocket message parse error:', e);
    }
  });
});

// #endregion

// #region ─── Tick ─────────────────────────────────────────────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;

function startTick(): void {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    const now     = Date.now();
    const elapsed = state.lastTick ? (now - state.lastTick) / 1000 : 0;

    if (state.timeoutActive) {
      state.lastTick         = now;
      state.timeoutRemaining = Math.max(0, state.timeoutRemaining - elapsed);
      if (state.timeoutRemaining <= 0) {
        state.timeoutActive    = null;
        state.timeoutRemaining = 30;
        broadcast({ type: 'BUZZER', reason: 'timeout' });
      }
      broadcast({ type: 'STATE', state });
      return;
    }

    if (!state.running) { state.lastTick = null; return; }

    state.lastTick = now;
    const newTimeRemaining = Math.max(0, state.timeRemaining - elapsed);
    const actualElapsed    = state.timeRemaining - newTimeRemaining;

    state.penalties = state.penalties.map(p => {
      if (p.status !== 'running') return p;
      const rem          = Math.max(0, p.remaining - actualElapsed);
      const penType      = state.penaltyTypes.find(t => t.id === p.typeId);
      const chainAt      = penType?.chainSeconds ?? null;
      const nowClearable = chainAt !== null && rem <= chainAt ? false : p.clearableByGoal;
      if (rem <= 0 && p.remaining > 0) {
        broadcast({ type: 'BUZZER', reason: 'penalty', id: p.id });
        return { ...p, remaining: 0, status: 'expired' as const, clearableByGoal: nowClearable };
      }
      return { ...p, remaining: rem, clearableByGoal: nowClearable };
    });

    const expired       = state.penalties.filter(p => p.status === 'expired');
    const expiredIds    = expired.map(p => p.id);
    const expiredByTeam = new Set(expired.map(p => p.team));
    state.penalties = state.penalties.filter(p => p.status !== 'expired');
    expiredByTeam.forEach(t => promoteQueue(t));
    expiredIds.forEach(id => unblockWaiting(id));

    state.timeRemaining = newTimeRemaining;
    if (state.timeRemaining <= 0 && state.running) {
      state.running  = false;
      state.lastTick = null;
      broadcast({ type: 'BUZZER', reason: 'period' });
    }

    broadcast({ type: 'STATE', state });
  }, 100);
}

// #endregion

// #region ─── Command Handler ──────────────────────────────────────────────────

async function handleCommand(msg: ClientCommand): Promise<void> {
  switch (msg.cmd) {

    case 'SET_CONFIG': {
      const c = msg.config;

      // Pick penalty config from the matching YAML template (matched by distinct slug)
      const tmpl = msg.templateSlug
        ? loadedTemplates.find(t => t.slug === msg.templateSlug)
        : undefined;
      const penTypes:    PenaltyType[]   = tmpl?.penaltyTypes    ?? DEFAULT_PENALTY_TYPES;
      const penSettings: PenaltySettings = tmpl?.penaltySettings ?? DEFAULT_PENALTY_SETTINGS;

      const abbr = (name: string) => name.slice(0, 3).toUpperCase();

      state = {
        ...createInitialState(),
        numPeriods:      c.numPeriods,
        periodDuration:  c.periodDuration  * 60,
        breakDuration:   c.breakDuration   * 60,
        hasOvertime:     c.hasOvertime,
        numOtPeriods:    c.numOtPeriods,
        otDuration:      c.otDuration      * 60,
        otSuddenDeath:   c.otSuddenDeath,
        otBreakDuration: c.otBreakDuration * 60,
        hasShootout:     c.hasShootout,
        soBreakDuration: c.soBreakDuration * 60,
        penaltyTypes:    penTypes,
        penaltySettings: penSettings,
        timeRemaining:   c.periodDuration  * 60,
        homeTeam:        msg.homeTeam,
        awayTeam:        msg.awayTeam,
        homeColor:       msg.homeColor || '#00d4ff',
        awayColor:       msg.awayColor || '#ff6b6b',
        homeAbbr:        msg.homeAbbr  || abbr(msg.homeTeam),
        awayAbbr:        msg.awayAbbr  || abbr(msg.awayTeam),
      };
      break;
    }

    case 'START':
      if (state.phase === 'pregame') advancePhase();
      state.running  = true;
      state.lastTick = Date.now();
      break;

    case 'STOP':
      state.running  = false;
      state.lastTick = null;
      break;

    case 'NEXT_PHASE':
      state.running  = false;
      state.lastTick = null;
      advancePhase();
      break;

    case 'RESET':
      // Preserve the result if a game was actually in progress; otherwise just discard.
      if (state.phase !== 'pregame') archiveStateFile();
      else discardStateFile();
      state = createInitialState();
      break;

    case 'GOAL_HOME': state.homeScore++; break;
    case 'GOAL_AWAY': state.awayScore++; break;
    case 'UNDO_HOME': if (state.homeScore > 0) state.homeScore--; break;
    case 'UNDO_AWAY': if (state.awayScore > 0) state.awayScore--; break;
    case 'SO_HOME':   state.homeShootout++; break;
    case 'SO_AWAY':   state.awayShootout++; break;

    case 'ADD_PENALTY': {
      const penType = state.penaltyTypes.find(t => t.id === msg.typeId);
      if (!penType) break;

      const settings  = state.penaltySettings;
      const isBadge   = penType.displayMode === 'badge';
      const companion = msg.companion;
      const team      = msg.team as 'home' | 'away';

      let nextId = Date.now();
      function makeId() { return nextId++; }

      function makeSlot(player: string, durationSeconds: number, clearableByGoal: boolean, parentId: number): number {
        const id        = makeId();
        const slotsFull = getActiveSlotCount(team) >= settings.maxActiveSlots;
        const status: Penalty['status'] = (slotsFull && settings.queueEnabled) ? 'queued' : 'running';
        const queuePosition = status === 'queued'
          ? state.penalties.filter(p => p.team === team && p.status === 'queued').length + 1
          : null;
        state.penalties.push({
          id, team, player,
          typeId: durationSeconds === 120 ? 'minor' : 'major',
          displayMode: 'slot', clearableByGoal,
          duration: durationSeconds,
          remaining: status === 'running' ? calcRemaining(durationSeconds) : durationSeconds,
          status, queuePosition,
          linkedPenaltyId: null, parentPenaltyId: parentId,
          blockedByPenaltyId: null, nextPenaltyId: null,
        });
        return id;
      }

      const mainId    = makeId();
      const isSlot    = !isBadge;
      const slotsFull = isSlot && getActiveSlotCount(team) >= settings.maxActiveSlots;
      const mainStatus: Penalty['status'] = (isSlot && slotsFull && settings.queueEnabled) ? 'queued'
        : isBadge && companion ? 'waiting'
        : 'running';
      const mainQueue = mainStatus === 'queued'
        ? state.penalties.filter(p => p.team === team && p.status === 'queued').length + 1
        : null;

      state.penalties.push({
        id: mainId, team, player: msg.player,
        typeId: penType.id, displayMode: penType.displayMode,
        clearableByGoal: penType.clearableByGoal,
        duration: penType.durationSeconds,
        remaining: mainStatus === 'running' ? calcRemaining(penType.durationSeconds) : penType.durationSeconds,
        status: mainStatus, queuePosition: mainQueue,
        linkedPenaltyId: null, parentPenaltyId: null,
        blockedByPenaltyId: null, nextPenaltyId: null,
      });

      if (companion && isBadge) {
        const cType = companion.type as CompanionType;
        if (cType === '2') {
          const slotId = makeSlot(companion.player, 120, true, mainId);
          const main = state.penalties.find(p => p.id === mainId)!;
          main.linkedPenaltyId    = slotId;
          main.blockedByPenaltyId = slotId;
        } else if (cType === '5') {
          const slotId = makeSlot(companion.player, 300, false, mainId);
          const main = state.penalties.find(p => p.id === mainId)!;
          main.linkedPenaltyId    = slotId;
          main.blockedByPenaltyId = slotId;
        } else if (cType === '2+2') {
          const slot1Id = makeSlot(companion.player, 120, true, mainId);
          const slot2Id = makeSlot(companion.player, 120, true, mainId);
          const slot2   = state.penalties.find(p => p.id === slot2Id)!;
          if (slot2.status === 'running') {
            slot2.status             = 'waiting';
            slot2.blockedByPenaltyId = slot1Id;
            slot2.queuePosition      = null;
            state.penalties
              .filter(p => p.team === team && p.status === 'queued')
              .sort((a, b) => (a.queuePosition ?? 99) - (b.queuePosition ?? 99))
              .forEach((p, i) => { p.queuePosition = i + 1; });
          }
          const slot1 = state.penalties.find(p => p.id === slot1Id)!;
          slot1.nextPenaltyId = slot2Id;
          const main = state.penalties.find(p => p.id === mainId)!;
          main.linkedPenaltyId    = slot1Id;
          main.blockedByPenaltyId = slot1Id;
        }
      }
      break;
    }

    case 'REMOVE_PENALTY': {
      const pen = state.penalties.find(p => p.id === msg.id);
      if (!pen) break;
      const team      = pen.team;
      const removedId = pen.id;
      const toRemove  = new Set([msg.id]);
      if (pen.linkedPenaltyId) toRemove.add(pen.linkedPenaltyId);
      if (pen.parentPenaltyId) toRemove.add(pen.parentPenaltyId);
      state.penalties = state.penalties.filter(p => !toRemove.has(p.id));
      state.penalties
        .filter(p => p.team === team && p.status === 'queued')
        .sort((a, b) => (a.queuePosition ?? 99) - (b.queuePosition ?? 99))
        .forEach((p, i) => { p.queuePosition = i + 1; });
      promoteQueue(team);
      unblockWaiting(removedId);
      break;
    }

    case 'REORDER_QUEUE': {
      const { team, orderedIds } = msg;
      orderedIds.forEach((id, index) => {
        const pen = state.penalties.find(p => p.id === id && p.team === team && p.status === 'queued');
        if (pen) pen.queuePosition = index + 1;
      });
      break;
    }

    case 'TIMEOUT':
      if (msg.team === 'home' && state.homeTimeouts > 0) {
        state.homeTimeouts--; state.timeoutActive = 'home'; state.timeoutRemaining = 30; state.running = false;
      } else if (msg.team === 'away' && state.awayTimeouts > 0) {
        state.awayTimeouts--; state.timeoutActive = 'away'; state.timeoutRemaining = 30; state.running = false;
      }
      break;

    case 'ADJUST_TIME': {
      const delta = msg.delta;
      state.timeRemaining = Math.max(0, state.timeRemaining + delta);
      state.penalties = state.penalties.map(p =>
        p.status === 'running' ? { ...p, remaining: Math.max(0, p.remaining + delta) } : p
      );
      break;
    }

    case 'SET_TIME':
      state.timeRemaining = Math.max(0, msg.seconds);
      break;

    case 'SET_PENALTY_TIME': {
      const pen = state.penalties.find(p => p.id === msg.id);
      if (pen && pen.status === 'running') {
        pen.remaining = Math.max(0, msg.seconds);
      }
      break;
    }
  }

  broadcast({ type: 'STATE', state });
}

// #endregion

// #region ─── Boot ─────────────────────────────────────────────────────────────

loadYamlTemplates();
loadStateFromFile();
startTick();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
server.listen(PORT, () => console.log(`\n[INFO] Open Scoreboard running at http://localhost:${PORT}\n`));

// #endregion