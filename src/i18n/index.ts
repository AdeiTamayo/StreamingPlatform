import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en/translation.json';
import es from '../locales/es/translation.json';
import eu from '../locales/eu/translation.json';
import { getLanguage, setLanguage, type AppLanguage } from './language';

export { APP_LANGUAGES, DEFAULT_LANGUAGE, getLanguage, isAppLanguage, toBcp47 } from './language';
export type { AppLanguage } from './language';

export function applyDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    eu: { translation: eu },
  },
  lng: getLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'es', 'eu'],
  defaultNS: 'translation',
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

/** Switches the UI language and persists it as a local preference. */
export function setAppLanguage(language: AppLanguage): void {
  setLanguage(language);
  void i18n.changeLanguage(language);
}

export default i18n;
