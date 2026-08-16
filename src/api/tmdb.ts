import CONFIG from '../config';
import { getCached, setCache } from './tmdbCache';

const options = {
  method: 'GET',
  headers: { accept: 'application/json' },
};

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
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/movie/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`, signal);
}

export async function getPopularTV(page = 1, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`, signal);
}

export async function getTrending(mediaType = 'all', page = 1, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/trending/${mediaType}/week?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`, signal);
}

export async function searchMulti(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/multi?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`, signal);
}

export async function searchMovies(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`, signal);
}

export async function searchTV(query: string, page = 1, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/tv?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`, signal);
}

export async function getMovieDetail(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/movie/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits,recommendations,videos`, signal);
}

export async function getTVDetail(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits,recommendations,videos`, signal);
}

export async function getSeasonDetails(id: string | number, seasonNumber: number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getTVExternalIds(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}/external_ids?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getEpisodeExternalIds(id: string | number, seasonNumber: number, episodeNumber: number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}/episode/${episodeNumber}/external_ids?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getPersonCredits(id: string | number, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/person/${id}/combined_credits?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function searchPerson(query: string, signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/person?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`, signal);
}

export async function getMovieGenres(signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/movie/list?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getTVGenres(signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/tv/list?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getCountries(signal?: AbortSignal) {
  const data = await fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/configuration/countries?api_key=${CONFIG.TMDB_API_KEY}`, signal);
  if (!Array.isArray(data)) return [];
  return [...(data as { english_name: string }[])].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function getLanguages(signal?: AbortSignal) {
  const data = await fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/configuration/languages?api_key=${CONFIG.TMDB_API_KEY}`, signal);
  if (!Array.isArray(data)) return [];
  return [...(data as { iso_639_1: string; english_name: string }[])].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function discover(type: string, filters: Record<string, string | undefined>, page = 1, signal?: AbortSignal) {
  let url = `${CONFIG.TMDB_BASE_URL}/discover/${type}?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`;
  if (filters?.genreId) url += `&with_genres=${filters.genreId}`;
  if (filters?.country) url += `&with_origin_country=${filters.country}`;
  if (filters?.year) url += type === 'tv' ? `&first_air_date_year=${filters.year}` : `&primary_release_year=${filters.year}`;
  if (filters?.sortBy) url += `&sort_by=${filters.sortBy}`;
  if (filters?.releaseDateGte) url += type === 'tv' ? `&first_air_date.gte=${filters.releaseDateGte}` : `&primary_release_date.gte=${filters.releaseDateGte}`;
  if (filters?.releaseDateLte) url += type === 'tv' ? `&first_air_date.lte=${filters.releaseDateLte}` : `&primary_release_date.lte=${filters.releaseDateLte}`;
  if (filters?.originalLanguage) url += `&with_original_language=${filters.originalLanguage}`;
  if (filters?.voteCountGte) url += `&vote_count.gte=${filters.voteCountGte}`;
  return fetchWithFallback(url, signal);
}

export function imageUrl(path: string | null, size = 'w500') {
  if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
  return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}
