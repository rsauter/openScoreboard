<template>
  <div class="bg-base-300 p-4 min-h-screen">
    <h1 class="text-2xl font-bold text-primary text-center mb-3">⏱ {{ t('operator.title') }}</h1>
    
    <div class="grid grid-cols-2 gap-3">

      <!-- ── Spielzeit ── -->
      <div class="card bg-base-100 shadow col-span-2">
        <div class="card-body py-3 px-4">
          <h2 class="text-xs text-base-content/50 uppercase tracking-widest mb-2">{{ t('operator.gametime') }}</h2>
          <div class="clock-display text-5xl font-bold text-primary text-center flex items-center justify-center gap-3">
            <button @click="adjustTime(-1)"
              :title="t('operator.timeCorrection')"
              :class="showTimeAdjust ? 'opacity-100' : 'opacity-0 pointer-events-none'"
              class="btn btn-sm btn-ghost border border-base-content/20 text-primary w-9 shrink-0">−</button>
            <div class="relative h-[1.2em] w-40">
              <input
                ref="clockInputEl"
                type="text"
                :value="clockDisplayValue"
                @focus="onClockFocus"
                @blur="onClockBlur"
                @keydown.enter="onClockEnter"
                @keydown.escape="onClockEscape"
                :class="showTimeAdjust ? 'opacity-100' : 'opacity-0 pointer-events-none'"
                class="text-5xl leading-none font-bold text-primary text-center bg-transparent border-0 outline-none focus:border-b-2 focus:border-primary absolute inset-0 block w-full h-full p-0 m-0"
                style="line-height: 1.2em;"
              />
              <span :class="showTimeAdjust ? 'opacity-0 pointer-events-none' : 'opacity-100'"
                class="absolute inset-0 flex items-center justify-center leading-none">{{ formattedTime }}</span>
            </div>
            <button @click="adjustTime(1)"
              :title="t('operator.timeCorrection')"
              :class="showTimeAdjust ? 'opacity-100' : 'opacity-0 pointer-events-none'"
              class="btn btn-sm btn-ghost border border-base-content/20 text-primary w-9 shrink-0">+</button>
          </div>
          <div class="text-center text-sm text-base-content/50 my-1">{{ phaseText }}</div>
          <div class="flex flex-wrap gap-2 justify-center mt-2">
            <button @click="sendCmd('START')"      class="btn btn-success btn-sm">{{ t('operator.start') }}</button>
            <button @click="sendCmd('STOP')"       class="btn btn-error btn-sm">{{ t('operator.stop') }}</button>
            <button @click="sendCmd('NEXT_PHASE')" class="btn btn-warning btn-sm">{{ t('operator.nextPhase') }}</button>
            <button @click="confirmReset"          class="btn btn-ghost btn-sm">{{ t('operator.reset') }}</button>
          </div>
        </div>
      </div>

      <!-- ── Spielstand ── -->
      <div class="card bg-base-100 shadow">
        <div class="card-body py-3 px-4">
          <h2 class="text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('operator.score') }}</h2>
          <div class="flex items-center justify-around">
            <div class="text-center">
              <div class="text-sm text-base-content/50" v-text="gameState?.homeTeam || t('common.home')"></div>
              <div class="text-5xl font-bold" v-text="gameState?.homeScore ?? 0"></div>
              <div class="flex gap-2 mt-1">
                <button @click="sendCmd('GOAL_HOME')" class="btn btn-success btn-xs">+1</button>
                <button @click="sendCmd('UNDO_HOME')" class="btn btn-ghost btn-xs">−1</button>
              </div>
            </div>
            <div class="text-2xl text-base-content/30">:</div>
            <div class="text-center">
              <div class="text-sm text-base-content/50" v-text="gameState?.awayTeam || t('common.away')"></div>
              <div class="text-5xl font-bold" v-text="gameState?.awayScore ?? 0"></div>
              <div class="flex gap-2 mt-1">
                <button @click="sendCmd('GOAL_AWAY')" class="btn btn-success btn-xs">+1</button>
                <button @click="sendCmd('UNDO_AWAY')" class="btn btn-ghost btn-xs">−1</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Timeout ── -->
      <div class="card bg-base-100 shadow">
        <div class="card-body py-3 px-4">
          <h2 class="text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('operator.timeout') }}</h2>
          <div v-if="gameState?.timeoutActive" class="text-center text-warning font-bold text-2xl mb-2">
            {{ formattedTimeoutRemaining }}
          </div>
          <div class="flex gap-2 justify-center">
            <button @click="sendCmd('TIMEOUT', { team: 'home' } as any)"
              :disabled="timeoutButtonDisabled('home')"
              class="btn btn-warning btn-sm">
              {{ t('operator.timeoutHome', { n: gameState?.homeTimeouts ?? 0 }) }}
            </button>
            <button @click="sendCmd('TIMEOUT', { team: 'away' } as any)"
              :disabled="timeoutButtonDisabled('away')"
              class="btn btn-warning btn-sm">
              {{ t('operator.timeoutAway', { n: gameState?.awayTimeouts ?? 0 }) }}
            </button>
          </div>
        </div>
      </div>

      <!-- ── Strafen ── -->
      <div class="card bg-base-100 shadow col-span-2">
        <div class="card-body py-3 px-4">
          <h2 class="text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('operator.penalties') }}</h2>

          <!-- Strafe erfassen -->
          <div class="grid grid-cols-2 gap-2 mb-3 sm:grid-cols-4">
            <div>
              <label class="label py-0"><span class="label-text text-xs">{{ t('operator.penaltyTeam') }}</span></label>
              <select v-model="penalty.team" class="select select-bordered select-sm w-full">
                <option value="home">{{ gameState?.homeTeam || t('common.home') }}</option>
                <option value="away">{{ gameState?.awayTeam || t('common.away') }}</option>
              </select>
            </div>
            <div>
              <label class="label py-0"><span class="label-text text-xs">{{ t('operator.penaltyPlayer') }}</span></label>
              <input v-model="penalty.player" type="text" :placeholder="t('operator.penaltyPlayerPlaceholder')"
                class="input input-bordered input-sm w-full">
            </div>
            <div>
              <label class="label py-0"><span class="label-text text-xs">{{ t('operator.penaltyType') }}</span></label>
              <select v-model="penalty.typeId" class="select select-bordered select-sm w-full">
                <option v-for="pt in availablePenaltyTypes" :key="pt.id" :value="pt.id">{{ pt.label }}</option>
              </select>
            </div>
            <!-- Begleitung: nur bei Badge-Strafen -->
            <div v-if="isBadgePenalty" class="flex items-center gap-2 pt-5">
              <input type="checkbox" v-model="penalty.hasCompanion" class="checkbox checkbox-sm checkbox-warning">
              <span class="text-sm">{{ t('operator.penaltyCompanion') }}</span>
            </div>
          </div>

          <!-- Companion-Details: erscheinen wenn Badge + hasCompanion -->
          <div v-if="isBadgePenalty && penalty.hasCompanion"
            class="grid grid-cols-2 gap-2 mb-3 bg-warning/10 border border-warning/20 rounded p-2">
            <div>
              <label class="label py-0"><span class="label-text text-xs">{{ t('operator.penaltyCompanionPlayer') }}</span></label>
              <input v-model="penalty.companionPlayer" type="text" :placeholder="t('operator.penaltyPlayerPlaceholder')"
                class="input input-bordered input-sm w-full">
            </div>
            <div>
              <label class="label py-0"><span class="label-text text-xs">{{ t('operator.penaltyCompanionType') }}</span></label>
              <select v-model="penalty.companionType" class="select select-bordered select-sm w-full">
                <option value="2">2 Min</option>
                <option value="5">5 Min</option>
                <option value="2+2">2+2 Min</option>
              </select>
            </div>
          </div>

          <!-- Hinweis wenn Slots voll und Queue aktiv -->
          <div v-if="slotWarning" class="alert alert-warning py-1 px-3 text-xs mb-2">
            ⚠️ {{ slotWarning }}
          </div>

          <button @click="addPenalty" class="btn btn-error btn-sm mb-4">{{ t('operator.addPenalty') }}</button>

          <!-- Aktive Strafen: Slots + Badges pro Team -->
          <div class="grid grid-cols-2 gap-4">
            <div v-for="team in (['home', 'away'] as const)" :key="team">
              <div class="text-xs font-semibold text-base-content/60 mb-1 uppercase">
                {{ team === 'home' ? gameState?.homeTeam : gameState?.awayTeam }}
              </div>

              <!-- Slot-Strafen (laufend) -->
              <div class="space-y-1 mb-2">
                <div v-if="runningSlots(team).length === 0" class="text-xs text-base-content/30 italic">{{ t('operator.noPenalties') }}</div>
                <div v-for="pen in runningSlots(team)" :key="pen.id"
                  class="flex items-center gap-2 bg-error/10 border border-error/30 rounded px-2 py-1 text-sm">
                  <span class="font-bold text-error min-w-[3rem]">
                    <input v-if="!gameState?.running && editingPenaltyId === pen.id"
                      :ref="el => { if (el) penaltyInputRefs[pen.id] = el as HTMLInputElement }"
                      type="text"
                      v-model="penaltyEditValue"
                      @blur="onPenaltyTimeBlur(pen.id)"
                      @keydown.enter="onPenaltyTimeEnter(pen.id)"
                      @keydown.escape="cancelPenaltyEdit"
                      class="input input-ghost text-sm font-bold text-error text-center w-16 p-0 border-0 border-b-2 border-error focus:outline-none"
                    />
                    <span v-else
                      :class="{ 'cursor-pointer hover:text-error/70 underline decoration-dotted': !gameState?.running }"
                      @click="startPenaltyEdit(pen)"
                      :title="!gameState?.running ? t('operator.timeAdjustTitle') : ''">
                      {{ fmt(pen.remaining) }}
                    </span>
                  </span>
                  <span class="flex-1">#{{ pen.player || '?' }} – {{ penLabel(pen.typeId) }}</span>
                  <span v-if="pen.parentPenaltyId" class="badge badge-xs badge-warning">+</span>
                  <button class="btn btn-ghost btn-xs text-base-content/40 hover:text-error" @click="removePenalty(pen.id)">✕</button>
                </div>
              </div>

              <!-- Badge-Strafen (10min etc.) -->
              <div class="space-y-1 mb-2">
                <div v-for="pen in runningBadges(team)" :key="pen.id"
                  class="flex items-center gap-2 bg-warning/10 border border-warning/30 rounded px-2 py-1 text-xs">
                  <span class="badge badge-warning badge-xs">{{ penLabel(pen.typeId) }}</span>
                  <span class="flex-1">#{{ pen.player || '?' }}</span>
                  <span class="text-warning font-mono">{{ fmt(pen.remaining) }}</span>
                  <button class="btn btn-ghost btn-xs text-base-content/40 hover:text-error" @click="removePenalty(pen.id)">✕</button>
                </div>
              </div>

              <!-- Waiting-Strafen (Badge wartet auf Slot-Ablauf) -->
              <div v-if="waitingPenalties(team).length > 0" class="space-y-1 mb-2">
                <div class="text-xs text-base-content/40 mb-0.5">{{ t('operator.waiting2min') }}</div>
                <div v-for="pen in waitingPenalties(team)" :key="pen.id"
                  class="flex items-center gap-2 bg-base-200 border border-base-content/10 rounded px-2 py-1 text-xs opacity-60">
                  <span class="badge badge-warning badge-xs">{{ penLabel(pen.typeId) }}</span>
                  <span class="flex-1">#{{ pen.player || '?' }}</span>
                  <span class="text-base-content/40 italic text-xs">{{ t('operator.startsAfter2min') }}</span>
                  <button class="btn btn-ghost btn-xs text-base-content/30 hover:text-error" @click="removePenalty(pen.id)">✕</button>
                </div>
              </div>

              <!-- Queue -->
              <div v-if="queuedPenalties(team).length > 0" class="mt-1">
                <div class="text-xs text-base-content/40 mb-1">{{ t('operator.queue') }}</div>
                <div v-for="pen in queuedPenalties(team)" :key="pen.id"
                  class="flex items-center gap-2 bg-base-200 border border-base-content/10 rounded px-2 py-1 text-xs">
                  <span class="text-base-content/40 min-w-[1.2rem]">{{ pen.queuePosition }}.</span>
                  <span class="flex-1">#{{ pen.player || '?' }} – {{ penLabel(pen.typeId) }}</span>
                  <div class="flex gap-1">
                    <button v-if="pen.queuePosition! > 1" @click="moveQueue(team, pen.id, 'up')"
                      class="btn btn-ghost btn-xs">↑</button>
                    <button v-if="pen.queuePosition! < queuedPenalties(team).length" @click="moveQueue(team, pen.id, 'down')"
                      class="btn btn-ghost btn-xs">↓</button>
                    <button class="btn btn-ghost btn-xs text-base-content/40 hover:text-error" @click="removePenalty(pen.id)">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Shootout ── -->
      <div class="card bg-base-100 shadow col-span-2" v-if="gameState?.phase === 'shootout'">
        <div class="card-body py-3 px-4">
          <h2 class="text-xs text-base-content/50 uppercase tracking-widest mb-3">{{ t('operator.shootout') }}</h2>
          <div v-if="blockedPlayers.length > 0" class="alert alert-warning py-2 px-3 mb-3 text-sm">
            <span>⚠️ {{ t('operator.blockedPlayers') }}</span>
            <ul class="mt-1 space-y-0.5">
              <li v-for="p in blockedPlayers" :key="p.id">
                {{ p.teamName }} #{{ p.player }} ({{ fmt(p.remaining) }})
              </li>
            </ul>
          </div>
          <div class="grid grid-cols-2 gap-4 text-center">
            <div>
              <div class="text-sm mb-1" v-text="gameState?.homeTeam"></div>
              <div class="text-4xl font-bold text-pink-400" v-text="gameState?.homeShootout"></div>
              <button @click="sendCmd('SO_HOME')" class="btn btn-success btn-sm mt-2">{{ t('operator.goal') }}</button>
            </div>
            <div>
              <div class="text-sm mb-1" v-text="gameState?.awayTeam"></div>
              <div class="text-4xl font-bold text-pink-400" v-text="gameState?.awayShootout"></div>
              <button @click="sendCmd('SO_AWAY')" class="btn btn-success btn-sm mt-2">{{ t('operator.goal') }}</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmt, phaseLabel, displayClockSeconds } from '../shared';
import type { GameState, ClientCommand, Penalty } from '../../shared/types';

const { t } = useI18n();
const gameState         = ref<GameState | null>(null);
const clockDisplayValue = ref('');
const clockInputEl      = ref<HTMLInputElement | null>(null);
let ws: WebSocket | null = null;

// Penalty-Eingabe-State
const penalty = ref({
  team:            'home' as 'home' | 'away',
  player:          '',
  typeId:          '',
  hasCompanion:    false,
  companionPlayer: '',
  companionType:   '2' as '2' | '5' | '2+2',
});

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/socket`;
}

// ── Computed ──────────────────────────────────────────────────────────────────
const formattedTime = computed(() =>
  gameState.value ? fmt(displayClockSeconds(gameState.value)) : fmt(0)
);

const phaseText = computed(() =>
  gameState.value ? phaseLabel(gameState.value, t) : '–'
);

const showTimeAdjust = computed(() => {
  if (!gameState.value) return false;
  return !gameState.value.running && !gameState.value.timeoutActive
    && ['period', 'overtime'].includes(gameState.value.phase);
});

// True only while the clock is actually displaying elapsed time (countUp template
// AND we're in a period/overtime phase — breaks always show remaining time).
const isCountingUp = computed(() => {
  if (!gameState.value) return false;
  return gameState.value.countUp && ['period', 'overtime'].includes(gameState.value.phase);
});

const currentPhaseDuration = computed(() => {
  if (!gameState.value) return 0;
  return gameState.value.phase === 'overtime' ? gameState.value.otDuration : gameState.value.periodDuration;
});

const formattedTimeoutRemaining = computed(() => fmt(gameState.value?.timeoutRemaining ?? 0));

const availablePenaltyTypes = computed(() => gameState.value?.penaltyTypes ?? []);

const selectedPenaltyType = computed(() =>
  availablePenaltyTypes.value.find(pt => pt.id === penalty.value.typeId) ?? null
);

const isBadgePenalty = computed(() => selectedPenaltyType.value?.displayMode === 'badge');

const slotWarning = computed(() => {
  if (!gameState.value || !selectedPenaltyType.value) return '';
  const type = selectedPenaltyType.value;
  if (type.displayMode !== 'slot') return '';
  const slots   = gameState.value.penaltySettings.maxActiveSlots;
  const running = gameState.value.penalties.filter(
    p => p.team === penalty.value.team && p.status === 'running' && p.displayMode === 'slot'
  ).length;
  const queued  = gameState.value.penalties.filter(
    p => p.team === penalty.value.team && p.status === 'queued'
  ).length;
  if (running >= slots) {
    return queued > 0
      ? t('operator.slotsFullQueue', { slots, queued, pos: queued + 1 })
      : t('operator.slotsFull', { slots });
  }
  return '';
});

// Penalty-Listen nach Team und Status
function runningSlots(team: 'home' | 'away'): Penalty[] {
  return (gameState.value?.penalties ?? [])
    .filter(p => p.team === team && p.status === 'running' && p.displayMode === 'slot')
    .sort((a, b) => a.id - b.id);
}

function runningBadges(team: 'home' | 'away'): Penalty[] {
  return (gameState.value?.penalties ?? [])
    .filter(p => p.team === team && p.status === 'running' && p.displayMode === 'badge');
}

function queuedPenalties(team: 'home' | 'away'): Penalty[] {
  return (gameState.value?.penalties ?? [])
    .filter(p => p.team === team && p.status === 'queued')
    .sort((a, b) => (a.queuePosition ?? 99) - (b.queuePosition ?? 99));
}

function waitingPenalties(team: 'home' | 'away'): Penalty[] {
  return (gameState.value?.penalties ?? [])
    .filter(p => p.team === team && p.status === 'waiting');
}

const blockedPlayers = computed(() => {
  if (!gameState.value) return [];
  return gameState.value.penalties
    .filter(p => p.status === 'running' || p.status === 'waiting')
    .map(p => ({
      ...p,
      teamName: p.team === 'home' ? gameState.value!.homeTeam : gameState.value!.awayTeam,
    }));
});

// ── Clock Editing ─────────────────────────────────────────────────────────────
function onClockFocus()  { clockDisplayValue.value = formattedTime.value; }
function onClockBlur()   { clockDisplayValue.value = formattedTime.value; }
function onClockEscape() { clockDisplayValue.value = formattedTime.value; clockInputEl.value?.blur(); }
function onClockEnter() {
  const raw   = clockInputEl.value?.value ?? '';
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const enteredSeconds = parseInt(match[1]) * 60 + parseInt(match[2]);
    const seconds = isCountingUp.value
      ? Math.max(0, currentPhaseDuration.value - enteredSeconds)
      : enteredSeconds;
    sendCmd('SET_TIME', { seconds } as any);
  }
  clockInputEl.value?.blur();
}

// ── Timeout ───────────────────────────────────────────────────────────────────
function timeoutButtonDisabled(team: 'home' | 'away') {
  return !gameState.value
    || !!gameState.value.timeoutActive
    || (team === 'home' ? gameState.value.homeTimeouts === 0 : gameState.value.awayTimeouts === 0);
}

// ── Penalty Actions ───────────────────────────────────────────────────────────
function addPenalty() {
  if (!penalty.value.player.trim() || !penalty.value.typeId) return;
  if (isBadgePenalty.value && penalty.value.hasCompanion && !penalty.value.companionPlayer.trim()) {
    alert(t('operator.alertCompanionPlayer'));
    return;
  }
  sendCmd('ADD_PENALTY', {
    team:      penalty.value.team,
    player:    penalty.value.player.trim(),
    typeId:    penalty.value.typeId,
    companion: (isBadgePenalty.value && penalty.value.hasCompanion)
      ? { player: penalty.value.companionPlayer.trim(), type: penalty.value.companionType }
      : undefined,
  } as any);
  penalty.value.player          = '';
  penalty.value.companionPlayer = '';
  penalty.value.hasCompanion    = false;
}

function removePenalty(id: number) {
  sendCmd('REMOVE_PENALTY', { id } as any);
}

function moveQueue(team: 'home' | 'away', id: number, dir: 'up' | 'down') {
  const list = queuedPenalties(team);
  const idx  = list.findIndex(p => p.id === id);
  if (idx < 0) return;
  const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return;
  const newOrder = [...list];
  [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
  sendCmd('REORDER_QUEUE', { team, orderedIds: newOrder.map(p => p.id) } as any);
}

function penLabel(typeId: string): string {
  return gameState.value?.penaltyTypes.find(pt => pt.id === typeId)?.label ?? typeId;
}

// ── Penalty Time Editing ──────────────────────────────────────────────────────
const editingPenaltyId = ref<number | null>(null);
const penaltyEditValue = ref('');
const penaltyInputRefs = ref<Record<number, HTMLInputElement>>({});

function startPenaltyEdit(pen: Penalty) {
  if (gameState.value?.running) return;
  editingPenaltyId.value = pen.id;
  penaltyEditValue.value = fmt(pen.remaining);
  nextTick(() => { penaltyInputRefs.value[pen.id]?.select(); });
}

function cancelPenaltyEdit() {
  editingPenaltyId.value = null;
}

function commitPenaltyTime(id: number) {
  const raw   = penaltyEditValue.value.trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const secs = parseInt(match[1]) * 60 + parseInt(match[2]);
    sendCmd('SET_PENALTY_TIME', { id, seconds: secs } as any);
  }
  editingPenaltyId.value = null;
}

function onPenaltyTimeEnter(id: number) { commitPenaltyTime(id); }
function onPenaltyTimeBlur(id: number)  { if (editingPenaltyId.value === id) commitPenaltyTime(id); }

function adjustTime(delta: number) {
  // delta is expressed relative to the displayed clock. timeRemaining itself always
  // counts down, so when displaying elapsed time (countUp) the sign must be flipped.
  const serverDelta = isCountingUp.value ? -delta : delta;
  sendCmd('ADJUST_TIME', { delta: serverDelta } as any);
}

function confirmReset() {
  if (!confirm(t('operator.resetConfirm'))) return;
  sendCmd('RESET');
  setTimeout(() => { window.location.href = '/gamestart'; }, 300);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
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

function connectWebSocket() {
  ws = new WebSocket(wsUrl());
  ws.addEventListener('open', () => {
    reconnectAttempt = 0;
  });
  ws.addEventListener('close', () => {
    scheduleReconnect();
  });
  ws.addEventListener('error', () => { ws?.close(); });
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data) as { type: string; state?: GameState; reason?: string };
    if (message.type === 'STATE' && message.state) {
      gameState.value = message.state;
      const types = message.state.penaltyTypes ?? [];
      if (types.length && (!penalty.value.typeId || !types.find(pt => pt.id === penalty.value.typeId))) {
        penalty.value.typeId = types[0].id;
      }
      if (document.activeElement !== clockInputEl.value) {
        clockDisplayValue.value = fmt(displayClockSeconds(message.state));
      }
    }
    if (message.type === 'BUZZER' && message.reason) {
      playBuzzer(message.reason as any);
    }
  });
}

function sendCmd(cmd: ClientCommand['cmd'], extra: Partial<ClientCommand> = {}) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ cmd, ...extra }));
}

// ── Buzzer ────────────────────────────────────────────────────────────────────
function playBuzzer(reason: 'period' | 'timeout' | 'penalty') {
  try {
    const ctx  = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.connect(gain);
    if (reason === 'period') {
      osc.frequency.value = 440; gain.gain.value = 0.4;
      osc.start(); osc.stop(ctx.currentTime + 1.2);
    } else if (reason === 'timeout') {
      osc.frequency.value = 880; gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.5);
    } else {
      osc.frequency.value = 660; gain.gain.value = 0.2;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    }
  } catch { /* AudioContext not available */ }
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