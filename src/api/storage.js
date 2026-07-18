const WL_KEY = 'watchlater';

function watchedKey(type, id, season, episode) {
  if (type === 'movie') return `watched:movie-${id}`;
  return `watched:tv-${id}-S${season}E${episode}`;
}

function progressKey(type, id, season, episode) {
  if (type === 'movie') return `progress:movie-${id}`;
  return `progress:tv-${id}-S${season}E${episode}`;
}

function parseWatchedKey(k) {
  let m = k.match(/^watched:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: Number(m[2]), episode: Number(m[3]) };
  m = k.match(/^watched:movie-(.+)$/);
  if (m) return { type: 'movie', id: m[1], season: null, episode: null };
  return null;
}

function parseProgressKey(k) {
  let m = k.match(/^progress:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: Number(m[2]), episode: Number(m[3]) };
  m = k.match(/^progress:movie-(.+)$/);
  if (m) return { type: 'movie', id: m[1], season: null, episode: null };
  return null;
}

export function isWatched(type, id, season, episode) {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type, id, title, season, episode, meta) {
  const data = { type, id, title, season, episode, watchedAt: Date.now() };
  if (meta) data.meta = meta;
  localStorage.setItem(
    watchedKey(type, id, season, episode),
    JSON.stringify(data)
  );
}

export function markUnwatched(type, id, season, episode) {
  localStorage.removeItem(watchedKey(type, id, season, episode));
}

export function getLastWatchedEpisode(showId) {
  let last = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const p = parseWatchedKey(k);
    if (p && p.showId === String(showId) && p.season > 0) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (!last || data.watchedAt > last.watchedAt) {
          last = { ...p, season: data.season ?? p.season, episode: data.episode ?? p.episode, watchedAt: data.watchedAt };
        }
      } catch { }
    }
  }
  return last;
}

export function saveProgress(type, id, currentTime, season, episode, meta) {
  const data = { type, id, currentTime, savedAt: Date.now(), season, episode };
  if (meta) data.meta = meta;
  localStorage.setItem(progressKey(type, id, season, episode), JSON.stringify(data));
}

export function getProgress(type, id, season, episode) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(type, id, season, episode))) || null;
  } catch {
    return null;
  }
}

export function clearProgress(type, id, season, episode) {
  localStorage.removeItem(progressKey(type, id, season, episode));
}

// Watch Later
export function getWatchLater() {
  try {
    return JSON.parse(localStorage.getItem(WL_KEY)) || [];
  } catch {
    return [];
  }
}

export function addWatchLater(type, id, title, year, poster) {
  const list = getWatchLater().filter((item) => !(item.type === type && item.id === id));
  list.push({ type, id, title, year, poster, addedAt: Date.now() });
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}

export function removeWatchLater(type, id) {
  const list = getWatchLater().filter((item) => !(item.type === type && String(item.id) === String(id)));
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}

export function isInWatchLater(type, id) {
  return getWatchLater().some((item) => item.type === type && String(item.id) === String(id));
}

// Last Seen
export function getLastSeen() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith('watched:')) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        const parsed = parseWatchedKey(k);
        if (parsed) {
          items.push({
            storageKey: k,
            type: parsed.type,
            id: data.id ?? parsed.id ?? parsed.showId,
            title: data.title || data.meta?.title || null,
            season: data.season ?? parsed.season ?? null,
            episode: data.episode ?? parsed.episode ?? null,
            ts: data.watchedAt || 0,
            source: 'watched',
            meta: data.meta || null,
          });
        }
      } catch { }
    } else if (k.startsWith('progress:')) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (data.currentTime > 30) {
          const wKey = k.replace('progress:', 'watched:');
          if (!localStorage.getItem(wKey)) {
            const parsed = parseProgressKey(k);
            if (parsed) {
              items.push({
                storageKey: k,
                type: parsed.type,
                id: data.id ?? parsed.id ?? parsed.showId,
                title: data.meta?.title || null,
                season: data.season ?? parsed.season ?? null,
                episode: data.episode ?? parsed.episode ?? null,
                ts: data.savedAt || 0,
                source: 'progress',
                currentTime: data.currentTime,
                meta: data.meta || null,
              });
            }
          }
        }
      } catch { }
    }
  }
  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// Continue Watching (has progress > 30s but NOT marked watched)
export function getContinueWatching() {
  const progressItems = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith('progress:')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k));
      if (data.currentTime <= 30) continue;
      const wKey = k.replace('progress:', 'watched:');
      if (localStorage.getItem(wKey)) continue;
      const isMovie = k.includes('movie');
      const p = isMovie ? null : parseProgressKey(k);
      progressItems.push({
        type: isMovie ? 'movie' : 'tv',
        id: isMovie ? k.replace('progress:movie-', '') : p.showId,
        season: p?.season || null,
        episode: p?.episode || null,
        currentTime: data.currentTime,
        savedAt: data.savedAt,
        meta: data.meta || null,
      });
    } catch { }
  }
  return progressItems.sort((a, b) => b.savedAt - a.savedAt);
}

// Episode Watch Later
const EP_WL_PREFIX = 'epwl:';

export function getEpisodeWatchLater() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(EP_WL_PREFIX)) continue;
    try {
      items.push(JSON.parse(localStorage.getItem(k)));
    } catch { }
  }
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export function addEpisodeWatchLater(showId, season, episode, showTitle) {
  const key = `${EP_WL_PREFIX}${showId}-S${season}E${episode}`;
  localStorage.setItem(key, JSON.stringify({ showId, season, episode, showTitle, addedAt: Date.now() }));
}

export function removeEpisodeWatchLater(showId, season, episode) {
  localStorage.removeItem(`${EP_WL_PREFIX}${showId}-S${season}E${episode}`);
}

export function isInEpisodeWatchLater(showId, season, episode) {
  return localStorage.getItem(`${EP_WL_PREFIX}${showId}-S${season}E${episode}`) !== null;
}

// Watched count for a season
export function getWatchedCount(showId, seasonNumber, episodeCount) {
  let count = 0;
  for (let i = 1; i <= episodeCount; i++) {
    if (localStorage.getItem(watchedKey('tv', showId, seasonNumber, i))) count++;
  }
  return count;
}
