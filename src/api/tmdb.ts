import CONFIG from '../config';
import { getCached, setCache } from './tmdbCache';

// TMDB issues two credential types: a v3 API key (32 hex chars, sent as the
// `api_key` query param) and a v4 read access token (a JWT, sent as an
// `Authorization: Bearer` header and NOT as `api_key` - TMDB rejects that
// with 401 "Invalid API key"). Accept either so a pasted v4 token just works.
const USE_BEARER_AUTH = CONFIG.TMDB_API_KEY.includes('.');

const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    ...(USE_BEARER_AUTH
      ? { Authorization: `Bearer ${CONFIG.TMDB_API_KEY}` }
      : {}),
  },
};

function tmdbUrl(
  path: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const qs = new URLSearchParams();
  if (!USE_BEARER_AUTH) qs.set('api_key', CONFIG.TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const query = qs.toString();
  return `${CONFIG.TMDB_BASE_URL}${path}${query ? `?${query}` : ''}`;
}

const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 1000;
const RETRY_429_DELAY_MS = 1500;

// In-flight dedup: concurrent callers for the same URL share one request
// instead of firing N parallel fetches.
const inflight = new Map<string, Promise<unknown>>();

async function fetchJson(url: string, retries = 2, signal: AbortSignal | null = null) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    let res: Response;
    try {
      res = await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      // Caller aborted (navigation/unmount) - propagate immediately.
      if (signal?.aborted) throw err;
      // Network failure or our own timeout - retry like a bad status would.
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw new Error(`TMDB request failed: ${(err as Error)?.message ?? String(err)}`);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    }

    if (res.ok) {
      const data = await res.json();
      setCache(url, data);
      return data;
    }

    if (res.status === 429) {
      // Rate limited - back off (this can happen even when no key is set).
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_429_DELAY_MS * (attempt + 1)));
        continue;
      }
      throw new Error('TMDB error: 429');
    }

    if (res.status >= 400 && res.status < 500) {
      throw Object.assign(new Error(`TMDB error: ${res.status}`), { _skipRetry: true });
    }

    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    throw new Error(`TMDB error: ${res.status}`);
  }
  throw new Error('TMDB request failed');
}

async function fetchWithFallback(url: string, signal?: AbortSignal) {
  const cached = await getCached(url);
  if (cached) return cached;

  const existing = inflight.get(url);
  if (existing) {
    if (signal?.aborted) throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
    return existing;
  }

  const promise = fetchJson(url, 2, signal ?? null).finally(() => inflight.delete(url));
  inflight.set(url, promise);
  return promise;
}

export async function getPopularMovies(page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/movie/popular', { page }), signal);
}

export async function getPopularTV(page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/tv/popular', { page }), signal);
}

export async function getTrending(mediaType = 'all', page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/trending/${mediaType}/week`, { page }), signal);
}

export async function searchMulti(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/search/multi', { query, page }), signal);
}

export async function searchMovies(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/search/movie', { query, page }), signal);
}

export async function searchTV(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/search/tv', { query, page }), signal);
}

export async function getMovieDetail(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/movie/${id}`, { append_to_response: 'credits,recommendations,videos' }), signal);
}

export async function getTVDetail(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/tv/${id}`, { append_to_response: 'credits,recommendations,videos' }), signal);
}

export async function getSeasonDetails(id: string | number, seasonNumber: number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/tv/${id}/season/${seasonNumber}`), signal);
}

export async function getTVExternalIds(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/tv/${id}/external_ids`), signal);
}

export async function getEpisodeExternalIds(id: string | number, seasonNumber: number, episodeNumber: number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/tv/${id}/season/${seasonNumber}/episode/${episodeNumber}/external_ids`), signal);
}

export async function getPersonCredits(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl(`/person/${id}/combined_credits`), signal);
}

export async function searchPerson(query: string, signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/search/person', { query }), signal);
}

export async function getMovieGenres(signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/genre/movie/list'), signal);
}

export async function getTVGenres(signal?: AbortSignal) {
  return fetchWithFallback(tmdbUrl('/genre/tv/list'), signal);
}

export async function getCountries(signal?: AbortSignal) {
  const data = await fetchWithFallback(tmdbUrl('/configuration/countries'), signal);
  if (!Array.isArray(data)) return [];
  return [...(data as { english_name: string }[])].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function getLanguages(signal?: AbortSignal) {
  const data = await fetchWithFallback(tmdbUrl('/configuration/languages'), signal);
  if (!Array.isArray(data)) return [];
  return [...(data as { iso_639_1: string; english_name: string }[])].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function discover(type: string, filters: Record<string, string | undefined>, page = 1, signal?: AbortSignal) {
  const params: Record<string, string | undefined> = {
    page: String(page),
    with_genres: filters?.genreId,
    with_origin_country: filters?.country,
    sort_by: filters?.sortBy,
    with_original_language: filters?.originalLanguage,
    'vote_count.gte': filters?.voteCountGte,
  };
  if (filters?.year) params[type === 'tv' ? 'first_air_date_year' : 'primary_release_year'] = filters.year;
  if (filters?.releaseDateGte) params[type === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte'] = filters.releaseDateGte;
  if (filters?.releaseDateLte) params[type === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte'] = filters.releaseDateLte;
  return fetchWithFallback(tmdbUrl(`/discover/${type}`, params), signal);
}

export function imageUrl(path: string | null, size = 'w500') {
  if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
  return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}
