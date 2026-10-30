import { describe, it, expect, afterEach } from 'vitest';
import i18n from '../../i18n';
import { genreTranslationKey, localizedGenreName } from '../genres';

describe('localizedGenreName', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates known TMDB genre ids instead of using the API name', async () => {
    await i18n.changeLanguage('es');

    expect(localizedGenreName({ id: 28, name: 'Action' }, i18n.t)).toBe('Acción');
    expect(localizedGenreName({ id: 10765, name: 'Sci-Fi & Fantasy' }, i18n.t)).toBe(
      'Ciencia ficción y fantasía',
    );
    expect(localizedGenreName({ id: 10767, name: 'Talk' }, i18n.t)).toBe('Programa de debate');
  });

  it('translates movie and TV genres that share an id only once', () => {
    expect(genreTranslationKey(18)).toBe('drama');
    expect(genreTranslationKey(37)).toBe('western');
    expect(localizedGenreName({ id: 18, name: 'Drama' }, i18n.t)).toBe('Drama');
  });

  it('falls back to the TMDB name for ids we do not translate', () => {
    expect(genreTranslationKey(999999)).toBeUndefined();
    expect(localizedGenreName({ id: 999999, name: 'Made Up' }, i18n.t)).toBe('Made Up');
  });
});
