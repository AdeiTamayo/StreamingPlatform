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

export function getMovieEmbedUrl(tmdbId: string | number, source: string = 'vidsrc', startAt?: number): string {
  return SOURCES[source]?.movie(tmdbId, startAt) ?? SOURCES.vidsrc.movie(tmdbId, startAt);
}

export function getTVEmbedUrl(tmdbId: string | number, season: number, episode: number, source: string = 'vidsrc', startAt?: number): string {
  return SOURCES[source]?.tv(tmdbId, season, episode, startAt) ?? SOURCES.vidsrc.tv(tmdbId, season, episode, startAt);
}

export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    vidsrc: 'VidSrc',
    '2embed': '2Embed',
    embos: 'Embos',
  };
  return labels[source] || source;
}

export const SOURCE_KEYS: string[] = Object.keys(SOURCES);
