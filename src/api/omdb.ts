import { logDebug } from '../utils/logger';

const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY as string | undefined;
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

function extractRating(data: { imdbRating?: string; imdbVotes?: string; Error?: string }): ImdbRating | null {
  if (data?.Error || !data?.imdbRating || data.imdbRating === 'N/A') return null;
  return {
    rating: data.imdbRating,
    votes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : '',
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
      if (res.status === 401) return { status: 'limited' };
      return { status: 'failed' };
    }
    const data = (await res.json()) as { imdbRating?: string; imdbVotes?: string; Error?: string };
    if (data.Error?.toLowerCase().includes('limit')) return { status: 'limited' };
    return { status: 'ok', rating: extractRating(data) };
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') logDebug(`OMDb fetch failed: ${(err as Error)?.message ?? String(err)}`);
    return { status: 'failed' };
  }
}

async function fetchCinemetaRating(
  imdbId: string,
  season?: number,
  episode?: number,
  signal?: AbortSignal,
): Promise<ImdbRating | null> {
  let url: string;
  if (season != null && episode != null) {
    url = `${CINEMETA_BASE}/series/${encodeURIComponent(imdbId)}/${season}/${episode}.json`;
  } else {
    const type = season == null ? 'movie' : 'series';
    url = `${CINEMETA_BASE}/${type}/${encodeURIComponent(imdbId)}.json`;
  }
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      meta?: { imdbRating?: string | null; imdbVotes?: string | null };
    };
    const rating = data.meta?.imdbRating;
    if (!rating || rating === 'N/A') return null;
    return { rating, votes: data.meta?.imdbVotes && data.meta.imdbVotes !== 'N/A' ? data.meta.imdbVotes : '' };
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') logDebug(`Cinemeta fallback fetch failed: ${(err as Error)?.message ?? String(err)}`);
    return null;
  }
}

// Returns the numeric IMDb rating for a title via the OMDb API (key-based,
// CORS-enabled). When OMDb is out of daily quota (or no key is set) it falls
// back to the keyless Cinemeta API. Results are cached in localStorage for 7
// days so the free tier's daily request limit isn't exhausted by repeat visits.
export async function getImdbRating(
  imdbId: string,
  type: OmdbMediaType,
  signal?: AbortSignal,
  season?: number,
  episode?: number,
): Promise<ImdbRating | null> {
  const key = cacheKey(imdbId);
  const entry = readEntry(key);
  if (entry && !entryExpired(entry)) return entry.data;

  if (OMDB_API_KEY && Date.now() > omdbLimitedUntil) {
    const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&type=${type}&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
    const outcome = await fetchRating(url, signal);
    if (outcome.status === 'ok') {
      writeEntry(key, outcome.rating);
      return outcome.rating;
    }
    if (outcome.status === 'limited') {
      logDebug(`OMDb quota reached for ${imdbId}, using Cinemeta fallback`);
      omdbLimitedUntil = Date.now() + FALLBACK_COOLDOWN_MS;
    }
  } else if (!OMDB_API_KEY) {
    logDebug('VITE_OMDB_API_KEY not set, using Cinemeta fallback');
  }

  // OMDb unavailable, limited, or missing the title - try the fallback
  // provider (episodes need the season/episode numbers for Cinemeta).
  const fallback = await fetchCinemetaRating(imdbId, season, episode, signal);
  writeEntry(key, fallback);
  return fallback;
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
  if (!OMDB_API_KEY || !title) return null;

  const key = tmdbCacheKey(tmdbId);
  const entry = readEntry(key);
  if (entry && !entryExpired(entry)) return entry.data;

  // OMDb is out of quota (and cards can't use the Cinemeta fallback because
  // it needs an imdb_id, which only TMDB external_ids provides) - reuse a
  // cached rating if there is one and otherwise give up.
  if (Date.now() <= omdbLimitedUntil) return null;

  let promise = inFlight.get(key);
  if (!promise) {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&y=${encodeURIComponent(year)}&type=${type}&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
    promise = fetchRating(url).then((rating) => {
      writeEntry(key, rating);
      inFlight.delete(key);
      return rating;
    });
    inFlight.set(key, promise);
  }
  return promise;
}