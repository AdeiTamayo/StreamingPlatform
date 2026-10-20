import CONFIG from '../config';

type SourceEntry = {
  movie: (id: string | number) => string;
  tv: (id: string | number, s: number, e: number) => string;
};

// Every host below was probed live (movie + TV episode) and only kept when it
// resolved the requested TMDB id to the correct title and returned real player
// markup. These services rotate domains frequently, so treat this table as
// something to re-probe, not a permanent fact.
//
// Dropped from an earlier revision of this file: 2embed.cc (the TLS handshake
// is reset on every connection - the host resolves but never serves), 2embed.top
// (HTTP 521), vidsrc.cc (connection timeouts) and vidcore.org (returns a 494
// byte placeholder page).
const SOURCES: Record<string, SourceEntry> = {
  vidsrc: {
    movie: (id) => `${CONFIG.VIDSRC_BASE}/embed/movie/${id}?autoplay=1`,
    tv: (id, s, e) => `${CONFIG.VIDSRC_BASE}/embed/tv/${id}/${s}/${e}?autoplay=1`,
  },
  // Same VidSrc player, served from a sibling domain. Kept separate because
  // vidsrc.fyi degrades to an empty player frame when it cannot resolve the id,
  // and this host has stayed up when that one has not.
  vsembed: {
    movie: (id) => `https://vsembed.ru/embed/movie/${id}?autoplay=1`,
    tv: (id, s, e) => `https://vsembed.ru/embed/tv/${id}/${s}/${e}?autoplay=1`,
  },
  // The key stays `2embed` so a source already persisted in localStorage by an
  // earlier version keeps resolving, but the dead 2embed.cc host is replaced by
  // 2embed.stream, which serves the same player and accepts TMDB ids.
  '2embed': {
    movie: (id) => `https://www.2embed.stream/embed/movie/${id}?autoplay=1`,
    tv: (id, s, e) => `https://www.2embed.stream/embed/tv/${id}/${s}/${e}?autoplay=1`,
  },
  '2embedskin': {
    movie: (id) => `https://www.2embed.skin/embed/movie/${id}?autoplay=1`,
    tv: (id, s, e) => `https://www.2embed.skin/embed/tv/${id}/${s}/${e}?autoplay=1`,
  },
  // Indonesian-first catalogue; the broadest coverage of the group for Asian
  // content and still resolves mainstream titles.
  nontongo: {
    movie: (id) => `https://nontongo.win/embed/movie/${id}?autoplay=1`,
    tv: (id, s, e) => `https://nontongo.win/embed/tv/${id}/${s}/${e}?autoplay=1`,
  },
  embos: {
    movie: (id) => `https://embos.top/movie/?mid=${id}&autoplay=1`,
    tv: (id, s, e) => `https://embos.top/tv/?mid=${id}&s=${s}&e=${e}&autoplay=1`,
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

export function getMovieEmbedUrl(tmdbId: string | number, source: string = DEFAULT_SOURCE): string {
  return resolveSource(source).movie(tmdbId);
}

export function getTVEmbedUrl(tmdbId: string | number, season: number, episode: number, source: string = DEFAULT_SOURCE): string {
  return resolveSource(source).tv(tmdbId, season, episode);
}

export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    vidsrc: 'VidSrc',
    vsembed: 'VsEmbed',
    '2embed': '2Embed',
    '2embedskin': '2Embed Skin',
    nontongo: 'NontonGo',
    embos: 'Embos',
  };
  return Object.hasOwn(labels, source) ? labels[source] : source;
}

export const SOURCE_KEYS: string[] = Object.keys(SOURCES);