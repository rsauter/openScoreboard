<template>
  <!-- ── No game active yet ── -->
  <div v-if="isPregame" class="flex items-center justify-center min-h-screen bg-base-300 px-4">
    <div class="card bg-base-100 shadow max-w-sm w-full">
      <div class="card-body items-center text-center py-8">
        <span class="text-4xl mb-2">⏱</span>
        <p class="text-base-content/60">{{ t('stopwatch.waitingForGame') }}</p>
      </div>
    </div>
  </div>

  <!-- ── Game active: big toggle ── -->
  <div v-else class="flex flex-col items-center justify-center min-h-screen bg-base-300 px-4 gap-6 select-none">
    <div class="text-center">
      <div class="text-sm text-base-content/50 uppercase tracking-widest">{{ phaseText }}</div>
      <div class="text-6xl sm:text-7xl font-bold text-primary tabular-nums mt-1">
        {{ formattedTime }}
      </div>
    </div>

    <button
      type="button"
      @click="toggle"
      :disabled="toggleDisabled"
      class="w-[min(80vw,320px)] h-[min(80vw,320px)] rounded-full text-3xl font-bold uppercase tracking-wide text-white shadow-lg transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
      :class="running ? 'bg-success' : 'bg-error'"
    >
      {{ toggleLabel }}
    </button>

    <div v-if="gameState?.timeoutActive" class="text-warning text-sm font-medium">
      {{ t('stopwatch.timeoutActive') }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { fmt, phaseLabel, displayClockSeconds, getToken, clearToken, currentPhase } from '../shared';
import type { GameState } from '../../shared/types';

const { t } = useI18n();
const router = useRouter();

const gameState = ref<GameState | null>(null);
let ws: WebSocket | null = null;

const isPregame = computed(() => gameState.value === null || gameState.value.phase === 'pregame');
const running   = computed(() => gameState.value?.running ?? false);

// Disabled while an active timeout is running — the timeout's own countdown
// owns the clock at that point (see server.ts TIMEOUT handling), so a
// START/STOP here would fight the timeout logic instead of the game clock.
const toggleDisabled = computed(() => !!gameState.value?.timeoutActive);

const formattedTime = computed(() =>
  gameState.value ? fmt(displayClockSeconds(gameState.value)) : fmt(0)
);

const phaseText = computed(() =>
  gameState.value ? phaseLabel(gameState.value, t) : '–'
);

const toggleLabel = computed(() =>
  running.value ? t('stopwatch.running') : t('stopwatch.stopped')
);

function toggle() {
  if (toggleDisabled.value) return;
  sendCmd(running.value ? 'STOP' : 'START');
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
// Same minimal protocol as Operator.vue: this page is just another authenticated
// client on the same /socket connection, with no separate role/permission concept
// on the server — it can send any command, but only ever sends START/STOP.
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let unmounted = false;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS  = 10000;

function scheduleReconnect() {
  if (unmounted || reconnectTimer) return;
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt, RECONNECT_MAX_DELAY_MS);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/socket`;
}

function connectWebSocket() {
  ws = new WebSocket(wsUrl());
  ws.addEventListener('open', () => {
    reconnectAttempt = 0;
    ws!.send(JSON.stringify({ type: 'AUTH', token: getToken() }));
  });
  ws.addEventListener('close', () => {
    scheduleReconnect();
  });
  ws.addEventListener('error', () => { ws?.close(); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data) as { type: string; state?: GameState };
    if (message.type === 'AUTH_ERROR') {
      clearToken();
      void router.push({ name: 'Login', query: { redirect: '/stopwatch' } });
      return;
    }
    if (message.type === 'STATE' && message.state) {
      gameState.value = message.state;
      currentPhase.value = message.state.phase;
    }
  });
}

function sendCmd(cmd: 'START' | 'STOP') {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ cmd }));
}

onMounted(() => {
  connectWebSocket();
});
onUnmounted(() => {
  unmounted = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  ws?.close();
});
</script>
