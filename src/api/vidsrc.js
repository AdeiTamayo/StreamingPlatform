import CONFIG from '../config';

export function getMovieEmbedUrl(tmdbId) {
  return `${CONFIG.VIDSRC_BASE}/embed/movie/${tmdbId}`;
}

export function getTVEmbedUrl(tmdbId, season, episode) {
  return `${CONFIG.VIDSRC_BASE}/embed/tv/${tmdbId}/${season}/${episode}`;
}
