import { logDebug } from '../utils/logger';
import { getTMDBCacheSize } from './tmdbCache';
import type { LastSeenItem, ContinueWatchingItem, WatchLaterItem, EpisodeWatchLaterItem, NotificationItem, StorageUsage, Stats, ProgressData, WatchedData, MediaType } from '../types';

const WL_KEY = 'watchlater';
const PROGRESS_INDEX_KEY = 'progress_index';
const WATCHED_INDEX_KEY = 'watched_index';
const VIDEO_SOURCE_KEY = 'video_source';

function watchedKey(type: string, id: string | number, season?: number | null, episode?: number | null): string {
  if (type === 'movie') return `watched:movie-${id}`;
  return `watched:tv-${id}-S${season}E${episode}`;
}

function progressKey(type: string, id: string | number, season?: number | null, episode?: number | null): string {
  if (type === 'movie') return `progress:movie-${id}`;
  return `progress:tv-${id}-S${season}E${episode}`;
}

function parseWatchedKey(k: string): { type: string; showId?: string; id: string; season: number | null; episode: number | null } | null {
  let m = k.match(/^watched:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: Number(m[2]), episode: Number(m[3]) };
  m = k.match(/^watched:movie-(.+)$/);
  if (m) return { type: 'movie', id: m[1], season: null, episode: null };
  return null;
}

function parseProgressKey(k: string): { type: string; showId?: string; id: string; season: number | null; episode: number | null } | null {
  let m = k.match(/^progress:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: Number(m[2]), episode: Number(m[3]) };
  m = k.match(/^progress:movie-(.+)$/);
  if (m) return { type: 'movie', id: m[1], season: null, episode: null };
  return null;
}

function getIndex(key: string, prefix: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Corrupted JSON — fall through to rebuild from full scan
  }
  const index: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) index.push(k);
  }
  if (index.length > 0) localStorage.setItem(key, JSON.stringify(index));
  return index;
}

function saveIndex(key: string, index: string[]): void {
  localStorage.setItem(key, JSON.stringify(index));
}

function addToIndex(key: string, indexStorageKey: string, prefix: string): void {
  const index = getIndex(indexStorageKey, prefix);
  if (!index.includes(key)) {
    index.push(key);
    saveIndex(indexStorageKey, index);
  }
}

function removeFromIndex(key: string, indexStorageKey: string, prefix: string): void {
  const index = getIndex(indexStorageKey, prefix).filter((k) => k !== key);
  saveIndex(indexStorageKey, index);
}

function getProgressIndex(): string[] {
  return getIndex(PROGRESS_INDEX_KEY, 'progress:');
}

function addToProgressIndex(key: string): void {
  addToIndex(key, PROGRESS_INDEX_KEY, 'progress:');
}

function removeFromProgressIndex(key: string): void {
  removeFromIndex(key, PROGRESS_INDEX_KEY, 'progress:');
}

function getWatchedIndex(): string[] {
  return getIndex(WATCHED_INDEX_KEY, 'watched:');
}

function addToWatchedIndex(key: string): void {
  addToIndex(key, WATCHED_INDEX_KEY, 'watched:');
}

function removeFromWatchedIndex(key: string): void {
  removeFromIndex(key, WATCHED_INDEX_KEY, 'watched:');
}

export function isWatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): boolean {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type: MediaType, id: string | number, title: string, season?: number | null, episode?: number | null, meta?: Record<string, unknown>): void {
  const data: WatchedData = { type, id, title, season: season ?? undefined, episode: episode ?? undefined, watchedAt: Date.now(), ...(meta ? { meta } : {}) };
  const key = watchedKey(type, id, season, episode);
  localStorage.setItem(key, JSON.stringify(data));
  addToWatchedIndex(key);
}

export function markUnwatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): void {
  const key = watchedKey(type, id, season, episode);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);
}

export function getWatchedEpisodeSet(type: string, id: string | number, season: number, episodeCount?: number): Set<number> {
  const set = new Set<number>();
  const prefix = `watched:tv-${id}-S${season}E`;
  const index = getWatchedIndex();
  for (const key of index) {
    if (key.startsWith(prefix)) {
      const ep = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(ep) && (!episodeCount || ep <= episodeCount)) set.add(ep);
    }
  }
  return set;
}

export function clearShowHistory(showId: string | number): void {
  const showIdStr = String(showId);
  const watchedIndex = getWatchedIndex();
  const remainingWatched: string[] = [];
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
  const remainingProgress: string[] = [];
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

export function getLastWatchedEpisode(showId: string | number): { type: string; showId: string; id: string; season: number; episode: number; watchedAt: number } | null {
  let last: { type: string; showId: string; id: string; season: number; episode: number; watchedAt: number } | null = null;
  const index = getWatchedIndex();
  for (const k of index) {
    const p = parseWatchedKey(k);
    if (p && p.showId === String(showId) && (p.season ?? 0) > 0) {
      try {
        const data: WatchedData = JSON.parse(localStorage.getItem(k) || '{}');
        if (!last || data.watchedAt > last.watchedAt) {
          last = { ...p, showId: p.showId ?? '', season: data.season ?? p.season ?? 0, episode: data.episode ?? p.episode ?? 0, watchedAt: data.watchedAt };
        }
      } catch {}
    }
  }
  return last;
}

export function saveProgress(type: MediaType, id: string | number, currentTime: number, season?: number | null, episode?: number | null, meta?: Record<string, unknown>): void {
  const data: ProgressData = { type, id, currentTime, savedAt: Date.now(), season: season ?? undefined, episode: episode ?? undefined, ...(meta ? { meta } : {}) };
  try {
    localStorage.setItem(progressKey(type, id, season, episode), JSON.stringify(data));
    addToProgressIndex(progressKey(type, id, season, episode));
    logDebug(`saveProgress key=${progressKey(type, id, season, episode)} currentTime=${currentTime}`);
  } catch (err) {
    logDebug(`saveProgress FAILED key=${progressKey(type, id, season, episode)} err=${String(err)}`);
  }
}

export function getProgress(type: string, id: string | number, season?: number | null, episode?: number | null): ProgressData | null {
  try {
    const raw = localStorage.getItem(progressKey(type, id, season, episode));
    if (!raw) return null;
    return JSON.parse(raw) as ProgressData || null;
  } catch {
    return null;
  }
}

export function clearProgress(type: MediaType, id: string | number, season?: number | null, episode?: number | null): void {
  localStorage.removeItem(progressKey(type, id, season, episode));
  removeFromProgressIndex(progressKey(type, id, season, episode));
}

export function getWatchLater(): WatchLaterItem[] {
  try {
    return JSON.parse(localStorage.getItem(WL_KEY) || '[]') as WatchLaterItem[] || [];
  } catch {
    return [];
  }
}

export function addWatchLater(type: MediaType, id: string | number, title: string, year: string, poster: string): void {
  const list = getWatchLater().filter((item: WatchLaterItem) => !(item.type === type && item.id === id));
  list.push({ type, id, title, year, poster, addedAt: Date.now() });
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}

export function removeWatchLater(type: MediaType, id: string | number): void {
  const list = getWatchLater().filter((item: WatchLaterItem) => !(item.type === type && String(item.id) === String(id)));
  localStorage.setItem(WL_KEY, JSON.stringify(list));
}

export function isInWatchLater(type: MediaType, id: string | number): boolean {
  return getWatchLater().some((item: WatchLaterItem) => item.type === type && String(item.id) === String(id));
}

export function getLastSeen(): LastSeenItem[] {
  const items: LastSeenItem[] = [];

  const watchedIndex = getWatchedIndex();
  for (const k of watchedIndex) {
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>;
      const parsed = parseWatchedKey(k);
      if (parsed) {
        items.push({
          storageKey: k as string,
          type: parsed.type as MediaType,
          id: (data.id ?? parsed.id ?? parsed.showId ?? '') as string | number,
          title: (data.title || (data.meta as Record<string, unknown> | undefined)?.title || null) as string | null,
          season: (data.season ?? parsed.season ?? null) as number | null,
          episode: (data.episode ?? parsed.episode ?? null) as number | null,
          ts: (data.watchedAt || 0) as number,
          source: 'watched' as const,
          meta: (data.meta || null) as Record<string, unknown> | null,
        });
      }
    } catch {}
  }

  const progressIndex = getProgressIndex();
  for (const k of progressIndex) {
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>;
      if ((data.currentTime as number) > 30) {
        const wKey = k.replace('progress:', 'watched:');
        if (!localStorage.getItem(wKey)) {
          const parsed = parseProgressKey(k);
          if (parsed) {
            items.push({
              storageKey: k as string,
              type: parsed.type as MediaType,
              id: (data.id ?? parsed.id ?? parsed.showId ?? '') as string | number,
              title: ((data.meta as Record<string, unknown> | undefined)?.title as string) || null,
              season: (data.season ?? parsed.season ?? null) as number | null,
              episode: (data.episode ?? parsed.episode ?? null) as number | null,
              ts: (data.savedAt || 0) as number,
              source: 'progress' as const,
              currentTime: data.currentTime as number,
              meta: (data.meta || null) as Record<string, unknown> | null,
            });
          }
        }
      }
    } catch {}
  }

  return items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export function getContinueWatching(): ContinueWatchingItem[] {
  const progressItems: ContinueWatchingItem[] = [];
  const keys = getProgressIndex();
  for (const k of keys) {
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>;
      if (!data || (data.currentTime as number) <= 30) continue;
      const wKey = k.replace('progress:', 'watched:');
      if (localStorage.getItem(wKey)) continue;
      const isMovie = k.includes('movie');
      const p = isMovie ? null : parseProgressKey(k);
      progressItems.push({
        type: (isMovie ? 'movie' : 'tv') as MediaType,
        id: (isMovie ? k.replace('progress:movie-', '') : (p ? p.showId : '')) as string | number,
        season: (p?.season ?? null) as number | null,
        episode: (p?.episode ?? null) as number | null,
        currentTime: data.currentTime as number,
        savedAt: data.savedAt as number,
        meta: (data.meta || null) as Record<string, unknown> | null,
      });
    } catch {}
  }
  return progressItems.sort((a, b) => b.savedAt - a.savedAt);
}

const EP_WL_PREFIX = 'epwl:';

export function getEpisodeWatchLater(): EpisodeWatchLaterItem[] {
  const items: EpisodeWatchLaterItem[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(EP_WL_PREFIX)) continue;
    try {
      items.push(JSON.parse(localStorage.getItem(k) || '{}') as EpisodeWatchLaterItem);
    } catch {}
  }
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export function addEpisodeWatchLater(showId: string | number, season: number, episode: number, showTitle: string): void {
  const key = `${EP_WL_PREFIX}${showId}-S${season}E${episode}`;
  localStorage.setItem(key, JSON.stringify({ showId, season, episode, showTitle, addedAt: Date.now() }));
}

export function removeEpisodeWatchLater(showId: string | number, season: number, episode: number): void {
  localStorage.removeItem(`${EP_WL_PREFIX}${showId}-S${season}E${episode}`);
}

export function isInEpisodeWatchLater(showId: string | number, season: number, episode: number): boolean {
  return localStorage.getItem(`${EP_WL_PREFIX}${showId}-S${season}E${episode}`) !== null;
}

export function getWatchedCount(showId: string | number, seasonNumber: number, episodeCount: number): number {
  let count = 0;
  const index = getWatchedIndex();
  const prefix = `watched:tv-${showId}-S${seasonNumber}E`;
  for (const k of index) {
    if (k.startsWith(prefix)) {
      const ep = parseInt(k.slice(prefix.length), 10);
      if (!isNaN(ep) && ep <= episodeCount) count++;
    }
  }
  return count;
}

export function markSeasonWatched(showId: string | number, seasonNumber: number, episodeCount: number, showName: string, poster: string): void {
  for (let i = 1; i <= episodeCount; i++) {
    if (!isWatched('tv', showId, seasonNumber, i)) {
      markWatched('tv', showId, showName, seasonNumber, i, { title: showName, poster });
    }
  }
}

export function markAllSeasonsWatched(showId: string | number, seasons: { season_number: number; episode_count: number }[], showName: string, poster: string): void {
  for (const s of seasons) {
    markSeasonWatched(showId, s.season_number, s.episode_count, showName, poster);
  }
}

export function unmarkAllSeasonsWatched(showId: string | number, seasons: { season_number: number; episode_count: number }[]): void {
  for (const s of seasons) {
    for (let i = 1; i <= s.episode_count; i++) {
      markUnwatched('tv', showId, s.season_number, i);
    }
  }
}

const NOTIFICATIONS_MAX = 50;
const SEARCH_HISTORY_KEY = 'search_history';
const SEARCH_HISTORY_MAX = 15;

export function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]') as string[] || [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const list = getSearchHistory().filter((q: string) => q.toLowerCase() !== trimmed.toLowerCase());
  list.unshift(trimmed);
  if (list.length > SEARCH_HISTORY_MAX) list.length = SEARCH_HISTORY_MAX;
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
}

const EXPORT_KEYS = ['watched:', 'progress:', 'watchlater', 'epwl:', 'search_history', 'watched_index', 'progress_index', 'notifications'];

function isExportKey(k: string): boolean {
  return EXPORT_KEYS.some((prefix) => k === prefix || k.startsWith(prefix));
}

export function exportData(): Record<string, string | null> {
  const data: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && isExportKey(k)) {
      data[k] = localStorage.getItem(k);
    }
  }
  return data;
}

export function importData(data: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge'): void {
  if (mode === 'replace') {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isExportKey(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  }
  Object.entries(data).forEach(([k, v]) => {
    if (isExportKey(k)) localStorage.setItem(k, String(v));
  });
}

export async function getStorageUsage(): Promise<StorageUsage> {
  let total = 0;
  const breakdown = { watched: 0, progress: 0, watchlater: 0, epwl: 0, notifications: 0, cache: 0, other: 0 };
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const v = localStorage.getItem(k) || '';
    const bytes = (k.length + v.length) * 2;
    total += bytes;
    if (k.startsWith('watched:')) breakdown.watched += bytes;
    else if (k.startsWith('progress:')) breakdown.progress += bytes;
    else if (k === 'watchlater') breakdown.watchlater += bytes;
    else if (k.startsWith('epwl:')) breakdown.epwl += bytes;
    else if (k === 'notifications') breakdown.notifications += bytes;
    else breakdown.other += bytes;
  }
  const cacheBytes = await getTMDBCacheSize();
  breakdown.cache = cacheBytes;
  total += cacheBytes;
  return { total, breakdown };
}

export function getStats(): Stats {
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

export function clearAllData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (
      k.startsWith('watched:') ||
      k.startsWith('progress:') ||
      k === 'watchlater' ||
      k.startsWith('epwl:') ||
      k === 'search_history' ||
      k === NOTIFICATIONS_KEY ||
      k === PROGRESS_INDEX_KEY ||
      k === WATCHED_INDEX_KEY
    )) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

export function getVideoSource(): string {
  return localStorage.getItem(VIDEO_SOURCE_KEY) || 'vidsrc';
}

export function setVideoSource(source: string): void {
  localStorage.setItem(VIDEO_SOURCE_KEY, source);
}

const NOTIFICATIONS_KEY = 'notifications';

export function getNotifications(): NotificationItem[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]') as NotificationItem[] || [];
  } catch {
    return [];
  }
}

export function addNotification(showId: string | number, showTitle: string, season: number, episode: number, episodeTitle: string | null, type: string, airDate: string | null): string {
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
  if (list.length > NOTIFICATIONS_MAX) list.length = NOTIFICATIONS_MAX;
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
  return id;
}

export function removeNotification(id: string): void {
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(getNotifications().filter((n: NotificationItem) => n.id !== id)));
}

export function markAllNotificationsRead(): void {
  const list = getNotifications();
  list.forEach((n: NotificationItem) => { n.read = true; });
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(list));
}

export function clearAllNotifications(): void {
  localStorage.removeItem(NOTIFICATIONS_KEY);
}

export function isAlreadyNotified(showId: string | number, season: number, episode: number): boolean {
  const sid = String(showId);
  return getNotifications().some((n: NotificationItem) => n.showId === sid && n.season === season && n.episode === episode);
}
