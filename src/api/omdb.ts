import { logDebug } from '../utils/logger';

// IMDb ratings come through the same-origin /api/omdb function, which holds the
// OMDb key server-side (OMDB_API_KEY). The browser never sees the key.
const OMDB_PROXY = '/api/omdb';
const OMDB_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OMDB_MISS_TTL_MS = 24 * 60 * 60 * 1000;

// Fallback provider for when the OMDb free tier is out of daily quota (or no
// key is configured): Cinemeta (Stremio's IMDb-backed addon) - keyless and
// serves IMDb ratings for movies, series and episodes by imdb_id.
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io/meta';
const FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

export interface ImdbRating {
  rating: string;
  votes: string;
  /** Rotten Tomatoes score as returned by OMDb, e.g. "94%". */
  tomatoes?: string;
}

interface OmdbCacheEntry {
  fetchedAt: number;
  data: ImdbRating | null;
}

type OmdbMediaType = 'movie' | 'series' | 'episode';

function cacheKey(imdbId: string): string {
  return `omdb:${imdbId}`;
}

function tmdbCacheKey(tmdbId: string | number): string {
  return `omdb:tmdb:${tmdbId}`;
}

function readEntry(key: string): OmdbCacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as OmdbCacheEntry;
    if (!entry || typeof entry.fetchedAt !== 'number' || !('data' in entry)) return null;
    if (entry.data && (typeof entry.data.rating !== 'string' || typeof entry.data.votes !== 'string')) return null;
    return entry;
  } catch {
    return null;
  }
}

function entryExpired(entry: OmdbCacheEntry): boolean {
  const ttl = entry.data ? OMDB_SUCCESS_TTL_MS : OMDB_MISS_TTL_MS;
  return Date.now() - entry.fetchedAt > ttl;
}

function writeEntry(key: string, data: ImdbRating | null): void {
  try {
    localStorage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), data }));
  } catch {
    // storage full or unavailable - skip caching, the value is just a badge
  }
}

function extractRating(data: { imdbRating?: string; imdbVotes?: string; Ratings?: { Source?: string; Value?: string }[]; Error?: string }): ImdbRating | null {
  if (data?.Error || !data?.imdbRating || data.imdbRating === 'N/A') return null;
  const rt = data.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value;
  return {
    rating: data.imdbRating,
    votes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : '',
    tomatoes: rt && rt !== 'N/A' ? rt : undefined,
  };
}

const inFlight = new Map<string, Promise<ImdbRating | null>>();

// While set, OMDb is known to be out of quota so callers skip it and go
// straight to the fallback provider (cleared after a cooldown so a fresh
// daily quota is picked up).
let omdbLimitedUntil = 0;

type FetchOutcome =
  | { status: 'ok'; rating: ImdbRating | null }
  | { status: 'limited' }
  | { status: 'failed' };

async function fetchRating(url: string, signal?: AbortSignal): Promise<FetchOutcome> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      // 429 = quota reached; 503 = the server has no OMDb key. Either way
      // OMDb is unusable for a while, so callers use the fallback.
      if (res.status === 429 || res.status === 503 || res.status === 401) return { status: 'limited' };
      return { status: 'failed' };
    }
    const data = (await res.json()) as { imdbRating?: string; imdbVotes?: string; Ratings?: { Source?: string; Value?: string }[]; Error?: string };
    if (data.Error?.toLowerCase().includes('limit')) return { status: 'limited' };
    return { status: 'ok', rating: extractRating(data) };
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') logDebug(`OMDb fetch failed: ${(err as Error)?.message ?? String(err)}`);
    return { status: 'failed' };
  }
}

// `imdbId` must be the IMDb id matching `type`. Episodes are addressed by
// their own id via meta/episode/{id}.json, which resolves the parent series
// server-side. The meta/series/{id}/{season}/{episode}.json form does not
// exist and 404s, so the season/episode numbers must not be interpolated here.
//
// `failed` means the answer is untrustworthy (network error, 5xx, abort) -
// callers must not treat it as a "no rating" miss.
type FallbackOutcome =
  | { status: 'ok'; rating: ImdbRating | null }
  | { status: 'failed' };

async function fetchCinemetaRating(
  imdbId: string,
  type: OmdbMediaType,
  signal?: AbortSignal,
): Promise<FallbackOutcome> {
  const url = `${CINEMETA_BASE}/${type}/${encodeURIComponent(imdbId)}.json`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { status: 'failed' };
    const data = (await res.json()) as {
      meta?: { imdbRating?: string | null; imdbVotes?: string | null };
    };
    const rating = data.meta?.imdbRating;
    if (!rating || rating === 'N/A') return { status: 'ok', rating: null };
    return { status: 'ok', rating: { rating, votes: data.meta?.imdbVotes && data.meta.imdbVotes !== 'N/A' ? data.meta.imdbVotes : '' } };
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') logDebug(`Cinemeta fallback fetch failed: ${(err as Error)?.message ?? String(err)}`);
    return { status: 'failed' };
  }
}

// Returns the numeric IMDb rating for a title via the OMDb API, reached through
// the /api/omdb proxy. When OMDb is out of daily quota (or the server has no
// key) it falls back to the keyless Cinemeta API. Results are cached in localStorage for 7
// days so the free tier's daily request limit isn't exhausted by repeat visits.
// Transient failures (network/5xx/abort) are NOT cached - only definitive
// answers are, so a flaky connection can't pin a 24h "no rating" miss.
export async function getImdbRating(
  imdbId: string,
  type: OmdbMediaType,
  signal?: AbortSignal,
): Promise<ImdbRating | null> {
  const key = cacheKey(imdbId);
  const entry = readEntry(key);
  if (entry && !entryExpired(entry)) return entry.data;

  if (Date.now() > omdbLimitedUntil) {
    const url = `${OMDB_PROXY}?i=${encodeURIComponent(imdbId)}&type=${type}`;
    const outcome = await fetchRating(url, signal);
    if (outcome.status === 'ok') {
      // Includes definitive misses (rating null) - those are safe to cache.
      writeEntry(key, outcome.rating);
      return outcome.rating;
    }
    if (outcome.status === 'limited') {
      logDebug(`OMDb quota reached for ${imdbId}, using Cinemeta fallback`);
      omdbLimitedUntil = Date.now() + FALLBACK_COOLDOWN_MS;
    }
  }

  // OMDb unavailable, limited, or missing the title - try the fallback
  // provider, which is addressed by the id matching `type`.
  const fallback = await fetchCinemetaRating(imdbId, type, signal);
  if (fallback.status === 'ok') {
    writeEntry(key, fallback.rating);
    return fallback.rating;
  }

  // Both providers failed transiently. Return null without writing, so the
  // next visit retries instead of showing "no rating" for a full day.
  return null;
}

export type RatingLookup =
  | { state: 'cached'; rating: ImdbRating }
  | { state: 'miss'; rating: null }
  | { state: 'fresh'; rating: null };

// Synchronous peek so cards render a cached rating (or skip the fetch for a
// recorded miss) without waiting for the network.
export function peekOmdbRatingByTmdb(tmdbId: string | number): RatingLookup {
  const entry = readEntry(tmdbCacheKey(tmdbId));
  if (!entry || entryExpired(entry)) return { state: 'fresh', rating: null };
  return entry.data ? { state: 'cached', rating: entry.data } : { state: 'miss', rating: null };
}

// Cards only know the TMDB id/title, so look the rating up by exact title +
// year (one request per unique title, double-buffered by the tmdb-keyed cache
// and an in-flight promise map for simultaneous cards).
export async function getOmdbRatingByTitle(
  tmdbId: string | number,
  title: string,
  year: string,
  type: OmdbMediaType,
): Promise<ImdbRating | null> {
  if (!title) return null;

  const key = tmdbCacheKey(tmdbId);
  const entry = readEntry(key);
  if (entry && !entryExpired(entry)) return entry.data;

  // OMDb is out of quota (and cards can't use the Cinemeta fallback because
  // it needs an imdb_id, which only TMDB external_ids provides) - reuse a
  // cached rating if there is one and otherwise give up.
  if (Date.now() <= omdbLimitedUntil) return null;

  let promise = inFlight.get(key);
  if (!promise) {
    const url = `${OMDB_PROXY}?t=${encodeURIComponent(title)}&y=${encodeURIComponent(year)}&type=${type}`;
    promise = fetchRating(url).then((outcome) => {
      inFlight.delete(key);
      if (outcome.status === 'ok') {
        // Includes definitive misses (rating null) - those are safe to cache.
        writeEntry(key, outcome.rating);
        return outcome.rating;
      }
      if (outcome.status === 'limited') {
        logDebug('OMDb quota reached, skipping card lookups during cooldown');
        omdbLimitedUntil = Date.now() + FALLBACK_COOLDOWN_MS;
      }
      // Transient failure (and quota): return null WITHOUT caching, so the
      // next visit retries instead of pinning a 24h "no rating" miss.
      return null;
    });
    inFlight.set(key, promise);
  }
  return promise;
}