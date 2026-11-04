#!/usr/bin/env node
// publish-release.mjs — openScoreboard (runs on the RELEASE MANAGER's machine)
//
// Packages a release, signs it with the Ed25519 private key and publishes it to
// Compass (PUT /api/releases/<name>, wire format: Compass ADR-0030). Also
// promotes (canary -> stable), withdraws and restores releases.
//
// Pure Node (>= 20) — no openssl, no GNU-only tools — so signing behaves the
// same on macOS, Linux and Windows. Only the packaging step calls bash
// (package-release.sh); on Windows run it under WSL or Git-Bash.
//
// Usage:
//   node dev-tools/publish-release.mjs [--channel canary|stable] [--tarball <file>]
//        [--notes-de <text>] [--notes-en <text>] [--notes-fr <text>] [--notes-it <text>]
//        [--allow-dirty] [--dry-run] [--yes]
//   node dev-tools/publish-release.mjs --promote <release-name>      (canary -> stable)
//   node dev-tools/publish-release.mjs --withdraw <release-name>
//   node dev-tools/publish-release.mjs --restore <release-name>
//   node dev-tools/publish-release.mjs --print-public-key            (PEM to stdout)
//
// Configuration (environment, or ~/.sluiten/release.env — never inside the repo):
//   RELEASE_PUBLISH_URL    base URL of Compass, e.g. http://localhost:3000 (no trailing slash needed)
//   RELEASE_PUBLISH_TOKEN  bearer token (= RELEASE_PUBLISH_TOKEN of the Compass backend)
//   RELEASE_PRIVATE_KEY    path of the private key, default ~/.sluiten/release-private.pem
//
// Secrets (token, private key) are never printed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// #region ─── Setup ──────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_KEY_FILE = path.join(REPO_ROOT, 'dev-tools', 'release-public.pem');
const SLUITEN_DIR = path.join(os.homedir(), '.sluiten');

const log = (m) => console.log(`[INFO] ${m}`);
const warn = (m) => console.warn(`[WARN] ${m}`);
function die(m) { console.error(`[ERROR] ${m}`); process.exit(1); }

// Optional per-user config file outside the repo. Values already in the environment win.
try { process.loadEnvFile(path.join(SLUITEN_DIR, 'release.env')); } catch { /* optional */ }

function parseArgs(argv) {
  const flags = new Set(['--allow-dirty', '--dry-run', '--yes', '--print-public-key']);
  const out = { notes: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.has(a)) { out[a.slice(2)] = true; continue; }
    const takesValue = ['--channel', '--tarball', '--promote', '--withdraw', '--restore',
      '--notes-de', '--notes-en', '--notes-fr', '--notes-it'];
    if (!takesValue.includes(a)) die(`Unknown option: ${a}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) die(`${a} needs a value.`);
    if (a.startsWith('--notes-')) out.notes[a.slice(8)] = v; else out[a.slice(2)] = v;
  }
  return out;
}

// #endregion

// #region ─── Keys and signing ───────────────────────────────────────────────

function loadPrivateKey() {
  const file = process.env.RELEASE_PRIVATE_KEY || path.join(SLUITEN_DIR, 'release-private.pem');
  let pem;
  try { pem = fs.readFileSync(file); } catch { die(`Private key not readable: ${file} (set RELEASE_PRIVATE_KEY).`); }
  try {
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') die('The private key is not an Ed25519 key.');
    return key;
  } catch { die(`${file} is not a valid PEM private key.`); }
}

const publicPemOf = (privateKey) =>
  crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();

/** The public key in the repo is what every release ships and every device trusts for the NEXT update.
 *  It must never silently differ from the private key we sign with. */
function checkRepoPublicKey(privateKey) {
  if (!fs.existsSync(PUBLIC_KEY_FILE)) {
    die('dev-tools/release-public.pem is missing. Copy the public key of your key pair there and commit it '
      + '(or create it with: node dev-tools/publish-release.mjs --print-public-key > dev-tools/release-public.pem). '
      + 'Without it a build ships without updater.');
  }
  // Compare the keys themselves (DER), not the PEM text, so line endings or wrapping do not matter.
  let committed;
  try { committed = crypto.createPublicKey(fs.readFileSync(PUBLIC_KEY_FILE)); } catch { die('dev-tools/release-public.pem is not a valid PEM public key.'); }
  const der = (k) => k.export({ type: 'spki', format: 'der' });
  if (!der(committed).equals(der(crypto.createPublicKey(privateKey)))) {
    die('dev-tools/release-public.pem does not belong to the private key in use. '
      + 'Releases signed with this key would be rejected by every installed device.');
  }
}

// #endregion

// #region ─── Compass API ────────────────────────────────────────────────────

function apiConfig() {
  const raw = process.env.RELEASE_PUBLISH_URL?.trim();
  const token = process.env.RELEASE_PUBLISH_TOKEN?.trim();
  if (!raw) die('RELEASE_PUBLISH_URL is not set (e.g. http://localhost:3000).');
  if (!token) die('RELEASE_PUBLISH_TOKEN is not set.');
  const base = raw.replace(/\/+$/, '');
  let url;
  try { url = new URL(base); } catch { die('RELEASE_PUBLISH_URL is not a valid URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) die('Refusing to send the publish token over plain http to a non-local host.');
  return { base, token, host: url.host };
}

async function readError(res) {
  try { return (await res.json()).error ?? `HTTP ${res.status}`; } catch { return `HTTP ${res.status}`; }
}

async function patchRelease(name, body) {
  const { base, token, host } = apiConfig();
  const res = await fetch(`${base}/api/releases/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) die(`Compass (${host}) refused the change: ${await readError(res)}`);
  log(`Compass (${host}) accepted: ${name} ${JSON.stringify(body)}`);
}

// #endregion

// #region ─── Publish ────────────────────────────────────────────────────────

function packageRelease(allowDirty) {
  const args = [path.join(REPO_ROOT, 'dev-tools', 'package-release.sh'), ...(allowDirty ? ['--allow-dirty'] : [])];
  // stdin/stderr inherited (dirty-tree prompt, warnings); stdout captured to learn the tarball path.
  const r = spawnSync('bash', args, { cwd: REPO_ROOT, stdio: ['inherit', 'pipe', 'inherit'], encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) die(`Could not run bash for package-release.sh (${r.error.message}). On Windows use WSL or Git-Bash.`);
  process.stdout.write(r.stdout ?? '');
  if (r.status !== 0) die('package-release.sh failed.');
  const m = (r.stdout ?? '').match(/^TARBALL_PATH=(.+)$/m);
  if (!m) die('package-release.sh did not report a tarball path.');
  return path.resolve(REPO_ROOT, m[1].trim());
}

async function confirm(question) {
  if (!process.stdin.isTTY) die('Confirmation needed but stdin is not a terminal; pass --yes.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return a === 'y' || a === 'yes';
}

async function publish(opts) {
  const channel = opts.channel ?? 'canary';
  if (!['canary', 'stable'].includes(channel)) die('--channel must be canary or stable.');

  const privateKey = loadPrivateKey();
  checkRepoPublicKey(privateKey);

  const tarball = opts.tarball ? path.resolve(opts.tarball) : packageRelease(Boolean(opts['allow-dirty']));
  if (!fs.existsSync(tarball) || !tarball.endsWith('.tar.gz')) die(`Not a .tar.gz file: ${tarball}`);

  const releaseName = path.basename(tarball, '.tar.gz');
  const version = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')).version;
  if (!/^\d+\.\d+\.\d+/.test(version)) die(`package.json version "${version}" is not SemVer.`);

  const bytes = fs.readFileSync(tarball);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  // Ed25519 over the raw bytes of the .tar.gz; algorithm is null for Ed25519.
  const signature = crypto.sign(null, bytes, privateKey);
  if (!crypto.verify(null, bytes, crypto.createPublicKey(privateKey), signature)) die('Self-check of the signature failed.');

  log(`Release ${releaseName} | version ${version} | channel ${channel} | ${bytes.length} bytes | sha256 ${sha256.slice(0, 16)}…`);
  if (opts['dry-run']) { log('Dry run: signed locally, nothing sent.'); return; }

  const { base, token, host } = apiConfig();
  if (channel === 'stable' && !opts.yes && !(await confirm(`Publish ${releaseName} directly to STABLE on ${host}?`))) die('Aborted.');

  const notes = Object.keys(opts.notes).length ? opts.notes : { en: releaseName };
  const res = await fetch(`${base}/api/releases/${encodeURIComponent(releaseName)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/gzip',
      'X-Release-Version': version,
      'X-Release-Signature': signature.toString('base64'),
      'X-Release-Channel': channel,
      'X-Release-Notes': Buffer.from(JSON.stringify(notes)).toString('base64'),
    },
    body: bytes,
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 201) {
    const body = await res.json();
    if (body.sha256 !== sha256) die('Compass stored a different sha256 than the local one — do not trust this upload.');
    log(`Published to ${host}: ${releaseName} (${channel}). Promote later with: --promote ${releaseName}`);
    return;
  }
  const err = await readError(res);
  if (res.status === 409) die(`Compass already has a release named ${releaseName} (releases are immutable): ${err}`);
  if (res.status === 422) die(`Compass rejected the signature (its RELEASE_SIGNING_PUBLIC_KEY differs from your key): ${err}`);
  die(`Compass (${host}) answered: ${err}`);
}

// #endregion

// #region ─── Main ───────────────────────────────────────────────────────────

const opts = parseArgs(process.argv.slice(2));

if (opts['print-public-key']) {
  process.stdout.write(publicPemOf(loadPrivateKey()));
} else if (opts.promote) {
  await patchRelease(opts.promote, { channel: 'stable' });
} else if (opts.withdraw) {
  await patchRelease(opts.withdraw, { withdrawn: true });
} else if (opts.restore) {
  await patchRelease(opts.restore, { withdrawn: false });
} else {
  await publish(opts);
}

// #endregion
