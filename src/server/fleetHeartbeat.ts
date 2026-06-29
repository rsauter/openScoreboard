// #region ─── Fleet Heartbeat (optional, enabled via FLEET_HEARTBEAT_URL) ────
// Sends a periodic liveness signal to scoreboardFLEET. Entirely optional and
// fail-soft: if FLEET_HEARTBEAT_URL is not set, or the fleet server is
// unreachable, this never affects the running scoreboard — it only logs a
// [WARN] locally and updates an in-memory flag that the Statusbar can surface
// to the user (see fleetReachable in /api/health).
//
// The instance's identity (fleetInstanceId) is NOT set manually via .env.
// Instead it is generated once, on first boot, as a random UUID and persisted
// in settings.json (the same file that already stores the operator PIN).
// This avoids manual setup mistakes (typos, duplicate IDs across Pis) and
// stays stable across WiFi/Ethernet switches or SD-card clones — unlike a
// MAC-address-based ID, which would tie the instance's identity to a single
// piece of hardware rather than to "this installation at this venue".

import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const FLEET_ENDPOINT = process.env.FLEET_HEARTBEAT_URL;      // e.g. https://scoreboardfleet.up.railway.app
const FLEET_SECRET    = process.env.FLEET_SECRET;            // shared secret, must match scoreboardFLEET's value
const FLEET_CHANNEL   = process.env.FLEET_CHANNEL ?? 'stable'; // 'stable' | 'canary'

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_BUFFERED_ERRORS   = 5;

interface RecentError {
  ts: string;
  msg: string;
}

// Buffer of recent [ERROR] log lines since the last heartbeat. Populated by
// bufferFleetError(), which existing console.error(...) call sites can call
// alongside their normal logging — see usage note at the bottom of this file.
const recentErrorBuffer: RecentError[] = [];

export function bufferFleetError(msg: string): void {
  if (!FLEET_ENDPOINT) return; // no point buffering if heartbeats are disabled
  recentErrorBuffer.push({ ts: new Date().toISOString(), msg });
  if (recentErrorBuffer.length > MAX_BUFFERED_ERRORS) recentErrorBuffer.shift();
}

// Exposed so /api/health can report fleet reachability to the Statusbar
// without alarming color-coding — see ARCHITECTURE notes on this pattern.
export let lastFleetPushSucceeded = true;

// ─── Identity: generate-once, persist, never overwritten by updates ──────
// Reuses the existing loadSettings()/saveSettings() pair from server.ts
// rather than duplicating file I/O here — passed in via initFleetHeartbeat()
// to avoid a circular import between this module and server.ts.

interface SettingsWithFleetId {
  fleetInstanceId?: string;
}

let resolvedInstanceId: string | null = null;

function getOrCreateInstanceId(
  loadSettings: () => SettingsWithFleetId,
  saveSettings: (s: SettingsWithFleetId) => void
): string {
  if (resolvedInstanceId) return resolvedInstanceId; // cached after first resolution this run

  const settings = loadSettings();
  if (settings.fleetInstanceId) {
    resolvedInstanceId = settings.fleetInstanceId;
    return resolvedInstanceId;
  }

  // First boot ever for this installation — generate once, persist forever.
  // Subsequent restarts (including after `git pull` updates) will find this
  // value already present in settings.json and reuse it, never regenerating.
  const newId = crypto.randomUUID();
  settings.fleetInstanceId = newId;
  saveSettings(settings);
  console.log(`[INFO] Generated new fleet instance ID: ${newId} (persisted in settings.json)`);
  resolvedInstanceId = newId;
  return newId;
}

// Exposed so Settings.vue's GET /api/settings (or equivalent) can display the
// ID read-only, without re-running the generation logic.
export function getFleetInstanceId(
  loadSettings: () => SettingsWithFleetId
): string | null {
  return loadSettings().fleetInstanceId ?? null;
}

// ─── Pi-specific telemetry (best-effort, never throws) ───────────────────

let PROJECT_ROOT_FOR_DISK_CHECK = '.';

function readDiskFreeGb(): number | null {
  try {
    // statfsSync is available on Node 19+. Falls back to null on platforms
    // where it's unsupported (e.g. some minimal Docker images) — this must
    // never crash the heartbeat.
    //
    // Uses bavail (blocks available to an unprivileged process), not bfree
    // (total free blocks including ones reserved for root). Most Unix
    // filesystems reserve a percentage of capacity exclusively for root as
    // a safety margin; bfree counts that reserved space as "free" even
    // though a normal process could never actually write into it. bavail
    // reflects what's truly usable, which is what we actually care about
    // here (how much room does the scoreboard have left to write state.json
    // / logs before running out of space).
    const stats = fs.statfsSync(PROJECT_ROOT_FOR_DISK_CHECK);
    const freeBytes = stats.bsize * stats.bavail;
    return Math.round((freeBytes / (1024 ** 3)) * 10) / 10;
  } catch {
    return null;
  }
}

function readMemUsedPct(): number | null {
  try {
    const total = os.totalmem();
    const free  = os.freemem();
    if (total === 0) return null;
    return Math.round(((total - free) / total) * 1000) / 10;
  } catch {
    return null;
  }
}

function readMemTotalMb(): number | null {
  try {
    return Math.round(os.totalmem() / (1024 * 1024));
  } catch {
    return null;
  }
}

function readCpuLoadPct(): number | null {
  try {
    // 1-minute load average relative to core count, as a rough 0-100 estimate.
    // Good enough for fleet monitoring purposes — not meant to be precise.
    const [load1] = os.loadavg();
    const cores = os.cpus().length || 1;
    return Math.min(100, Math.round((load1 / cores) * 1000) / 10);
  } catch {
    return null;
  }
}

function readCpuTempC(): number | null {
  try {
    // Raspberry Pi exposes its SoC temperature directly via this sysfs file —
    // no extra sensor driver or package needed. Returns millidegrees Celsius.
    // Not present on non-Pi platforms (e.g. when running on Railway), which
    // is expected and handled by the catch below.
    const raw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
    return Math.round(parseInt(raw.trim(), 10) / 100) / 10;
  } catch {
    return null; // Not a Pi, or sensor unavailable — not an error condition.
  }
}

// ─── Heartbeat sender ──────────────────────────────────────────────────────

async function sendHeartbeat(instanceId: string, appVersion: string): Promise<void> {
  if (!FLEET_ENDPOINT) return; // feature fully optional

  const payload = {
    instanceId,
    version:        appVersion,
    channel:        FLEET_CHANNEL,
    status:         recentErrorBuffer.length > 0 ? 'degraded' : 'ok',
    uptimeSeconds:  Math.floor(process.uptime()),
    diskFreeGb:     readDiskFreeGb(),
    memUsedPct:     readMemUsedPct(),
    memTotalMb:     readMemTotalMb(),
    cpuLoadPct:     readCpuLoadPct(),
    cpuTempC:       readCpuTempC(),
    recentErrors:   recentErrorBuffer.splice(0), // send and clear the buffer
  };

  try {
    const res = await fetch(`${FLEET_ENDPOINT}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(FLEET_SECRET ? { 'X-Fleet-Secret': FLEET_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000), // never let a slow fleet server block anything
    });
    lastFleetPushSucceeded = res.ok;
    if (!res.ok) {
      console.warn(`[WARN] Fleet heartbeat rejected (HTTP ${res.status}) — non-critical, scoreboard unaffected.`);
    }
  } catch (e) {
    lastFleetPushSucceeded = false;
    console.warn('[WARN] Fleet heartbeat failed (non-critical, scoreboard unaffected):', (e as Error).message);
  }
}

export function initFleetHeartbeat(
  projectRoot: string,
  appVersion: string,
  loadSettings: () => SettingsWithFleetId,
  saveSettings: (s: SettingsWithFleetId) => void
): void {
  PROJECT_ROOT_FOR_DISK_CHECK = projectRoot;

  if (!FLEET_ENDPOINT) {
    console.log('[INFO] Fleet heartbeat disabled (FLEET_HEARTBEAT_URL not set).');
    return;
  }

  const instanceId = getOrCreateInstanceId(loadSettings, saveSettings);
  console.log(`[INFO] Fleet heartbeat enabled — instance "${instanceId}", channel "${FLEET_CHANNEL}".`);
  sendHeartbeat(instanceId, appVersion); // fire once immediately on boot, then on the regular interval
  setInterval(() => sendHeartbeat(instanceId, appVersion), HEARTBEAT_INTERVAL_MS);
}

// #endregion
