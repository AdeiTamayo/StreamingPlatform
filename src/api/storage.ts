import { logDebug } from '../utils/logger';

const WL_KEY = 'watchlater';
const PROGRESS_INDEX_KEY = 'progress_index';
const WATCHED_INDEX_KEY = 'watched_index';
const VIDEO_SOURCE_KEY = 'video_source';

// ── Key helpers ─────────────────────────────────────────

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

// ── Index helpers ───────────────────────────────────────

function getIndex(key, prefix) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) || [];
  } catch {
    return [];
  }
  // Build index from existing keys if empty
  const index = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k.startsWith(prefix)) index.push(k);
  }
  if (index.length > 0) localStorage.setItem(key, JSON.stringify(index));
  return index;
}

function saveIndex(key, index) {
  localStorage.setItem(key, JSON.stringify(index));
}

function addToIndex(key, indexStorageKey, prefix) {
  const index = getIndex(indexStorageKey, prefix);
  if (!index.includes(key)) {
    index.push(key);
    saveIndex(indexStorageKey, index);
  }
}

function removeFromIndex(key, indexStorageKey, prefix) {
  const index = getIndex(indexStorageKey, prefix).filter((k) => k !== key);
  saveIndex(indexStorageKey, index);
}

// ── Progress index ──────────────────────────────────────

function getProgressIndex() {
  return getIndex(PROGRESS_INDEX_KEY, 'progress:');
}

function addToProgressIndex(key) {
  addToIndex(key, PROGRESS_INDEX_KEY, 'progress:');
}

function removeFromProgressIndex(key) {
  removeFromIndex(key, PROGRESS_INDEX_KEY, 'progress:');
}

// ── Watched index ───────────────────────────────────────

function getWatchedIndex() {
  return getIndex(WATCHED_INDEX_KEY, 'watched:');
}

function addToWatchedIndex(key) {
  addToIndex(key, WATCHED_INDEX_KEY, 'watched:');
}

function removeFromWatchedIndex(key) {
  removeFromIndex(key, WATCHED_INDEX_KEY, 'watched:');
}

// ── Watched marks ───────────────────────────────────────

export function isWatched(type, id, season?, episode?) {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type, id, title, season?, episode?, meta?) {
  const data = { type, id, title, season, episode, watchedAt: Date.now(), ...(meta ? { meta } : {}) };
  const key = watchedKey(type, id, season, episode);
  localStorage.setItem(key, JSON.stringify(data));
  addToWatchedIndex(key);
}

export function markUnwatched(type, id, season?, episode?) {
  const key = watchedKey(type, id, season, episode);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);
}

export function clearShowHistory(showId) {
  const showIdStr = String(showId);
  const watchedIndex = getWatchedIndex();
  const remainingWatched = [];
  for (const k of watchedIndex) {
    const p = parseWatchedKey(k);
    if (p && p.showId === showIdStr) {
      localStorage.removeItem(k);
    } else {
      remainingWatched.push(k);
    }
  }
  saveIndex(WATCHED_INDEX_KEY, remainingWatched);

  const progressIndex = getProgressIndex();
  const remainingProgress = [];
  for (const k of progressIndex) {
    const p = parseProgressKey(k);
    if (p && p.showId === showIdStr) {
      localStorage.removeItem(k);
    } else {
      remainingProgress.push(k);
    }
  }
  saveIndex(PROGRESS_INDEX_KEY, remainingProgress);
}

export function getLastWatchedEpisode(showId) {
  let last = null;
  const index = getWatchedIndex();
  for (const k of index) {
    const p = parseWatchedKey(k);
    if (p && p.showId === String(showId) && p.season > 0) {
      try {
        const data = JSON.parse(localStorage.getItem(k));
        if (!last || data.watchedAt > last.watchedAt) {
          last = { ...p, season: data.season ?? p.season, episode: data.episode ?? p.episode, watchedAt: data.watchedAt };
        }
      } catch {}
    }
  }
  return last;
}

// ── Progress ────────────────────────────────────────────

export function saveProgress(type, id, currentTime, season?, episode?, meta?) {
  const data = { type, id, currentTime, savedAt: Date.now(), season, episode, ...(meta ? { meta } : {}) };
  try {
    localStorage.setItem(progressKey(type, id, season, episode), JSON.stringify(data));
    addToProgressIndex(progressKey(type, id, season, episode));
    logDebug(`saveProgress key=${progressKey(type, id, season, episode)} currentTime=${currentTime}`);
  } catch (err) {
    logDebug(`saveProgress FAILED key=${progressKey(type, id, season, episode)} err=${err.message}`);
  }
}

export function getProgress(type, id, season?, episode?) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(type, id, season, episode))) || null;
  } catch {
    return null;
  }
}

export function clearProgress(type, id, season?, episode?) {
  localStorage.removeItem(progressKey(type, id, season, episode));
  removeFromProgressIndex(progressKey(type, id, season, episode));
}

// ── Watch Later ─────────────────────────────────────────

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

// ── Last Seen ───────────────────────────────────────────

export function getLastSeen() {
  const items = [];

  // Collect from watched index
  const watchedIndex = getWatchedIndex();
  for (const k of watchedIndex) {
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
    } catch {}
  }

  // Collect from progress index (unwatched items with progress > 30s)
  const progressIndex = getProgressIndex();
  for (const k of progressIndex) {
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
    } catch {}
  }

  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// Continue Watching (has progress > 30s but NOT marked watched)
export function getContinueWatching() {
  const progressItems = [];
  const keys = getProgressIndex();
  for (const k of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(k));
      if (!data || data.currentTime <= 30) continue;
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
    } catch {}
  }
  return progressItems.sort((a, b) => b.savedAt - a.savedAt);
}

// ── Episode Watch Later ─────────────────────────────────

const EP_WL_PREFIX = 'epwl:';

export function getEpisodeWatchLater() {
  const items = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k.startsWith(EP_WL_PREFIX)) continue;
    try {
      items.push(JSON.parse(localStorage.getItem(k)));
    } catch {}
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

// ── Watched count for a season ──────────────────────────

export function getWatchedCount(showId, seasonNumber, _episodeCount) {
  let count = 0;
  const index = getWatchedIndex();
  const prefix = `watched:tv-${showId}-S${seasonNumber}E`;
  for (const k of index) {
    if (k.startsWith(prefix)) count++;
  }
  return count;
}

// Mark all episodes in a season as watched
export function markSeasonWatched(showId, seasonNumber, episodeCount, showName, poster) {
  for (let i = 1; i <= episodeCount; i++) {
    if (!isWatched('tv', showId, seasonNumber, i)) {
      markWatched('tv', showId, showName, seasonNumber, i, { title: showName, poster });
    }
  }
}

// ── Search History ──────────────────────────────────────

const SEARCH_HISTORY_KEY = 'search_history';
const SEARCH_HISTORY_MAX = 15;

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const list = getSearchHistory().filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
  list.unshift(trimmed);
  if (list.length > SEARCH_HISTORY_MAX) list.length = SEARCH_HISTORY_MAX;
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
}

// ── Export / Import ─────────────────────────────────────

const EXPORT_KEYS = ['watched:', 'progress:', 'watchlater', 'epwl:', 'search_history', 'watched_index', 'progress_index', 'notifications'];

function isExportKey(k) {
  return EXPORT_KEYS.some((prefix) => k === prefix || k.startsWith(prefix));
}

export function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isExportKey(k)) {
      data[k] = localStorage.getItem(k);
    }
  }
  return data;
}

export function importData(data, mode = 'merge') {
  if (mode === 'replace') {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (isExportKey(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  }
  Object.entries(data).forEach(([k, v]) => {
    if (isExportKey(k)) localStorage.setItem(k, String(v));
  });
}

// ── Storage Usage ───────────────────────────────────────

export function getStorageUsage() {
  let total = 0;
  const breakdown = { watched: 0, progress: 0, watchlater: 0, epwl: 0, notifications: 0, cache: 0, other: 0 };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    const bytes = (k.length + v.length) * 2;
    total += bytes;
    if (k.startsWith('watched:')) breakdown.watched += bytes;
    else if (k.startsWith('progress:')) breakdown.progress += bytes;
    else if (k === 'watchlater') breakdown.watchlater += bytes;
    else if (k.startsWith('epwl:')) breakdown.epwl += bytes;
    else if (k === 'notifications') breakdown.notifications += bytes;
    else if (k.startsWith('tmdb:')) breakdown.cache += bytes;
    else breakdown.other += bytes;
  }
  return { total, breakdown };
}

// ── Stats ───────────────────────────────────────────────

export function getStats() {
  let moviesWatched = 0;
  let episodesWatched = 0;
  const index = getWatchedIndex();
  for (const k of index) {
    if (k.includes('movie-')) moviesWatched++;
    else if (k.match(/tv-\d+-S\d+E\d+/)) episodesWatched++;
  }
  const wl = getWatchLater();
  const epWl = getEpisodeWatchLater();
  return { moviesWatched, episodesWatched, watchLaterCount: wl.length + epWl.length };
}

// ── Video Source ────────────────────────────────────────

export function getVideoSource() {
  return localStorage.getItem(VIDEO_SOURCE_KEY) || 'vidsrc';
}

export function setVideoSource(source) {
  localStorage.setItem(VIDEO_SOURCE_KEY, source);
}

// ── Notifications ───────────────────────────────────────

const NOTIFICATIONS_KEY = 'notifications';

export function getNotifications() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY)) || [];
  } catch {
    return [];
  }
}

export function addNotification(showId, showTitle, season, episode, episodeTitle, type, airDate) {
  const list = getNotifications();
  const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  list.unshift({
    id,
    showId: String(showId),
    showTitle,
    season,
    episode,
    episodeTitle: episodeTitle || null,
    type: type || 'new_episode',
    airDate: airDate || null,
    createdAt: Date.now(),
    read: false,
  });
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
  return id;
}

export function removeNotification(id) {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(getNotifications().filter((n) => n.id !== id)));
}

export function markAllNotificationsRead() {
  const list = getNotifications();
  list.forEach((n) => { n.read = true; });
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
}

export function clearAllNotifications() {
  localStorage.removeItem(NOTIFICATIONS_KEY);
}

export function isAlreadyNotified(showId, season, episode) {
  const sid = String(showId);
  return getNotifications().some((n) => n.showId === sid && n.season === season && n.episode === episode);
}
