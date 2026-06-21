import { createI18n } from 'vue-i18n';
import de from './de.json';
import fr from './fr.json';
import it from './it.json';
import en from './en.json';

const LOCALES = ['de', 'fr', 'it', 'en'] as const;
export type Locale = typeof LOCALES[number];

// Canonical key (with osb. prefix). Migrates the legacy key on first access.
const STORAGE_KEY     = 'osb.locale';
const STORAGE_KEY_OLD = 'locale';

function getInitialLocale(): Locale {
  // Migrate legacy key if present
  const legacy = localStorage.getItem(STORAGE_KEY_OLD);
  if (legacy && LOCALES.includes(legacy as Locale)) {
    localStorage.setItem(STORAGE_KEY, legacy);
    localStorage.removeItem(STORAGE_KEY_OLD);
  }

  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && LOCALES.includes(stored)) return stored;
  // Browser language as Fallback
  const lang = navigator.language.split('-')[0];
  if (LOCALES.includes(lang as Locale)) return lang as Locale;
  return 'de';
}

const initialLocale = getInitialLocale();
if (typeof document !== 'undefined') {
  document.documentElement.lang = initialLocale;
}

export const i18n = createI18n({
  legacy: false,          // Composition API Modus
  locale: initialLocale,
  fallbackLocale: 'de',
  messages: { de, fr, it, en },
});

export function setLocale(locale: Locale) {
  (i18n.global.locale as any).value = locale;
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function useAppLocale() {
  return {
    locale: i18n.global.locale,
    setLocale,
  };
}