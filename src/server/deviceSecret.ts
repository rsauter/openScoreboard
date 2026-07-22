// src/server/deviceSecret.ts
//
// #region ─── Fleet Device Trust Secret (Trust-on-First-Use, ADR-0016) ────────
// scoreboardFLEET now accepts an optional `deviceSecret` field on
// POST /api/heartbeat, POST /api/pairing/initiate, and POST /api/license/pair.
// Whichever call arrives first for a given fleetInstanceId establishes the
// secret on the Fleet side; every subsequent call must send the same value
// (Fleet compares a hash). This module is the single place that generates
// and persists that secret for this installation.
//
// Deliberately kept in its own file, separate from license.json:
// GET /api/license responds with the full LicenseInfo object read straight
// off disk (see server.ts), so anything living inside license.json is one
// refactor away from being sent to the browser. The trust secret must never
// leave this server process, so it lives in its own file that no route
// ever serializes back out.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SECRET_BYTES = 32; // 256-bit secret, hex-encoded for JSON-friendliness

interface DeviceSecretFile {
  deviceSecret: string;
}

let cachedSecret: string | null = null;

/** Loads the persisted device trust secret, generating and persisting a new
 *  one on first boot. Cached in memory after first resolution so repeated
 *  calls (e.g. from multiple route handlers) don't re-read the file.
 *  Never regenerate this value once it exists — Fleet will reject every
 *  subsequent call for this instance if the secret changes underneath it. */
export function getOrCreateDeviceSecret(projectRoot: string): string {
  if (cachedSecret) return cachedSecret;

  const filePath = path.join(projectRoot, 'device-secret.json');

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DeviceSecretFile;
      if (parsed.deviceSecret) {
        cachedSecret = parsed.deviceSecret;
        return cachedSecret;
      }
    }
  } catch (e: any) {
    console.error('[ERROR] Failed to load device-secret.json:', e.message);
  }

  const newSecret = crypto.randomBytes(SECRET_BYTES).toString('hex');
  try {
    fs.writeFileSync(filePath, JSON.stringify({ deviceSecret: newSecret }, null, 2));
    console.log('[INFO] Generated new Fleet device trust secret (persisted in device-secret.json).');
  } catch (e: any) {
    console.error('[ERROR] Failed to save device-secret.json:', e.message);
  }

  cachedSecret = newSecret;
  return cachedSecret;
}

// #endregion