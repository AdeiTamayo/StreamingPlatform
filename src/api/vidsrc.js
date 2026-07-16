import CONFIG from '../config';

export function getMovieEmbedUrl(tmdbId, startAt) {
  const url = `${CONFIG.VIDSRC_BASE}/embed/movie/${tmdbId}`;
  return startAt ? `${url}?startAt=${Math.floor(startAt)}` : url;
}

export function getTVEmbedUrl(tmdbId, season, episode, startAt) {
  const url = `${CONFIG.VIDSRC_BASE}/embed/tv/${tmdbId}/${season}/${episode}`;
  return startAt ? `${url}?startAt=${Math.floor(startAt)}` : url;
}
