export const LANGUAGE_KEY = 'language';

// Flags live in /public/flags (served from the site root).
export const APP_LANGUAGES = [
  { code: 'en', label: 'English', flag: '/flags/en.svg' },
  { code: 'es', label: 'Español', flag: '/flags/es.svg' },
  { code: 'eu', label: 'Euskara', flag: '/flags/eu.svg' },
] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number]['code'];

const SUPPORTED = new Set<string>(APP_LANGUAGES.map((language) => language.code));

export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value != null && SUPPORTED.has(value);
}

// Local-only preference, like the video source and timezone: it is not mirrored
// to Supabase and survives "clear local data" so the UI stays in the language
// the user chose.
export function getLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(language: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Quota/private mode: the in-memory language still changes for this session.
  }
}

/** Maps our app codes to the BCP-47 tags used by Intl and (later) TMDB. */
export function toBcp47(language: string): string {
  if (language === 'es') return 'es-ES';
  if (language === 'eu') return 'eu-ES';
  return 'en-US';
}