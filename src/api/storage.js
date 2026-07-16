function watchedKey(type, id, season, episode) {
  if (type === 'movie') return `watched:movie-${id}`;
  return `watched:tv-${id}-S${season}E${episode}`;
}

function progressKey(type, id, season, episode) {
  if (type === 'movie') return `progress:movie-${id}`;
  return `progress:tv-${id}-S${season}E${episode}`;
}

function parseWatchedKey(k) {
  const m = k.match(/^watched:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { showId: m[1], season: Number(m[2]), episode: Number(m[3]) };
  return null;
}

export function isWatched(type, id, season, episode) {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type, id, title, season, episode) {
  localStorage.setItem(
    watchedKey(type, id, season, episode),
    JSON.stringify({ type, id, title, watchedAt: Date.now() })
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
          last = { ...p, watchedAt: data.watchedAt };
        }
      } catch {}
    }
  }
  return last;
}

export function saveProgress(type, id, currentTime, season, episode) {
  localStorage.setItem(
    progressKey(type, id, season, episode),
    JSON.stringify({ currentTime, savedAt: Date.now() })
  );
}

export function getProgress(type, id, season, episode) {
  try {
    const data = JSON.parse(localStorage.getItem(progressKey(type, id, season, episode)));
    return data || null;
  } catch {
    return null;
  }
}

export function clearProgress(type, id, season, episode) {
  localStorage.removeItem(progressKey(type, id, season, episode));
}
