<template>
  <div class="board-outer" :style="{ '--home-color': state?.homeColor || '#c0392b', '--away-color': state?.awayColor || '#2980b9' }">
    <!-- Header row -->
    <div class="header-row">
      <div class="home-header">
        <span class="team-name">{{ state?.homeAbbr || state?.homeTeam || t('common.home') }}</span>
      </div>
      <div class="clock-area">
        <div class="status-bullet" :class="bulletClass"></div>
        <div class="clock" :class="clockClass">{{ state ? fmt(state.timeRemaining) : '20:00' }}</div>
      </div>
      <div class="away-header">
        <span class="team-name">{{ state?.awayAbbr || state?.awayTeam || t('common.away') }}</span>
      </div>
    </div>

    <!-- Score row -->
    <div class="score-row">

      <!-- Home score + slot penalties + badge penalties -->
      <div class="home-score-area">
        <span class="score-digit">{{ state?.homeScore ?? 0 }}</span>
        <div class="pen-boxes-home">
          <div v-if="homeSlotPenalties.length > 0" class="pen-box">
            <div class="pen-header">— {{ t('operator.penalties') }} —</div>
            <div v-for="pen in homeSlotPenalties" :key="pen.id"
              class="pen-item" :class="{ 'pen-waiting': pen.status === 'waiting' }">
              <span class="pen-num">#{{ pen.player || '?' }}</span>
              <span class="pen-rem">{{ pen.status === 'waiting' ? '—' : fmt(pen.remaining) }}</span>
            </div>
          </div>
          <div v-if="homeBadgePenalties.length > 0" class="pen-box pen-box-badge">
            <div class="pen-header">— 10' —</div>
            <div v-for="pen in homeBadgePenalties" :key="pen.id"
              class="pen-item pen-badge" :class="{ 'pen-waiting': pen.status === 'waiting' }">
              <span class="pen-num">#{{ pen.player || '?' }}</span>
              <span class="pen-rem">{{ penLabel(pen.typeId) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Center: Timeout / Shootout -->
      <div class="score-center">
        <div class="timeout-box" :class="{ active: state?.timeoutActive }">
          <div class="timeout-label">▶▶ Timeout ⏱</div>
          <div class="timeout-info">{{ timeoutTeam }} – {{ state ? fmt(state.timeoutRemaining) : '' }}</div>
        </div>
        <div class="shootout-box" v-if="state?.phase === 'shootout' && !state?.timeoutActive">
          <div class="so-label">{{ t('phase.shootout') }}</div>
          <div class="so-scores">{{ state?.homeShootout ?? 0 }} : {{ state?.awayShootout ?? 0 }}</div>
        </div>
      </div>

      <!-- Away score + slot penalties + badge penalties -->
      <div class="away-score-area">
        <span class="score-digit">{{ state?.awayScore ?? 0 }}</span>
        <div class="pen-boxes-away">
          <div v-if="awayBadgePenalties.length > 0" class="pen-box pen-box-badge">
            <div class="pen-header">— 10' —</div>
            <div v-for="pen in awayBadgePenalties" :key="pen.id"
              class="pen-item pen-badge" :class="{ 'pen-waiting': pen.status === 'waiting' }">
              <span class="pen-num">#{{ pen.player || '?' }}</span>
              <span class="pen-rem">{{ penLabel(pen.typeId) }}</span>
            </div>
          </div>
          <div v-if="awaySlotPenalties.length > 0" class="pen-box">
            <div class="pen-header">— {{ t('operator.penalties') }} —</div>
            <div v-for="pen in awaySlotPenalties" :key="pen.id"
              class="pen-item" :class="{ 'pen-waiting': pen.status === 'waiting' }">
              <span class="pen-num">#{{ pen.player || '?' }}</span>
              <span class="pen-rem">{{ pen.status === 'waiting' ? '—' : fmt(pen.remaining) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Phase bar -->
    <div class="phase-row">
      <span class="phase-label">{{ state?.phase ? phaseLabel(state, t) : '---' }}</span>
      <span class="conn-dot" :class="wsConnected ? 'connected' : 'disconnected'"></span>
    </div>

    <!-- Game ended -->
    <div class="ended-banner" v-if="state?.phase === 'ended'">{{ t('phase.ended') }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { fmt, phaseLabel } from '../shared';
import type { GameState } from '../../shared/types';

// ─── Local i18n (no vue-i18n: Display is a separate Vite entry point) ─────────
// Import all locale JSONs statically — no fetch needed, no path issues.

import de from '../i18n/de.json';
import fr from '../i18n/fr.json';
import it from '../i18n/it.json';
import en from '../i18n/en.json';

const locales: Record<string, Record<string, string>> = { de, fr, it, en };

const messages = ref<Record<string, string>>(
  locales[localStorage.getItem('lang') ?? 'de'] ?? de
);

// React to language changes from other tabs / settings page
window.addEventListener('storage', (e) => {
  if (e.key === 'lang' && e.newValue) {
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
    const message = JSON.parse(event.data) as { type: string; state?: GameState };
    if (message.type === 'STATE' && message.state) {
      state.value = message.state;
    }
  });
}

onMounted(() => { connectWebSocket(); });
onUnmounted(() => {
  unmounted = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
});

// ─── Computed ──────────────────────────────────────────────────────────────────

const clockClass = computed(() => {
  if (!state.value) return '';
  if (state.value.phase === 'ended') return 'ended';
  if (state.value.phase === 'break') return 'break';
  if (state.value.running) return 'running';
  return 'paused';
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

const homeSlotPenalties  = computed(() => state.value?.penalties.filter(p => p.team === 'home' && p.displayMode === 'slot'  && (p.status === 'running' || p.status === 'waiting')) ?? []);
const awaySlotPenalties  = computed(() => state.value?.penalties.filter(p => p.team === 'away' && p.displayMode === 'slot'  && (p.status === 'running' || p.status === 'waiting')) ?? []);
const homeBadgePenalties = computed(() => state.value?.penalties.filter(p => p.team === 'home' && p.displayMode === 'badge' && (p.status === 'running' || p.status === 'waiting')) ?? []);
const awayBadgePenalties = computed(() => state.value?.penalties.filter(p => p.team === 'away' && p.displayMode === 'badge' && (p.status === 'running' || p.status === 'waiting')) ?? []);

function penLabel(typeId: string): string {
  return state.value?.penaltyTypes.find(pt => pt.id === typeId)?.label ?? typeId;
}
</script>