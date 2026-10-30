import type { TFunction } from 'i18next';

/**
 * TMDB genre ids are stable across languages, but the `name` it returns follows
 * the request language (English by default). Map the ids we know to the app's
 * translated `genres.*` keys so filters match the selected language instead of
 * showing TMDB's English labels.
 */
const GENRE_KEYS: Record<number, string> = {
  // Shared / movie genres
  28: 'action',
  12: 'adventure',
  16: 'animation',
  35: 'comedy',
  80: 'crime',
  99: 'documentary',
  18: 'drama',
  10751: 'family',
  14: 'fantasy',
  36: 'history',
  27: 'horror',
  10402: 'music',
  9648: 'mystery',
  10749: 'romance',
  878: 'sciFi',
  53: 'thriller',
  10752: 'war',
  37: 'western',
  10770: 'tvMovie',
  // TV-only genres
  10759: 'actionAdventure',
  10762: 'kids',
  10763: 'news',
  10764: 'reality',
  10765: 'sciFiFantasy',
  10766: 'soap',
  10767: 'talk',
  10768: 'warPolitics',
};

/** Returns the `genres.*` key for a TMDB genre id, when we have a translation. */
export function genreTranslationKey(id: number): string | undefined {
  return GENRE_KEYS[id];
}

/** Translates a TMDB genre, falling back to TMDB's own name for unknown ids. */
export function localizedGenreName(genre: { id: number; name: string }, t: TFunction): string {
  const key = genreTranslationKey(genre.id);
  return key ? t(`genres.${key}`) : genre.name;
}
