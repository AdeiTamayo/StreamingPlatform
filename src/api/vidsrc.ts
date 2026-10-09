import CONFIG from '../config';

type SourceEntry = {
  movie: (id: string | number, startAt?: number) => string;
  tv: (id: string | number, s: number, e: number, startAt?: number) => string;
};

const SOURCES: Record<string, SourceEntry> = {
  vidsrc: {
    movie: (id, startAt) => `${CONFIG.VIDSRC_BASE}/embed/movie/${id}?autoplay=1${startAt ? `&t=${startAt}` : ''}`,
    tv: (id, s, e, startAt) => `${CONFIG.VIDSRC_BASE}/embed/tv/${id}/${s}/${e}?autoplay=1${startAt ? `&t=${startAt}` : ''}`,
  },
  // 2embed uses path-style URLs (documented by that service); it has no
  // reliable start-time parameter, so resume is handled app-side for it.
  '2embed': {
    movie: (id) => `https://www.2embed.cc/embed/${id}?autoplay=1`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}&autoplay=1`,
  },
  embos: {
    movie: (id, startAt) => `https://embos.top/movie/?mid=${id}&autoplay=1${startAt ? `&t=${startAt}` : ''}`,
    tv: (id, s, e, startAt) => `https://embos.top/tv/?mid=${id}&s=${s}&e=${e}&autoplay=1${startAt ? `&t=${startAt}` : ''}`,
  },
};

const DEFAULT_SOURCE = 'vidsrc';

// `source` reaches here from localStorage and is user-writable via Settings ->
// Import, so it must be validated as a key rather than trusted. Optional
// chaining is not enough: indexing a plain object with "constructor",
// "toString" or "__proto__" resolves an inherited function and then throws
// when .movie / .tv is called.
function resolveSource(source: string): SourceEntry {
  return Object.hasOwn(SOURCES, source) ? SOURCES[source] : SOURCES[DEFAULT_SOURCE];
}

export function getMovieEmbedUrl(tmdbId: string | number, source: string = DEFAULT_SOURCE, startAt?: number): string {
  return resolveSource(source).movie(tmdbId, startAt);
}

export function getTVEmbedUrl(tmdbId: string | number, season: number, episode: number, source: string = DEFAULT_SOURCE, startAt?: number): string {
  return resolveSource(source).tv(tmdbId, season, episode, startAt);
}

export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    vidsrc: 'VidSrc',
    '2embed': '2Embed',
    embos: 'Embos',
  };
  return Object.hasOwn(labels, source) ? labels[source] : source;
}

export const SOURCE_KEYS: string[] = Object.keys(SOURCES);
