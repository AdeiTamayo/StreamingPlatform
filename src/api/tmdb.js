import CONFIG from '../config';

const options = {
  method: 'GET',
  headers: { accept: 'application/json' },
};

async function fetchJson(url) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

export async function getPopularMovies(page = 1) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/movie/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function getPopularTV(page = 1) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/tv/popular?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function getTrending(mediaType = 'all', page = 1) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/trending/${mediaType}/week?api_key=${CONFIG.TMDB_API_KEY}&page=${page}`);
}

export async function searchMulti(query, page = 1) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/search/multi?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}&page=${page}`);
}

export async function getMovieDetail(id) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/movie/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits`);
}

export async function getTVDetail(id) {
  return fetchJson(`${CONFIG.TMDB_BASE_URL}/tv/${id}?api_key=${CONFIG.TMDB_API_KEY}&append_to_response=credits`);
}

export async function getTVSeasons(id) {
  const detail = await getTVDetail(id);
  return detail.seasons || [];
}

export function imageUrl(path, size = 'w500') {
  if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
  return `${CONFIG.TMDB_IMAGE_BASE}/${size}${path}`;
}
