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

// ─── Server Reachability ───────────────────────────────────────────────────────
// Polled centrally by StatusBar.vue — no page needs to trigger this itself.

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    return res.ok;
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

// #region ─── Horn / Buzzer Sound ───────────────────────────────────────────────
//
// Spielt eine echte Hupen-Audiodatei im Browser ab, sobald der Server ein
// BUZZER-Event sendet (Periodenende, Timeout-Ende, manueller Trigger).
// Funktioniert identisch egal ob der Browser auf dem Pi selbst läuft (Klinke
// → Pult) oder irgendwo im Web (Railway) — der Ton kommt immer aus dem Gerät,
// auf dem die Seite gerade offen ist. Genutzt von Operator.vue.
//
// Browser blockieren Audio-Wiedergabe, bis der Nutzer einmal mit der Seite
// interagiert hat (Autoplay-Policy). unlockHornAudio() sollte daher bei der
// ersten Nutzer-Interaktion (z.B. erstem Klick irgendwo auf der Seite)
// aufgerufen werden, damit die spätere automatische Wiedergabe nicht
// stillschweigend fehlschlägt.
//
// Drei Sound-Dateien liegen unter src/client/assets/ (gleicher Ordner wie das
// Logo) und werden daher über Vite's Bundler-Asset-Pipeline importiert statt
// über einen festen public-URL-String — Vite hasht/bündelt sie automatisch:
//   horn-long.mp3    Periodenende / Overtime-Ende / Spielende, und manueller Trigger
//   horn-short.mp3   Timeout-Ende
//   horn-double.mp3  aktuell ungenutzt — bereits eingebunden für spätere Anlässe

import hornLongUrl   from './assets/horn-long.mp3';
import hornShortUrl  from './assets/horn-short.mp3';
import hornDoubleUrl from './assets/horn-double.mp3';

export type HornVariant = 'long' | 'short' | 'double';

const HORN_SOUND_URLS: Record<HornVariant, string> = {
  long:   hornLongUrl,
  short:  hornShortUrl,
  double: hornDoubleUrl,
};

/** Welche Hupe bei welchem BUZZER-reason gespielt wird. */
const HORN_FOR_REASON: Record<'period' | 'timeout' | 'manual', HornVariant> = {
  period:  'long',
  timeout: 'short',
  manual:  'long',
};

const hornAudioCache = new Map<HornVariant, HTMLAudioElement>();
let hornUnlocked = false;

function getHornAudio(variant: HornVariant): HTMLAudioElement {
  let audio = hornAudioCache.get(variant);
  if (!audio) {
    audio = new Audio(HORN_SOUND_URLS[variant]);
    audio.preload = 'auto';
    hornAudioCache.set(variant, audio);
  }
  return audio;
}

/** Einmalig bei einer echten Nutzer-Interaktion aufrufen (z.B. erster Klick),
 *  um die Browser-Autoplay-Sperre für alle Hupen-Varianten zu lösen. */
export function unlockHornAudio(): void {
  if (hornUnlocked) return;
  hornUnlocked = true;
  (Object.keys(HORN_SOUND_URLS) as HornVariant[]).forEach(variant => {
    const audio = getHornAudio(variant);
    // Stummer "Anspiel-Versuch", den Browser als Nutzer-Interaktion akzeptieren —
    // schaltet spätere programmatische play()-Aufrufe ohne erneute Interaktion frei.
    audio.muted = true;
    audio.play()
      .then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; })
      .catch(() => { audio.muted = false; });
  });
}

/** Spielt die passende Hupe für den gegebenen BUZZER-reason sofort ab. */
export function playHornSound(reason: 'period' | 'timeout' | 'manual'): void {
  const audio = getHornAudio(HORN_FOR_REASON[reason]);
  audio.currentTime = 0;
  audio.play().catch(() => {
    // Autoplay vom Browser blockiert (noch keine Nutzer-Interaktion) —
    // bewusst kein Fehler-Toast, da das den Bedienfluss stören würde.
    console.warn('[WARN] Hupe konnte nicht automatisch abgespielt werden (Browser-Autoplay-Sperre).');
  });
}

// #endregion