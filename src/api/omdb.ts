import { logDebug } from '../utils/logger';

const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY as string | undefined;
const OMDB_SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OMDB_MISS_TTL_MS = 24 * 60 * 60 * 1000;

export interface ImdbRating {
  rating: string;
  votes: string;
}

interface OmdbCacheEntry {
  fetchedAt: number;
  data: ImdbRating | null;
}

type OmdbMediaType = 'movie' | 'series';

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

async function fetchRating(url: string, signal?: AbortSignal): Promise<ImdbRating | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return extractRating(await res.json());
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') logDebug('OMDb fetch failed', err);
    return null;
  }
}

// Returns the numeric IMDb rating for a title via the OMDb API (key-based,
// CORS-enabled). Results are cached in localStorage for 7 days so the free
// tier's daily request limit isn't exhausted by repeat visits.
export async function getImdbRating(
  imdbId: string,
  type: OmdbMediaType,
  signal?: AbortSignal,
): Promise<ImdbRating | null> {
  if (!OMDB_API_KEY) {
    logDebug('VITE_OMDB_API_KEY not set, skipping IMDb rating fetch');
    return null;
  }

  const key = cacheKey(imdbId);
  const entry = readEntry(key);
  if (entry && !entryExpired(entry)) return entry.data;

  const url = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbId)}&type=${type}&apikey=${encodeURIComponent(OMDB_API_KEY)}`;
  const rating = await fetchRating(url, signal);
  writeEntry(key, rating);
  return rating;
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