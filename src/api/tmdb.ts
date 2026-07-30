import CONFIG from '../config';
import { getCached, setCache } from './tmdbCache';

const options = {
  method: 'GET',
  headers: { accept: 'application/json' },
};

async function fetchJson(url: string, retries = 2, signal: AbortSignal | null = null) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });

      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) {
          throw Object.assign(new Error(`TMDB error: ${res.status}`), { _skipRetry: true });
        }
        throw new Error(`TMDB error: ${res.status}`);
      }
      const data = await res.json();
      setCache(url, data);
      return data;
    } catch (err) {
      if (signal?.aborted) throw err;
      if ((err as any)?._skipRetry) throw err;
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function fetchWithFallback(url: string, signal?: AbortSignal) {
  const cached = await getCached(url);
  if (cached) return cached;
  return fetchJson(url, 2, signal ?? null);
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

export async function getMovieGenres(signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/movie/list?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getTVGenres(signal?: AbortSignal) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/tv/list?api_key=${CONFIG.TMDB_API_KEY}`, signal);
}

export async function getCountries(signal?: AbortSignal) {
  const data = await fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/configuration/countries?api_key=${CONFIG.TMDB_API_KEY}`, signal);
  return [...(data as { english_name: string }[])].sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function discover(type: string, filters: Record<string, string | undefined>, page = 1, signal?: AbortSignal) {
  let url = `${CONFIG.TMDB_BASE_URL}/discover/${type}?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`;
  if (filters?.genreId) url += `&with_genres=${filters.genreId}`;
  if (filters?.country) url += `&with_origin_country=${filters.country}`;
  if (filters?.year) url += type === 'tv' ? `&first_air_date_year=${filters.year}` : `&primary_release_year=${filters.year}`;
  if (filters?.sortBy) url += `&sort_by=${filters.sortBy}`;
  if (filters?.releaseDateGte) url += type === 'tv' ? `&first_air_date.gte=${filters.releaseDateGte}` : `&primary_release_date.gte=${filters.releaseDateGte}`;
  if (filters?.releaseDateLte) url += type === 'tv' ? `&first_air_date.lte=${filters.releaseDateLte}` : `&primary_release_date.lte=${filters.releaseDateLte}`;
  return fetchWithFallback(url, signal);
}

export function imageUrl(path: string | null, size = 'w500') {
  if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
  return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}
