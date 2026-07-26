import CONFIG from '../config';

const CACHE_TTL = 24 * 60 * 60 * 1000;

const options = {
  method: 'GET',
  headers: { accept: 'application/json' },
};

function cacheKey(url) {
  return `tmdb:${url}`;
}

function getCached(url) {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(cacheKey(url));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCache(url, data) {
  try {
    localStorage.setItem(cacheKey(url), JSON.stringify({ data, ts: Date.now() }));
    pruneCache();
  } catch {}
}

function pruneCache() {
  const entries = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('tmdb:')) continue;
    try {
      const { ts } = JSON.parse(localStorage.getItem(k));
      entries.push({ k, ts });
    } catch {}
  }
  if (entries.length <= 120) return;
  entries.sort((a, b) => a.ts - b.ts);
  const toRemove = entries.slice(0, entries.length - 100);
  toRemove.forEach((e) => localStorage.removeItem(e.k));
}

async function fetchJson(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
      const data = await res.json();
      setCache(url, data);
      return data;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function fetchWithFallback(url) {
  const cached = getCached(url);
  if (cached) return cached;
  return fetchJson(url);
}

export async function getPopularMovies(page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/movie/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function getPopularTV(page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function getTrending(mediaType = 'all', page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/trending/${mediaType}/week?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function searchMulti(query, page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/multi?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
}

export async function searchMovies(query, page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
}

export async function searchTV(query, page = 1) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/search/tv?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
}

export async function getMovieDetail(id) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/movie/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits,recommendations,videos`);
}

export async function getTVDetail(id) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits,recommendations,videos`);
}

export async function getSeasonDetails(id, seasonNumber) {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/tv/${id}/season/${seasonNumber}?api_key=${CONFIG.TMDB_API_KEY}`);
}

export async function getMovieGenres() {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/movie/list?api_key=${CONFIG.TMDB_API_KEY}`);
}

export async function getTVGenres() {
  return fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/genre/tv/list?api_key=${CONFIG.TMDB_API_KEY}`);
}

export async function getCountries() {
  const data = await fetchWithFallback(`${CONFIG.TMDB_BASE_URL}/configuration/countries?api_key=${CONFIG.TMDB_API_KEY}`);
  return data.sort((a, b) => a.english_name.localeCompare(b.english_name));
}

export async function discover(type, filters, page = 1) {
  let url = `${CONFIG.TMDB_BASE_URL}/discover/${type}?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`;
  if (filters?.genreId) url += `&with_genres=${filters.genreId}`;
  if (filters?.country) url += `&with_origin_country=${filters.country}`;
  if (filters?.year) url += type === 'tv' ? `&first_air_date_year=${filters.year}` : `&primary_release_year=${filters.year}`;
  if (filters?.sortBy) url += `&sort_by=${filters.sortBy}`;
  if (filters?.releaseDateGte) url += type === 'tv' ? `&first_air_date.gte=${filters.releaseDateGte}` : `&primary_release_date.gte=${filters.releaseDateGte}`;
  if (filters?.releaseDateLte) url += type === 'tv' ? `&first_air_date.lte=${filters.releaseDateLte}` : `&primary_release_date.lte=${filters.releaseDateLte}`;
  return fetchWithFallback(url);
}

export function imageUrl(path, size = 'w500') {
  if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
  return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}
