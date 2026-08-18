<template>
  <div class="board-outer" :style="{ '--home-color': state?.homeColor || '#c0392b', '--away-color': state?.awayColor || '#2980b9' }">

    <!-- Phase header (top) -->
    <div class="phase-row">
      <span class="phase-label">{{ state?.phase ? phaseLabel(state, t) : '---' }}</span>
      <span class="conn-dot" :class="wsConnected ? 'connected' : 'disconnected'"></span>
    </div>

    <!-- Clock -->
    <div class="clock-row">
      <div class="clock-pill" :class="clockClass">
        <span class="status-dot" :class="bulletClass"></span>
        <span>{{ formattedClock }}</span>
      </div>
    </div>

    <!-- Timeout / shootout -->
    <div class="event-row">
      <div class="event-pill timeout" v-if="state?.timeoutActive">
        <span class="event-label">▶▶ Timeout</span>
        <span class="event-detail">{{ timeoutTeam }} · {{ state ? fmt(state.timeoutRemaining) : '' }}</span>
      </div>
      <div class="event-pill shootout" v-else-if="state?.phase === 'shootout'">
        <span class="event-label">{{ t('phase.shootout') }}</span>
        <span class="event-score">{{ state?.homeShootout ?? 0 }} : {{ state?.awayShootout ?? 0 }}</span>
      </div>
    </div>

    <!-- Score -->
    <div class="score-wrap">
      <div class="score-cluster">
        <span class="team-name">{{ state?.homeAbbr || state?.homeTeam || t('common.home') }}</span>
        <div class="wedge home"></div>
        <span class="score-slot home">{{ state?.homeScore ?? 0 }}</span>
        <span class="score-sep">–</span>
        <span class="score-slot away">{{ state?.awayScore ?? 0 }}</span>
        <div class="wedge away"></div>
        <span class="team-name">{{ state?.awayAbbr || state?.awayTeam || t('common.away') }}</span>
      </div>
    </div>

    <!-- Penalties: home slot | home badge | away badge | away slot -->
    <div class="pen-strip">
      <div class="pen-zone">
        <span class="pen-zone-label" v-if="homeSlotPenalties.length > 0">{{ t('operator.penalties') }}</span>
        <div v-for="pen in homeSlotPenalties" :key="pen.id"
          class="pen-chip" :class="{ 'pen-waiting': pen.status === 'waiting' }">
          <span>#{{ pen.player || '?' }}</span>
          <span class="pen-rem">{{ pen.status === 'waiting' ? '—' : fmt(pen.remaining) }}</span>
        </div>
      </div>
      <div class="badge-zone home">
        <div v-for="pen in homeBadgePenalties" :key="pen.id"
          class="badge-chip" :class="{ 'pen-waiting': pen.status === 'waiting' }">
          <span class="badge-num">#{{ pen.player || '?' }}</span>
          <span class="badge-label">{{ penLabel(pen.typeId) }}</span>
        </div>
      </div>
      <div class="badge-zone away">
        <div v-for="pen in awayBadgePenalties" :key="pen.id"
          class="badge-chip" :class="{ 'pen-waiting': pen.status === 'waiting' }">
          <span class="badge-num">#{{ pen.player || '?' }}</span>
          <span class="badge-label">{{ penLabel(pen.typeId) }}</span>
        </div>
      </div>
      <div class="pen-zone">
        <span class="pen-zone-label" v-if="awaySlotPenalties.length > 0">{{ t('operator.penalties') }}</span>
        <div v-for="pen in awaySlotPenalties" :key="pen.id"
          class="pen-chip" :class="{ 'pen-waiting': pen.status === 'waiting' }">
          <span>#{{ pen.player || '?' }}</span>
          <span class="pen-rem">{{ pen.status === 'waiting' ? '—' : fmt(pen.remaining) }}</span>
        </div>
      </div>
    </div>

    <!-- Game ended -->
    <div class="ended-banner" v-if="state?.phase === 'ended'">{{ t('phase.ended') }}</div>

    <!-- Audio unlock hint — only shown if the browser actually blocked the
         horn (see playBuzzer()). Non-blocking: the scoreboard underneath
         stays fully visible and usable even if nobody ever taps this. -->
    <div class="audio-hint" v-if="audioBlocked" @click="unlockAudio">
      🔇 {{ t('display.tapToEnableSound') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fmt, phaseLabel, displayClockSeconds } from '../shared';
import type { GameState } from '../../shared/types';

// ─── Local i18n (no vue-i18n: Display is a separate Vite entry point) ─────────
// Import all locale JSONs statically — no fetch needed, no path issues.

import de from '../i18n/de.json';
import fr from '../i18n/fr.json';
import it from '../i18n/it.json';
import en from '../i18n/en.json';

// Same horn assets as Operator.vue (src/client/assets/).
import hornShortUrl from '../assets/horn-short.mp3';
import hornLongUrl  from '../assets/horn-long.mp3';

const locales: Record<string, Record<string, string>> = { de, fr, it, en };

// Migrate legacy keys to osb.locale
const _legacyLang   = localStorage.getItem('lang');
const _legacyLocale = localStorage.getItem('locale');
if (_legacyLang && !localStorage.getItem('osb.locale')) {
  localStorage.setItem('osb.locale', _legacyLang);
  localStorage.removeItem('lang');
} else if (_legacyLocale && !localStorage.getItem('osb.locale')) {
  localStorage.setItem('osb.locale', _legacyLocale);
  localStorage.removeItem('locale');
}

const messages = ref<Record<string, string>>(
  locales[localStorage.getItem('osb.locale') ?? 'de'] ?? de
);

// React to language changes from other tabs / settings page
window.addEventListener('storage', (e) => {
  if (e.key === 'osb.locale' && e.newValue) {
    messages.value = locales[e.newValue] ?? de;
  }
});

function t(key: string, params?: Record<string, unknown>): string {
  let str = messages.value[key] ?? key;
  if (params) Object.entries(params).forEach(([k, v]) => str = str.replace(`{${k}}`, String(v)));
  return str;
}

// ─── WebSocket ─────────────────────────────────────────────────────────────────

const wsConnected = ref(false);
const state       = ref<GameState | null>(null);
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let unmounted = false;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS  = 10000;

function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/socket`;
}

function scheduleReconnect(): void {
  if (unmounted || reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

function connectWebSocket(): void {
  ws = new WebSocket(wsUrl());
  ws.addEventListener('open', () => {
    wsConnected.value = true;
    reconnectAttempt = 0;
  });
  ws.addEventListener('close', () => {
    wsConnected.value = false;
    scheduleReconnect();
  });
  ws.addEventListener('error', () => { ws?.close(); });
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data) as {
      type: string;
      state?: GameState;
      reason?: 'period' | 'timeout' | 'penalty' | 'manual';
      hornOutput?: 'operator' | 'display' | 'both';
    };
    if (message.type === 'STATE' && message.state) {
      state.value = message.state;
    }
    if (message.type === 'BUZZER' && message.reason) {
      playBuzzer(message.reason, message.hornOutput);
    }
  });
}

// ── Horn ──────────────────────────────────────────────────────────────────────
// Mirrors Operator.vue's horn logic. The horn is broadcast to every
// connected client; each client only plays it if hornOutput includes its own
// role, configured once per venue in Settings (see ARCHITECTURE.md). The display can sit anywhere
// — Pi HDMI output or a separate notebook feeding a beamer — and is wired
// into the venue's mixing desk (3.5mm jack) with its own hardware volume,
// same as the operator notebook. No app-side volume control needed.
const hornShort = new Audio(hornShortUrl);
const hornLong  = new Audio(hornLongUrl);

// Only true once the browser has actually rejected an unmuted play() call —
// i.e. no interaction has happened yet on this page/tab. Chrome (and most
// Chromium-based kiosks) remember any user gesture on the document for its
// whole lifetime, so a single tap anywhere is enough to unlock it for good.
// A Chromium kiosk started with --autoplay-policy=no-user-gesture-required
// never blocks in the first place, so this hint simply never appears there.
//
// IMPORTANT: this can only ever become true if playBuzzer() actually attempts
// play() — which it deliberately skips whenever hornOutput excludes 'display'.
// A display that isn't supposed to make sound must never show this hint to
// the audience on the public-facing video wall.
const audioBlocked = ref(false);

function playBuzzer(reason: 'period' | 'timeout' | 'penalty' | 'manual', hornOutput?: 'operator' | 'display' | 'both') {
  // Undefined hornOutput (shouldn't happen once the server sends it, but
  // guards older cached bundles during a rollout) falls back to the
  // previous unconfigurable behavior: play everywhere.
  if (hornOutput && hornOutput !== 'display' && hornOutput !== 'both') return;
  try {
    if (reason === 'period' || reason === 'manual') {
      hornLong.currentTime = 0;
      const p = hornLong.play();
      p?.then(() => { audioBlocked.value = false; }).catch(() => { audioBlocked.value = true; });
    } else if (reason === 'timeout') {
      hornShort.currentTime = 0;
      const p = hornShort.play();
      p?.then(() => { audioBlocked.value = false; }).catch(() => { audioBlocked.value = true; });
    }
    // penalty: intentionally silent — only relevant to bench, not the whole hall.
  } catch {
    audioBlocked.value = true;
  }
}

function unlockAudio(): void {
  // The click itself is the user gesture Chrome needs — nothing else to do.
  // Play a zero-length no-op to consume/confirm it, then hide the hint.
  hornShort.play().then(() => { hornShort.pause(); hornShort.currentTime = 0; }).catch(() => { /* still blocked, try again on next tap */ });
  audioBlocked.value = false;
}

onMounted(() => { connectWebSocket(); });
onUnmounted(() => {
  unmounted = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
});

// ─── Computed ──────────────────────────────────────────────────────────────────

const formattedClock = computed(() =>
  state.value ? fmt(displayClockSeconds(state.value)) : '20:00'
);

// Only 'ended' and 'break' get a distinct clock-pill color on the light
// theme — running/paused both read fine in the default dark pill, the
// status dot already carries that distinction.
const clockClass = computed(() => {
  if (!state.value) return '';
  if (state.value.phase === 'ended') return 'ended';
  if (state.value.phase === 'break') return 'break';
  return '';
});

const bulletClass = computed(() => {
  if (!state.value) return 'inactive';
  if (state.value.phase === 'ended' || state.value.phase === 'pregame') return 'inactive';
  if (state.value.timeoutActive) return 'timeout';
  if (state.value.running) return 'running';
  return 'stopped';
});

const timeoutTeam = computed(() =>
  state.value?.timeoutActive === 'home' ? state.value.homeTeam
  : state.value?.timeoutActive === 'away' ? state.value.awayTeam : ''
);

const homeSlotPenalties = computed(() => state.value?.penalties.filter(p => p.team === 'home' && p.displayMode === 'slot' && (p.status === 'running' || p.status === 'waiting')) ?? []);
const awaySlotPenalties = computed(() => state.value?.penalties.filter(p => p.team === 'away' && p.displayMode === 'slot' && (p.status === 'running' || p.status === 'waiting')) ?? []);

// Badge penalties (10' misconducts etc.) — one column per team, placed
// directly beside that team's slot-penalty column, so which team a badge
// belongs to is unambiguous from position alone.
const homeBadgePenalties = computed(() => state.value?.penalties.filter(p => p.team === 'home' && p.displayMode === 'badge' && (p.status === 'running' || p.status === 'waiting')) ?? []);
const awayBadgePenalties = computed(() => state.value?.penalties.filter(p => p.team === 'away' && p.displayMode === 'badge' && (p.status === 'running' || p.status === 'waiting')) ?? []);

function penLabel(typeId: string): string {
  return state.value?.penaltyTypes.find(pt => pt.id === typeId)?.label ?? typeId;
}
</script>