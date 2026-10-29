import { describe, it, expect, afterEach, vi } from 'vitest';
import i18n, { setAppLanguage, toBcp47 } from '../index';
import { LANGUAGE_KEY } from '../language';
import en from '../../locales/en/translation.json';
import es from '../../locales/es/translation.json';
import eu from '../../locales/eu/translation.json';

function flatten(value: unknown, prefix = ''): string[] {
  if (value == null || typeof value !== 'object') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
    localStorage.clear();
  });

  it('ships the same keys in every locale', () => {
    const source = flatten(en).sort();
    expect(flatten(es).sort()).toEqual(source);
    expect(flatten(eu).sort()).toEqual(source);
  });

  it('switches language, persists it locally, and updates <html lang>', async () => {
    setAppLanguage('es');
    await i18n.changeLanguage('es');

    expect(i18n.t('nav.home')).toBe('Inicio');
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
  });

  it('falls back to English when a Basque key is missing', async () => {
    i18n.addResourceBundle('en', 'translation', { fallbackProbe: 'English only' }, true, true);
    await i18n.changeLanguage('eu');

    expect(i18n.t('fallbackProbe')).toBe('English only');
  });

  it('maps app codes to BCP-47 tags', () => {
    expect(toBcp47('en')).toBe('en-US');
    expect(toBcp47('es')).toBe('es-ES');
    expect(toBcp47('eu')).toBe('eu-ES');
  });

  it('leaves unknown keys visible instead of blank', async () => {
    await i18n.changeLanguage('es');
    expect(i18n.t('missing.key')).toBe('missing.key');
  });

  it('persists through the storage key only (never the translated label)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setAppLanguage('eu');
    await i18n.changeLanguage('eu');

    expect(setItem).toHaveBeenCalledWith(LANGUAGE_KEY, 'eu');
    setItem.mockRestore();
  });
});
