import { ref } from 'vue';

export function fmt(s: number): string {
  const c = Math.ceil(s);
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`;
}

/** Phases whose duration the countUp flag applies to. Breaks always show remaining time. */
const COUNT_UP_ELIGIBLE_PHASES = new Set(['period', 'overtime']);

/**
 * Returns the number of seconds to display on the main clock, taking the
 * sport's countUp configuration into account. Internally, GameState.timeRemaining
 * always counts down from the period/overtime/break duration to 0 — this function
 * only affects what's shown to the user, never the underlying tick logic.
 *
 * - Breaks (pregame, break, ot_break, so_break) always display remaining time.
 * - period/overtime display remaining time, unless countUp is set, in which case
 *   they display elapsed time (duration - timeRemaining), counting up from 0.
 */
export function displayClockSeconds(
  s: {
    phase:          string;
    timeRemaining:  number;
    periodDuration: number;
    otDuration:     number;
    countUp:        boolean;
  }
): number {
  if (!s.countUp || !COUNT_UP_ELIGIBLE_PHASES.has(s.phase)) return s.timeRemaining;
  const duration = s.phase === 'overtime' ? s.otDuration : s.periodDuration;
  return Math.max(0, duration - s.timeRemaining);
}

export function phaseLabel(
  s: {
    phase: string;
    currentPeriod: number;
    currentOtPeriod: number;
    numPeriods: number;
  },
  t: (key: string, params?: Record<string, unknown>) => string
): string {
  switch (s.phase) {
    case 'pregame':  return t('phase.pregame');
    case 'break':    return t('phase.break');
    case 'ot_break': return t('phase.ot_break');
    case 'so_break': return t('phase.so_break');
    case 'overtime': return s.currentOtPeriod > 1
                       ? t('phase.overtime_n', { n: s.currentOtPeriod })
                       : t('phase.overtime');
    case 'shootout': return t('phase.shootout');
    case 'ended':    return t('phase.ended');
    case 'period': {
      if (s.numPeriods === 2) return s.currentPeriod === 1 ? t('phase.half1') : t('phase.half2');
      if (s.numPeriods === 1) return t('phase.singlePeriod');
      return t('phase.period', { n: s.currentPeriod });
    }
    default: return s.phase;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AUTH_TOKEN_KEY = 'osb.auth.token';

export function getToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Whether the server is running with the default PIN — triggers Statusbar warning.
export const defaultPinActive = ref(false);

// ─── Server Reachability ───────────────────────────────────────────────────────
// Polled centrally by StatusBar.vue — no page needs to trigger this itself.

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) return false;
    const data = await res.json() as { status: string; defaultPin?: boolean };
    defaultPinActive.value = data.defaultPin ?? false;
    return true;
  } catch {
    return false;
  }
}

// ─── Global Status Bar ────────────────────────────────────────────────────────
// Rendered once by StatusBar.vue (mounted in App.vue), visible on every page.
// The WebSocket and the HTTP server live in the same backend process — they
// live and die together — so a single shared status is enough; no need to
// track WS connectivity and server health separately.

export const statusText = ref('');

// #region  ─── Toast System ─────────────────────────────────────────────────────────────

export interface Toast {
  id:      number;
  message: string;
  type:    'success' | 'error' | 'warning' | 'info';
}

let _nextId = 1;
export const toasts = ref<Toast[]>([]);

export function showToast(
  message: string,
  type: Toast['type'] = 'info',
  durationMs = 4000,
): void {
  const id = _nextId++;
  toasts.value.push({ id, message, type });
  setTimeout(() => removeToast(id), durationMs);
}

export function removeToast(id: number): void {
  const idx = toasts.value.findIndex(t => t.id === id);
  if (idx !== -1) toasts.value.splice(idx, 1);
}

// #endregion

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title?:      string;
  message:     string;
  confirmText?: string;
  cancelText?:  string;
  danger?:     boolean;
}

interface ConfirmState {
  open:        boolean;
  options:     ConfirmOptions;
  resolve:     ((v: boolean) => void) | null;
}

export const confirmState = ref<ConfirmState>({
  open:    false,
  options: { message: '' },
  resolve: null,
});

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    confirmState.value = { open: true, options, resolve };
  });
}

export function resolveConfirm(value: boolean): void {
  confirmState.value.open = false;
  confirmState.value.resolve?.(value);
  confirmState.value.resolve = null;
}