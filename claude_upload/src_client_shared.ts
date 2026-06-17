import { ref } from 'vue';

export function fmt(s: number): string {
  const c = Math.ceil(s);
  return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`;
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

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    return data.db === 'ok';
  } catch {
    return false;
  }
}

// ─── Global Status Bar ────────────────────────────────────────────────────────
// Reactive ref — rendered by App.vue as a sticky footer bar.
// All pages call updateStatusBar() as before; App.vue displays statusText.

export const statusText = ref('');

export async function updateStatusBar(wsStatus: string | null = null): Promise<void> {
  const dbOk = await checkHealth();
  const dbPart = dbOk ? '🟢 DB online' : '🔴 DB offline';
  statusText.value = wsStatus !== null ? `${wsStatus} | ${dbPart}` : dbPart;
}

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