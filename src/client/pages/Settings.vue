<template>
      <div class="max-w-2xl mx-auto px-4 py-8 space-y-8">
        <h1 class="text-2xl font-bold">{{ t('nav.settings') }}</h1>

        <!-- ─── Sprache ──────────────────────────────────────────────────────── -->
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
                  <span v-for="(color, i) in themeSwatches[theme] ?? []" :key="i"
                    class="inline-block w-3 h-3 rounded-sm" :style="{ background: color }"></span>
                </span>
                {{ theme }}
                <span v-if="currentTheme === theme" class="ml-auto text-xs opacity-60">✓</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ─── Beendete Spiele (Archiv) ────────────────────────────────────────── -->
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
                        home: entry.homeTeam, away: entry.awayTeam, homeScore:
                          entry.homeScore, awayScore: entry.awayScore }) }}
                    </span>
                    <span class="text-xs opacity-60">{{ formatTimestamp(entry.archivedAt) }}</span>
                  </div>
                  <button class="btn btn-ghost btn-sm btn-circle text-error shrink-0" :aria-label="t('common.delete')"
                    @click="deleteArchivedState(entry)">
                    ✕
                  </button>
                </li>
              </ul>
            </template>
          </div>
        </div>

        <!-- ─── Operator-PIN ──────────────────────────────────────────────── -->
        <div class="card bg-base-200 shadow">
          <div class="card-body gap-4">
            <h2 class="card-title text-base">{{ t('settings.pin.title') }}</h2>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class="label py-0"><span class="label-text text-xs">{{ t('settings.pin.currentPin') }}</span></label>
                <input v-model="pinForm.current" type="password" inputmode="numeric"
                  :placeholder="t('settings.pin.currentPin')"
                  class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="label py-0"><span class="label-text text-xs">{{ t('settings.pin.newPin') }}</span></label>
                <input v-model="pinForm.next" type="password" inputmode="numeric"
                  :placeholder="t('settings.pin.newPin')"
                  class="input input-bordered input-sm w-full" />
              </div>
              <div>
                <label class="label py-0"><span class="label-text text-xs">{{ t('settings.pin.confirmPin') }}</span></label>
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

        <!-- ─── About ────────────────────────────────────────────────────────── -->
        <div class="card bg-base-200 shadow">
          <div class="card-body gap-4">
            <h2 class="card-title text-base">{{ t('settings.about') }}</h2>
            <h3 class="card-subtitle text-base">{{ t('nav.title') }}</h3>
            <h3 class="card-subtitle text-base">{{ t('nav.subTitle') }}</h3>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <img src="../assets/logo_color_standard.svg" alt="sluiten SCOREBOARD Logo" class="h-26 w-auto" />
            </div>
            
          </div>
        </div>

      </div>
    </template>



<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { setLocale, type Locale } from '../i18n';
import { showConfirm, showToast, authHeaders, clearToken } from '../shared';
import type { ArchivedStateInfo } from '../../shared/types';

const { t, locale } = useI18n();
const router = useRouter();

// ─── Sprache ─────────────────────────────────────────────────────────────────
const locales = [
  { code: 'de' as Locale, label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr' as Locale, label: 'Français', flag: '🇫🇷' },
  { code: 'it' as Locale, label: 'Italiano', flag: '🇮🇹' },
  { code: 'en' as Locale, label: 'English', flag: '🇬🇧' },
];
const currentLocale = computed(() => locale.value);
function switchLocale(code: Locale) { setLocale(code); }

// ─── Theme ───────────────────────────────────────────────────────────────────
const THEME_KEY     = 'osb.theme';
const THEME_KEY_OLD = 'theme';

// Migrate legacy key
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

const currentTheme = ref(localStorage.getItem(THEME_KEY) ?? 'dark');

function setTheme(theme: string) {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

// Farb-Swatches pro Theme (base / primary / secondary / accent)
const themeSwatches: Record<string, string[]> = {
  light: ['#ffffff', '#570df8', '#f000b8', '#37cdbe'],
  dark: ['#1d232a', '#661ae6', '#d926a9', '#1fb2a6'],
  cupcake: ['#faf7f5', '#65c3c8', '#ef9fbc', '#eeaf3a'],
  emerald: ['#ffffff', '#66cc8a', '#377cfb', '#ea5234'],
  corporate: ['#ffffff', '#4b6bfb', '#7b92b2', '#67cba0'],
  synthwave: ['#1a1033', '#e779c1', '#58c7f3', '#f3cc30'],
  retro: ['#e4d8b4', '#ef9900', '#dc8850', '#00c7b7'],
  cyberpunk: ['#ffee00', '#ff7598', '#75d1f0', '#c07eec'],
  halloween: ['#212121', '#f28c18', '#6d3a9c', '#51a800'],
  forest: ['#171212', '#1eb854', '#1db88e', '#1db8ab'],
  aqua: ['#345da7', '#09ecf3', '#966fb3', '#ffe999'],
  lofi: ['#ffffff', '#0d0d0d', '#1a1a1a', '#262626'],
  black: ['#000000', '#343232', '#272626', '#343232'],
  luxury: ['#09090b', '#ffffff', '#152747', '#513448'],
  dracula: ['#282a36', '#ff79c6', '#bd93f9', '#ffb86c'],
  autumn: ['#f1f1f1', '#8c0327', '#d85251', '#d59b6a'],
  business: ['#1d232a', '#1c4f82', '#7c909a', '#e9d574'],
  night: ['#0f172a', '#38bdf8', '#818cf8', '#f471b5'],
  coffee: ['#20161f', '#db924b', '#263e3f', '#10576d'],
  winter: ['#ffffff', '#047aed', '#463aa1', '#c148ac'],
  dim: ['#2a303c', '#9ce99a', '#86d8f7', '#f4a261'],
  nord: ['#2e3440', '#5e81ac', '#81a1c1', '#88c0d0'],
  sunset: ['#f0ebe3', '#d05b3a', '#d06c4d', '#d07a66'],
};

// ─── Beendete Spiele (Archiv) ──────────────────────────────────────────────────
const archivedStates = ref<ArchivedStateInfo[]>([]);
const archiveLoading = ref(true);
const archiveError = ref(false);
const manyThreshold = 20;

async function loadArchivedStates(): Promise<void> {
  archiveLoading.value = true;
  archiveError.value = false;
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
    title: t('settings.archive.deleteTitle'),
    message: t('settings.archive.deleteMessage', { home: entry.homeTeam, away: entry.awayTeam }),
    danger: true,
  });
  if (!ok) return;

  try {
    const res = await fetch(`/api/states/${encodeURIComponent(entry.filename)}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error('Request failed');
    archivedStates.value = archivedStates.value.filter(e => e.filename !== entry.filename);
    showToast(t('settings.archive.deleted'), 'success');
  } catch {
    showToast(t('settings.archive.deleteFailed'), 'error');
  }
}

onMounted(loadArchivedStates);

// ─── Operator-PIN ─────────────────────────────────────────────────────────────
const pinForm  = ref({ current: '', next: '', confirm: '' });
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ currentPin: pinForm.value.current, newPin: pinForm.value.next }),
    });
    if (res.status === 401) {
      pinError.value = t('settings.pin.errorCurrent');
      return;
    }
    if (!res.ok) throw new Error('Server error');
    showToast(t('settings.pin.success'), 'success');
    clearToken();
    // Server has revoked all tokens — redirect to login
    await router.push('/login');
  } catch {
    pinError.value = t('settings.pin.errorSave');
  }
  pinForm.value = { current: '', next: '', confirm: '' };
}
</script>