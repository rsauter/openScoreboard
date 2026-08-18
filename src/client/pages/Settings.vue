<template>
  <div class="max-w-2xl mx-auto px-4 py-8 space-y-8">
    <h1 class="text-2xl font-bold">{{ t('nav.settings') }}</h1>

    <!-- ─── Language ─────────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.language') }}</h2>
        <div class="flex flex-wrap gap-3">
          <button v-for="lang in locales" :key="lang.code" class="btn btn-lg gap-2"
            :class="currentLocale === lang.code ? 'btn-primary' : 'btn-ghost border border-base-content/20'"
            @click="switchLocale(lang.code)">
            <span class="text-xl">{{ lang.flag }}</span>
            {{ lang.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Theme ────────────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.theme') }}</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button v-for="theme in themes" :key="theme" class="btn btn-sm justify-start gap-2 font-normal"
            :class="currentTheme === theme ? 'btn-primary' : 'btn-ghost border border-base-content/20'"
            @click="setTheme(theme)">
            <span class="flex gap-0.5 shrink-0">
              <span v-for="(color, i) in themeSwatches[theme] ?? []" :key="i" class="inline-block w-3 h-3 rounded-sm"
                :style="{ background: color }"></span>
            </span>
            {{ theme }}
            <span v-if="currentTheme === theme" class="ml-auto text-xs opacity-60">✓</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Horn output ──────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.hornOutput.title') }}</h2>
        <p class="text-xs opacity-60">{{ t('settings.hornOutput.description') }}</p>
        <div class="flex flex-wrap gap-3">
          <button v-for="opt in hornOutputOptions" :key="opt" class="btn btn-lg gap-2"
            :class="hornOutput === opt ? 'btn-primary' : 'btn-ghost border border-base-content/20'"
            :disabled="hornOutputSaving"
            @click="setHornOutput(opt)">
            {{ t(`settings.hornOutput.${opt}`) }}
            <span v-if="hornOutput === opt" class="text-xs opacity-60">✓</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ─── Finished games (archive) ─────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.archive.title') }}</h2>

        <div v-if="archiveLoading" class="opacity-60 text-sm">
          {{ t('settings.archive.loading') }}
        </div>

        <div v-else-if="archiveError" class="alert alert-error text-sm">
          {{ t('settings.archive.loadError') }}
        </div>

        <div v-else-if="archivedStates.length === 0" class="opacity-60 text-sm">
          {{ t('settings.archive.empty') }}
        </div>

        <template v-else>
          <div v-if="archivedStates.length > manyThreshold" class="alert alert-warning text-sm">
            {{ t('settings.archive.many', { count: archivedStates.length }) }}
          </div>

          <ul class="flex flex-col divide-y divide-base-content/10">
            <li v-for="entry in archivedStates" :key="entry.filename"
              class="flex items-center justify-between gap-3 py-2">
              <div class="flex flex-col min-w-0">
                <span class="font-medium truncate">
                  {{ t('settings.archive.score', {
                    home: entry.homeTeam, away: entry.awayTeam,
                    homeScore: entry.homeScore, awayScore: entry.awayScore,
                  }) }}
                </span>
                <span class="text-xs opacity-60">{{ formatTimestamp(entry.archivedAt) }}</span>
              </div>
              <button class="btn btn-ghost btn-sm btn-circle text-error shrink-0"
                :aria-label="t('common.delete')"
                @click="deleteArchivedState(entry)">
                ✕
              </button>
            </li>
          </ul>
        </template>
      </div>
    </div>

    <!-- ─── Operator PIN ──────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.pin.title') }}</h2>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="label py-0">
              <span class="label-text text-xs">{{ t('settings.pin.currentPin') }}</span>
            </label>
            <input v-model="pinForm.current" type="password" inputmode="numeric"
              :placeholder="t('settings.pin.currentPin')"
              class="input input-bordered input-sm w-full" />
          </div>
          <div>
            <label class="label py-0">
              <span class="label-text text-xs">{{ t('settings.pin.newPin') }}</span>
            </label>
            <input v-model="pinForm.next" type="password" inputmode="numeric"
              :placeholder="t('settings.pin.newPin')"
              class="input input-bordered input-sm w-full" />
          </div>
          <div>
            <label class="label py-0">
              <span class="label-text text-xs">{{ t('settings.pin.confirmPin') }}</span>
            </label>
            <input v-model="pinForm.confirm" type="password" inputmode="numeric"
              :placeholder="t('settings.pin.confirmPin')"
              class="input input-bordered input-sm w-full" />
          </div>
        </div>

        <div v-if="pinError" class="alert alert-error text-sm py-2">{{ pinError }}</div>

        <button class="btn btn-primary btn-sm w-fit" @click="changePin">
          {{ t('settings.pin.saveBtn') }}
        </button>
      </div>
    </div>

    <!-- ─── License / Fleet identity (read-only) ─────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.license.title') }}</h2>

        <div v-if="licenseLoading" class="opacity-60 text-sm">
          {{ t('settings.license.loading') }}
        </div>

        <div v-else-if="licenseError" class="alert alert-error text-sm">
          {{ t('settings.license.loadError') }}
        </div>

        <template v-else-if="license">
          <!-- Key/value grid — read-only, no inputs -->
          <div class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm items-baseline">
            <span class="opacity-60 whitespace-nowrap">{{ t('settings.license.status') }}</span>
            <span>
              <span class="badge badge-sm" :class="statusBadgeClass(license.subscriptionStatus)">
                {{ t(`settings.license.statusValue.${license.subscriptionStatus}`) }}
              </span>
            </span>

            <span class="opacity-60 whitespace-nowrap">{{ t('settings.license.organization') }}</span>
            <span>{{ license.organizationName ?? '—' }}</span>

            <span class="opacity-60 whitespace-nowrap">{{ t('settings.license.validUntil') }}</span>
            <span>{{ license.licenseValidUntil ?? '—' }}</span>

            <span class="opacity-60 whitespace-nowrap">{{ t('settings.license.deviceId') }}</span>
            <span class="font-mono text-xs break-all opacity-70">{{ license.fleetInstanceId }}</span>
          </div>

          <p class="text-xs opacity-50">{{ t('settings.license.readOnlyNote') }}</p>
        </template>
      </div>
    </div>

    <!-- ─── Fleet device pairing ───────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.pairing.title') }}</h2>

        <template v-if="pairingStatus === 'claimed' || (pairingStatus === 'idle' && license?.organizationName)">
          <p class="text-sm">{{ t('settings.pairing.alreadyConnected', { organization: pairingConnectedOrgName }) }}</p>
          <button class="btn btn-ghost btn-sm w-fit" @click="startPairing">
            {{ t('settings.pairing.reconnectBtn') }}
          </button>
        </template>

        <template v-else>
          <p v-if="pairingStatus === 'idle'" class="text-sm opacity-70">{{ t('settings.pairing.description') }}</p>

          <button v-if="pairingStatus === 'idle'" class="btn btn-primary btn-sm w-fit" @click="startPairing">
            {{ t('settings.pairing.connectBtn') }}
          </button>

          <div v-else-if="pairingStatus === 'connecting'" class="opacity-60 text-sm">
            {{ t('settings.pairing.initiating') }}
          </div>

          <div v-else-if="pairingStatus === 'pending'" class="flex flex-col items-center gap-2 py-2">
            <span class="font-mono text-4xl tracking-widest">{{ pairingCode }}</span>
            <span class="text-sm opacity-70">{{ t('settings.pairing.instructions') }}</span>
            <span class="text-xs opacity-50">{{ t('settings.pairing.expiresIn', { time: pairingCountdownLabel }) }}</span>
          </div>

          <div v-else-if="pairingStatus === 'expired'" class="alert alert-warning text-sm py-2 flex items-center justify-between gap-2">
            <span>{{ t('settings.pairing.expired') }}</span>
            <button class="btn btn-ghost btn-xs" @click="startPairing">{{ t('settings.pairing.retryBtn') }}</button>
          </div>

          <div v-else-if="pairingStatus === 'error'" class="alert alert-error text-sm py-2 flex items-center justify-between gap-2">
            <span>{{ t('settings.pairing.initiateError') }}</span>
            <button class="btn btn-ghost btn-xs" @click="startPairing">{{ t('settings.pairing.retryBtn') }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ─── About ─────────────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.about') }}</h2>
        <h3 class="card-subtitle text-base">{{ t('nav.title') }}</h3>
        <h3 class="card-subtitle text-base">{{ t('nav.subTitle') }}</h3>
        <a href="https://www.sluiten-scoreboard.com" target="_blank" class="btn btn-ghost btn-sm">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <img src="../assets/logo_color_standard.svg" alt="sluiten SCOREBOARD Logo" class="h-26 w-auto" />
          </div>
        </a>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { setLocale, type Locale } from '../i18n';
import { showConfirm, showToast, authHeaders, clearToken } from '../shared';
import type { ArchivedStateInfo, LicenseInfo, SubscriptionStatus, PairingInitiateResponse, PairingStatusResponse } from '../../shared/types';

const { t, locale } = useI18n();
const router = useRouter();

// ─── Language ─────────────────────────────────────────────────────────────────
const locales = [
  { code: 'de' as Locale, label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'fr' as Locale, label: 'Français', flag: '🇫🇷' },
  { code: 'it' as Locale, label: 'Italiano', flag: '🇮🇹' },
  { code: 'en' as Locale, label: 'English',  flag: '🇬🇧' },
];
const currentLocale = computed(() => locale.value);
function switchLocale(code: Locale) { setLocale(code); }

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME_KEY     = 'osb.theme';
const THEME_KEY_OLD = 'theme'; // Legacy key — migrated on load

// Migrate legacy localStorage key to namespaced key
const _legacyTheme = localStorage.getItem(THEME_KEY_OLD);
if (_legacyTheme) {
  localStorage.setItem(THEME_KEY, _legacyTheme);
  localStorage.removeItem(THEME_KEY_OLD);
}

const themes = [
  'light', 'dark', 'cupcake', 'emerald', 'corporate', 'synthwave',
  'retro', 'cyberpunk', 'halloween', 'forest', 'aqua', 'lofi',
  'black', 'luxury', 'dracula', 'autumn', 'business', 'night',
  'coffee', 'winter', 'dim', 'nord', 'sunset',
];

const currentTheme = ref(localStorage.getItem(THEME_KEY) ?? 'corporate');

function setTheme(theme: string) {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

// Color swatches per theme (base / primary / secondary / accent)
const themeSwatches: Record<string, string[]> = {
  light:     ['#ffffff', '#570df8', '#f000b8', '#37cdbe'],
  dark:      ['#1d232a', '#661ae6', '#d926a9', '#1fb2a6'],
  cupcake:   ['#faf7f5', '#65c3c8', '#ef9fbc', '#eeaf3a'],
  emerald:   ['#ffffff', '#66cc8a', '#377cfb', '#ea5234'],
  corporate: ['#ffffff', '#4b6bfb', '#7b92b2', '#67cba0'],
  synthwave: ['#1a1033', '#e779c1', '#58c7f3', '#f3cc30'],
  retro:     ['#e4d8b4', '#ef9900', '#dc8850', '#00c7b7'],
  cyberpunk: ['#ffee00', '#ff7598', '#75d1f0', '#c07eec'],
  halloween: ['#212121', '#f28c18', '#6d3a9c', '#51a800'],
  forest:    ['#171212', '#1eb854', '#1db88e', '#1db8ab'],
  aqua:      ['#345da7', '#09ecf3', '#966fb3', '#ffe999'],
  lofi:      ['#ffffff', '#0d0d0d', '#1a1a1a', '#262626'],
  black:     ['#000000', '#343232', '#272626', '#343232'],
  luxury:    ['#09090b', '#ffffff', '#152747', '#513448'],
  dracula:   ['#282a36', '#ff79c6', '#bd93f9', '#ffb86c'],
  autumn:    ['#f1f1f1', '#8c0327', '#d85251', '#d59b6a'],
  business:  ['#1d232a', '#1c4f82', '#7c909a', '#e9d574'],
  night:     ['#0f172a', '#38bdf8', '#818cf8', '#f471b5'],
  coffee:    ['#20161f', '#db924b', '#263e3f', '#10576d'],
  winter:    ['#ffffff', '#047aed', '#463aa1', '#c148ac'],
  dim:       ['#2a303c', '#9ce99a', '#86d8f7', '#f4a261'],
  nord:      ['#2e3440', '#5e81ac', '#81a1c1', '#88c0d0'],
  sunset:    ['#f0ebe3', '#d05b3a', '#d06c4d', '#d07a66'],
};

// ─── Finished games (archive) ─────────────────────────────────────────────────
const archivedStates  = ref<ArchivedStateInfo[]>([]);
const archiveLoading  = ref(true);
const archiveError    = ref(false);
const manyThreshold   = 20;

async function loadArchivedStates(): Promise<void> {
  archiveLoading.value = true;
  archiveError.value   = false;
  try {
    const res = await fetch('/api/states', { headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    archivedStates.value = await res.json();
  } catch {
    archiveError.value = true;
  } finally {
    archiveLoading.value = false;
  }
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale.value, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

async function deleteArchivedState(entry: ArchivedStateInfo): Promise<void> {
  const ok = await showConfirm({
    title:   t('settings.archive.deleteTitle'),
    message: t('settings.archive.deleteMessage', { home: entry.homeTeam, away: entry.awayTeam }),
    danger:  true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/states/${encodeURIComponent(entry.filename)}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('Request failed');
    archivedStates.value = archivedStates.value.filter(e => e.filename !== entry.filename);
    showToast(t('settings.archive.deleted'), 'success');
  } catch {
    showToast(t('settings.archive.deleteFailed'), 'error');
  }
}

// ─── Operator PIN ─────────────────────────────────────────────────────────────
const pinForm = ref({ current: '', next: '', confirm: '' });
const pinError = ref('');

async function changePin(): Promise<void> {
  pinError.value = '';
  if (pinForm.value.next.length < 4) {
    pinError.value = t('settings.pin.errorLength');
    return;
  }
  if (pinForm.value.next !== pinForm.value.confirm) {
    pinError.value = t('settings.pin.errorMatch');
    return;
  }
  try {
    const res = await fetch('/api/auth/change-pin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ currentPin: pinForm.value.current, newPin: pinForm.value.next }),
    });
    if (res.status === 401) {
      pinError.value = t('settings.pin.errorCurrent');
      return;
    }
    if (!res.ok) throw new Error('Server error');
    showToast(t('settings.pin.success'), 'success');
    clearToken();
    // Server revoked all tokens on PIN change — force re-login
    await router.push('/login');
  } catch {
    pinError.value = t('settings.pin.errorSave');
  }
  pinForm.value = { current: '', next: '', confirm: '' };
}

// ─── License / Fleet identity ─────────────────────────────────────────────────
// Read-only: license.json data surfaced via GET /api/license.
// Writing to license.json is handled exclusively by the pairing process (server-side).
const license        = ref<LicenseInfo | null>(null);
const licenseLoading = ref(true);
const licenseError   = ref(false);

async function loadLicense(): Promise<void> {
  licenseLoading.value = true;
  licenseError.value   = false;
  try {
    const res = await fetch('/api/license', { headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    license.value = await res.json() as LicenseInfo;
  } catch {
    licenseError.value = true;
  } finally {
    licenseLoading.value = false;
  }
}

/** Returns a DaisyUI badge class based on the current subscription status. */
function statusBadgeClass(status: SubscriptionStatus): string {
  switch (status) {
    case 'active':     return 'badge-success';
    case 'expired':    return 'badge-error';
    case 'unlicensed': return 'badge-ghost';
    default:           return 'badge-ghost';
  }
}

// ─── Fleet device pairing (ADR-0015) ───────────────────────────────────────────
// Short-code flow: POST /api/pairing/initiate gets a code from Fleet, then we
// poll GET /api/pairing/status/:code every few seconds until it's claimed (or
// expires). Both calls are proxied through our own server — see server.ts —
// so the browser never talks to Fleet directly.
type PairingStatusUi = 'idle' | 'connecting' | 'pending' | 'claimed' | 'expired' | 'error';

const pairingStatus    = ref<PairingStatusUi>('idle');
const pairingCode      = ref<string | null>(null);
const pairingExpiresAt = ref<string | null>(null);
const pairingOrganization  = ref<string | null>(null);
const pairingSecondsLeft   = ref<number | null>(null);

let pairingPollTimer: ReturnType<typeof setInterval> | null = null;
let pairingCountdownTimer: ReturnType<typeof setInterval> | null = null;

const pairingConnectedOrgName = computed(() => pairingOrganization.value ?? license.value?.organizationName ?? '');

const pairingCountdownLabel = computed(() => {
  if (pairingSecondsLeft.value == null) return '';
  const m = Math.floor(pairingSecondsLeft.value / 60);
  const s = pairingSecondsLeft.value % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
});

function stopPairingPoll(): void {
  if (pairingPollTimer !== null) { clearInterval(pairingPollTimer); pairingPollTimer = null; }
}

function stopPairingCountdown(): void {
  if (pairingCountdownTimer !== null) { clearInterval(pairingCountdownTimer); pairingCountdownTimer = null; }
}

/** Recomputed from Date.now() on every tick rather than a fixed decrement —
 *  same drift-resistant pattern as the game clock — so a slow/suspended
 *  browser tab still shows the correct time left once it resumes. */
function updatePairingCountdown(): void {
  if (!pairingExpiresAt.value) { pairingSecondsLeft.value = null; return; }
  const secs = Math.max(0, Math.round((new Date(pairingExpiresAt.value).getTime() - Date.now()) / 1000));
  pairingSecondsLeft.value = secs;
  if (secs === 0 && pairingStatus.value === 'pending') {
    pairingStatus.value = 'expired';
    stopPairingPoll();
    stopPairingCountdown();
  }
}

async function checkPairingStatus(): Promise<void> {
  if (!pairingCode.value) return;
  try {
    const res = await fetch(`/api/pairing/status/${encodeURIComponent(pairingCode.value)}`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json() as PairingStatusResponse;

    if (data.status === 'claimed') {
      pairingStatus.value = 'claimed';
      pairingOrganization.value = data.organizationName;
      stopPairingPoll();
      stopPairingCountdown();
      loadLicense(); // refresh the read-only License card above with the new organization
    } else if (data.status === 'expired') {
      pairingStatus.value = 'expired';
      stopPairingPoll();
      stopPairingCountdown();
    }
    // 'pending' — keep polling, nothing to do yet
  } catch {
    // Transient network hiccup — stay on 'pending' and let the next poll retry,
    // rather than flipping to an error state on a single missed request.
  }
}

async function startPairing(): Promise<void> {
  stopPairingPoll();
  stopPairingCountdown();
  pairingStatus.value = 'connecting';
  pairingCode.value = null;
  pairingExpiresAt.value = null;

  try {
    const res = await fetch('/api/pairing/initiate', { method: 'POST', headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json() as PairingInitiateResponse;

    pairingCode.value = data.code;
    pairingExpiresAt.value = data.expiresAt;
    pairingStatus.value = 'pending';

    updatePairingCountdown();
    pairingCountdownTimer = setInterval(updatePairingCountdown, 1000);
    pairingPollTimer = setInterval(checkPairingStatus, 3000);
  } catch {
    pairingStatus.value = 'error';
  }
}

// ─── Horn output ───────────────────────────────────────────────────────────
// Which client(s) actually sound the horn — set once per venue/device, not
// per game. Undefined until loaded; buttons stay disabled while unresolved
// so a click can't fire against a still-unknown current value.
type HornOutput = 'operator' | 'display' | 'both';
const hornOutputOptions: HornOutput[] = ['operator', 'display', 'both'];
const hornOutput       = ref<HornOutput | null>(null);
const hornOutputSaving = ref(false);

async function loadHornOutput(): Promise<void> {
  try {
    const res = await fetch('/api/settings/horn-output', { headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json() as { hornOutput: HornOutput };
    hornOutput.value = data.hornOutput;
  } catch {
    hornOutput.value = 'both'; // matches the server's own fallback default
  }
}

async function setHornOutput(value: HornOutput): Promise<void> {
  if (value === hornOutput.value || hornOutputSaving.value) return;
  const previous = hornOutput.value;
  hornOutput.value = value; // optimistic
  hornOutputSaving.value = true;
  try {
    const res = await fetch('/api/settings/horn-output', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body:    JSON.stringify({ hornOutput: value }),
    });
    if (!res.ok) throw new Error('Request failed');
    showToast(t('settings.hornOutput.success'), 'success');
  } catch {
    hornOutput.value = previous; // revert
    showToast(t('settings.hornOutput.saveError'), 'error');
  } finally {
    hornOutputSaving.value = false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadArchivedStates();
  loadLicense();
  loadHornOutput();
});

onUnmounted(() => {
  stopPairingPoll();
  stopPairingCountdown();
});
</script>