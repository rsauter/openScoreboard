import path from 'path';

// This file exists for one reason: .env must be loaded before server.ts's
// imports run — in particular before ./src/server/fleetHeartbeat, which
// reads process.env.FLEET_HEARTBEAT_URL immediately at import time.
//
// A static `import` at the top of server.ts cannot achieve this: ES module
// imports are hoisted by the JS engine and always execute before any
// synchronous code in the importing file, regardless of where in the
// source they're written. So loading .env inside server.ts itself would
// always run too late.
//
// The fix: load .env here synchronously first, then use a *dynamic*
// `import()` for server.ts — dynamic imports are not hoisted, they run at
// the point they're called, so this guarantees the correct order.
//
// Loaded via Node 22+'s native loadEnvFile. In the production build,
// __dirname points to dist/ (same situation as PROJECT_ROOT in server.ts),
// while a local .env for development only ever lives in the project root —
// hence checking one directory up as well. On a platform deployment
// (Railway, etc.) no .env file exists at all, hence the try/catch — that
// case is expected and not an error condition.
const envCandidates = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '..', '.env'),
];
for (const candidate of envCandidates) {
  try {
    process.loadEnvFile(candidate);
    break;
  } catch {
    // Not found at this path — try the next candidate.
  }
}

import('./server');