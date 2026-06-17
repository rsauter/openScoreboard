<template>
  <div class="max-w-2xl mx-auto px-4 py-8 space-y-8">
    <h1 class="text-2xl font-bold">{{ t('nav.settings') }}</h1>

    <!-- ─── Sprache ──────────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.language') }}</h2>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="lang in locales"
            :key="lang.code"
            class="btn btn-lg gap-2"
            :class="currentLocale === lang.code ? 'btn-primary' : 'btn-ghost border border-base-content/20'"
            @click="switchLocale(lang.code)"
          >
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
          <button
            v-for="theme in themes"
            :key="theme"
            class="btn btn-sm justify-start gap-2 font-normal"
            :class="currentTheme === theme ? 'btn-primary' : 'btn-ghost border border-base-content/20'"
            @click="setTheme(theme)"
          >
            <span class="flex gap-0.5 shrink-0">
              <span
                v-for="(color, i) in themeSwatches[theme] ?? []"
                :key="i"
                class="inline-block w-3 h-3 rounded-sm"
                :style="{ background: color }"
              ></span>
            </span>
            {{ theme }}
            <span v-if="currentTheme === theme" class="ml-auto text-xs opacity-60">✓</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ─── About ────────────────────────────────────────────────────────── -->
    <div class="card bg-base-200 shadow">
      <div class="card-body gap-4">
        <h2 class="card-title text-base">{{ t('settings.about') }}</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <img src="../assets/logo_color_standard.svg" alt="sluiten SCOREBOARD Logo" class="h-16 w-auto" />
        </div>
      </div>
    </div>

  </div>
</template>

    

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { setLocale, type Locale } from '../i18n';

const { t, locale } = useI18n();

// ─── Sprache ─────────────────────────────────────────────────────────────────
const locales = [
  { code: 'de' as Locale, label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'fr' as Locale, label: 'Français', flag: '🇫🇷' },
  { code: 'it' as Locale, label: 'Italiano', flag: '🇮🇹' },
  { code: 'en' as Locale, label: 'English',  flag: '🇬🇧' },
];
const currentLocale = computed(() => locale.value);
function switchLocale(code: Locale) { setLocale(code); }

// ─── Theme ───────────────────────────────────────────────────────────────────
const themes = [
  'light', 'dark', 'cupcake', 'emerald', 'corporate', 'synthwave',
  'retro', 'cyberpunk', 'halloween', 'forest', 'aqua', 'lofi',
  'black', 'luxury', 'dracula', 'autumn', 'business', 'night',
  'coffee', 'winter', 'dim', 'nord', 'sunset',
];

const currentTheme = ref(localStorage.getItem('theme') ?? 'dark');

function setTheme(theme: string) {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

// Farb-Swatches pro Theme (base / primary / secondary / accent)
const themeSwatches: Record<string, string[]> = {
  light:      ['#ffffff', '#570df8', '#f000b8', '#37cdbe'],
  dark:       ['#1d232a', '#661ae6', '#d926a9', '#1fb2a6'],
  cupcake:    ['#faf7f5', '#65c3c8', '#ef9fbc', '#eeaf3a'],
  emerald:    ['#ffffff', '#66cc8a', '#377cfb', '#ea5234'],
  corporate:  ['#ffffff', '#4b6bfb', '#7b92b2', '#67cba0'],
  synthwave:  ['#1a1033', '#e779c1', '#58c7f3', '#f3cc30'],
  retro:      ['#e4d8b4', '#ef9900', '#dc8850', '#00c7b7'],
  cyberpunk:  ['#ffee00', '#ff7598', '#75d1f0', '#c07eec'],
  halloween:  ['#212121', '#f28c18', '#6d3a9c', '#51a800'],
  forest:     ['#171212', '#1eb854', '#1db88e', '#1db8ab'],
  aqua:       ['#345da7', '#09ecf3', '#966fb3', '#ffe999'],
  lofi:       ['#ffffff', '#0d0d0d', '#1a1a1a', '#262626'],
  black:      ['#000000', '#343232', '#272626', '#343232'],
  luxury:     ['#09090b', '#ffffff', '#152747', '#513448'],
  dracula:    ['#282a36', '#ff79c6', '#bd93f9', '#ffb86c'],
  autumn:     ['#f1f1f1', '#8c0327', '#d85251', '#d59b6a'],
  business:   ['#1d232a', '#1c4f82', '#7c909a', '#e9d574'],
  night:      ['#0f172a', '#38bdf8', '#818cf8', '#f471b5'],
  coffee:     ['#20161f', '#db924b', '#263e3f', '#10576d'],
  winter:     ['#ffffff', '#047aed', '#463aa1', '#c148ac'],
  dim:        ['#2a303c', '#9ce99a', '#86d8f7', '#f4a261'],
  nord:       ['#2e3440', '#5e81ac', '#81a1c1', '#88c0d0'],
  sunset:     ['#f0ebe3', '#d05b3a', '#d06c4d', '#d07a66'],
};
</script>