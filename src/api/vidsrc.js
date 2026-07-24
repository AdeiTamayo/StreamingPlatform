import CONFIG from '../config';

const SOURCES = {
  vidsrc: {
    movie: (id) => `${CONFIG.VIDSRC_BASE}/embed/movie/${id}`,
    tv: (id, s, e) => `${CONFIG.VIDSRC_BASE}/embed/tv/${id}/${s}/${e}`,
  },
  '2embed': {
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  vsembed_ru: {
    movie: (id) => `https://vsembed.ru/embed/movie/${id}`,
    tv: (id, s, e) => `https://vsembed.ru/embed/tv/${id}/${s}/${e}`,
  },
  vsembed_su: {
    movie: (id) => `https://vsembed.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://vsembed.su/embed/tv/${id}/${s}/${e}`,
  },
  embos: {
    movie: (id) => `https://embos.top/movie/?mid=${id}`,
    tv: (id, s, e) => `https://embos.top/tv/?mid=${id}&s=${s}&e=${e}`,
  },
};

export function getMovieEmbedUrl(tmdbId, source = 'vidsrc') {
  return SOURCES[source]?.movie(tmdbId) ?? SOURCES.vidsrc.movie(tmdbId);
}

export function getTVEmbedUrl(tmdbId, season, episode, source = 'vidsrc') {
  return SOURCES[source]?.tv(tmdbId, season, episode) ?? SOURCES.vidsrc.tv(tmdbId, season, episode);
}

export function getSourceLabel(source) {
  const labels = {
    vidsrc: 'VidSrc',
    '2embed': '2Embed',
    vsembed_ru: 'VSEmbed.ru',
    vsembed_su: 'VSEmbed.su',
    embos: 'Embos',
  };
  return labels[source] || source;
}

export const SOURCE_KEYS = Object.keys(SOURCES);
