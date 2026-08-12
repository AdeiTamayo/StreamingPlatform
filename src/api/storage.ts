import { logDebug, logError } from '../utils/logger';
import { getTMDBCacheSize, clearTMDBCache } from './tmdbCache';
import { watchedRepository } from '../repositories/watchedRepository';
import { progressRepository } from '../repositories/progressRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { notificationRepository } from '../repositories/notificationRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import { settingsRepository } from '../repositories/settingsRepository';
import { syncOfflineQueue, initOfflineQueueSync, clearOfflineQueue, OFFLINE_QUEUE_KEY } from '../utils/offlineQueue';
import type { WatchedInsert } from '../types/database';
import type { LastSeenItem, ContinueWatchingItem, WatchLaterItem, EpisodeWatchLaterItem, NotificationItem, StorageUsage, Stats, ProgressData, WatchedData, MediaType } from '../types';

export const WL_KEY = 'watchlater';
export const PROGRESS_INDEX_KEY = 'progress_index';
export const WATCHED_INDEX_KEY = 'watched_index';
export const EP_WL_INDEX_KEY = 'epwl_index';
export const VIDEO_SOURCE_KEY = 'video_source';
export const NOTIFICATIONS_KEY = 'notifications';
export const SEARCH_HISTORY_KEY = 'search_history';
export const EP_WL_PREFIX = 'epwl:';
export const NOTIFICATIONS_MAX = 50;
export const SEARCH_HISTORY_MAX = 15;
export const EP_WL_MAX = 200;

// Keys/prefixes owned by this app's data layer. Kept in one place so
// clearAllData and clearLegacyData can't drift apart.
export const LOCAL_DATA_KEYS: string[] = [
  'watched:',
  'progress:',
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  NOTIFICATIONS_KEY,
  PROGRESS_INDEX_KEY,
  WATCHED_INDEX_KEY,
  OFFLINE_QUEUE_KEY,
  'app_errors',
  'player_debug',
];

let currentUserId: string | null = null;

export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
  if (userId) {
    initOfflineQueueSync();
    syncOfflineQueue().catch(() => {});
  }
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function watchedKey(type: string, id: string | number, season?: number | null, episode?: number | null): string {
  if (type === 'movie') return `watched:movie-${id}`;
  if (season == null || episode == null) return `watched:tv-${id}`;
  return `watched:tv-${id}-S${season}E${episode}`;
}

export function progressKey(type: string, id: string | number, season?: number | null, episode?: number | null): string {
  if (type === 'movie') return `progress:movie-${id}`;
  return `progress:tv-${id}-S${season}E${episode}`;
}

function parseWatchedKey(k: string): { type: string; showId?: string; id: string; season: number | null; episode: number | null } | null {
  let m = k.match(/^watched:tv-(\d+)-S(\d+)E(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: Number(m[2]), episode: Number(m[3]) };
  m = k.match(/^watched:tv-(\d+)$/);
  if (m) return { type: 'tv', showId: m[1], id: m[1], season: null, episode: null };
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
    // Corrupted JSON
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
  try {
    localStorage.setItem(key, JSON.stringify(index));
  } catch (err) {
    logError('storage.saveIndex', err);
  }
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

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    logError('storage.setItem', err);
  }
}

export function isWatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): boolean {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type: MediaType, id: string | number, title: string, season?: number | null, episode?: number | null, meta?: Record<string, unknown>): void {
  const data: WatchedData = { type, id, title, season: season ?? undefined, episode: episode ?? undefined, watchedAt: Date.now(), ...(meta ? { meta } : {}) };
  const key = watchedKey(type, id, season, episode);
  safeWrite(key, JSON.stringify(data));
  addToWatchedIndex(key);

  if (currentUserId) {
    watchedRepository.mark({
      user_id: currentUserId,
      media_type: type,
      tmdb_id: Number(id),
      title,
      season: season ?? null,
      episode: episode ?? null,
      watched_at: new Date().toISOString(),
      meta: (meta ?? null) as never,
    });
  }
}

export function markUnwatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): void {
  const key = watchedKey(type, id, season, episode);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);

  if (currentUserId) {
    if (type === 'tv' && season == null && episode == null) {
      watchedRepository.unmarkSeries(currentUserId, Number(id));
    } else {
      watchedRepository.unmark(currentUserId, type, Number(id), season, episode);
    }
  }
}

export function isSeriesWatched(showId: string | number): boolean {
  return localStorage.getItem(watchedKey('tv', showId, null, null)) !== null;
}

export function getSeriesWatchedFlag(showId: string | number): { watched: boolean; source?: 'explicit' | 'auto' } {
  const raw = localStorage.getItem(watchedKey('tv', showId, null, null));
  if (!raw) return { watched: false };
  try {
    const data = JSON.parse(raw) as WatchedData;
    return { watched: true, source: (data.meta?.source as 'explicit' | 'auto') || 'explicit' };
  } catch {
    return { watched: true };
  }
}

export function markSeriesWatched(showId: string | number, showName: string, poster: string, source: 'explicit' | 'auto' = 'explicit'): void {
  const meta = { title: showName, poster, source };
  const key = watchedKey('tv', showId, null, null);
  safeWrite(key, JSON.stringify({ type: 'tv', id: showId, title: showName, watchedAt: Date.now(), meta }));
  addToWatchedIndex(key);

  if (currentUserId) {
    watchedRepository.mark({
      user_id: currentUserId,
      media_type: 'tv',
      tmdb_id: Number(showId),
      title: showName,
      season: null,
      episode: null,
      watched_at: new Date().toISOString(),
      meta: meta as never,
    });
  }
}

export function unmarkSeriesWatched(showId: string | number): void {
  const key = watchedKey('tv', showId, null, null);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);

  if (currentUserId) {
    watchedRepository.unmarkSeries(currentUserId, Number(showId));
  }
}

// Keeps the implicit (auto) series flag in sync with the per-episode watched
// state: set when every known episode is watched, cleared when new episodes
// air or are unmarked. Explicit marks are never touched.
export function syncSeriesWatchedFlag(showId: string | number, seasons: { season_number: number; episode_count: number }[], showName: string, poster: string): void {
  if (seasons.length === 0) return;
  const allWatched = seasons.every((s) => getWatchedCount(showId, s.season_number, s.episode_count) >= s.episode_count);
  const flag = getSeriesWatchedFlag(showId);
  if (allWatched) {
    if (!flag.watched) markSeriesWatched(showId, showName, poster, 'auto');
  } else if (flag.watched && flag.source === 'auto') {
    unmarkSeriesWatched(showId);
  }
}

export function getWatchedEpisodeSet(id: string | number, season: number, episodeCount?: number): Set<number> {
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

export async function clearShowHistory(showId: string | number): Promise<void> {
  const showIdStr = String(showId);
  const removed = new Set<string>();
  const watchedIndex = getWatchedIndex();
  const remainingWatched: string[] = [];
  for (const k of watchedIndex) {
    const p = parseWatchedKey(k);
    if (p && p.showId === showIdStr) {
      localStorage.removeItem(k);
      removed.add(k);
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
      removed.add(k);
    } else {
      remainingProgress.push(k);
    }
  }
  saveIndex(PROGRESS_INDEX_KEY, remainingProgress);

  // Orphaned keys written outside the index (e.g. importData before the
  // index-rebuild fix) would survive the index loop - sweep them up too.
  let orphansWatched = false;
  let orphansProgress = false;
  const sweep: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || removed.has(k)) continue;
    if (parseWatchedKey(k)?.showId === showIdStr) {
      sweep.push(k);
      orphansWatched = true;
    } else if (parseProgressKey(k)?.showId === showIdStr) {
      sweep.push(k);
      orphansProgress = true;
    }
  }
  sweep.forEach((k) => localStorage.removeItem(k));
  if (orphansWatched) saveIndex(WATCHED_INDEX_KEY, getWatchedIndex());
  if (orphansProgress) saveIndex(PROGRESS_INDEX_KEY, getProgressIndex());

  if (currentUserId) {
    await watchedRepository.clearShowHistory(currentUserId, Number(showId));
    await progressRepository.clearByShowId(currentUserId, Number(showId));
  }
}

export function getLastWatchedEpisode(showId: string | number): { type: string; showId: string; id: string; season: number; episode: number; watchedAt: number } | null {
  let last: { type: string; showId: string; id: string; season: number; episode: number; watchedAt: number } | null = null;
  const index = getWatchedIndex();
  for (const k of index) {
    const p = parseWatchedKey(k);
    if (p && p.showId === String(showId) && (p.season ?? 0) > 0) {
      try {
        const data: WatchedData = JSON.parse(localStorage.getItem(k) || '{}');
        if (!Number.isFinite(data.watchedAt)) continue;
        if (!last || data.watchedAt > last.watchedAt) {
          last = { ...p, showId: p.showId ?? '', season: data.season ?? p.season ?? 0, episode: data.episode ?? p.episode ?? 0, watchedAt: data.watchedAt };
        }
      } catch {}
    }
  }
  return last;
}

export function saveProgress(type: MediaType, id: string | number, currentTime: number, season?: number | null, episode?: number | null, meta?: Record<string, unknown>, duration?: number): void {
  const data: ProgressData = { type, id, currentTime, savedAt: Date.now(), season: season ?? undefined, episode: episode ?? undefined, ...(duration ? { duration } : {}), ...(meta ? { meta } : {}) };
  try {
    localStorage.setItem(progressKey(type, id, season, episode), JSON.stringify(data));
    addToProgressIndex(progressKey(type, id, season, episode));
    logDebug(`saveProgress key=${progressKey(type, id, season, episode)} currentTime=${currentTime}`);
  } catch (err) {
    logDebug(`saveProgress FAILED key=${progressKey(type, id, season, episode)} err=${String(err)}`);
  }

  if (currentUserId) {
    progressRepository.save({
      user_id: currentUserId,
      media_type: type,
      tmdb_id: Number(id),
      season: season ?? null,
      episode: episode ?? null,
      current_time: currentTime,
      duration: duration ?? null,
      meta: (meta ?? null) as never,
    });
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

  if (currentUserId) {
    progressRepository.clear(currentUserId, type, Number(id), season, episode);
  }
}

export function getWatchLater(): WatchLaterItem[] {
  try {
    return JSON.parse(localStorage.getItem(WL_KEY) || '[]') as WatchLaterItem[] || [];
  } catch {
    return [];
  }
}

export function addWatchLater(type: MediaType, id: string | number, title: string, year: string, poster: string): void {
  const list = getWatchLater().filter((item: WatchLaterItem) => !(item.type === type && String(item.id) === String(id)));
  list.push({ type, id, title, year, poster, addedAt: Date.now() });
  safeWrite(WL_KEY, JSON.stringify(list));

  if (currentUserId) {
    watchLaterRepository.add({
      user_id: currentUserId,
      media_type: type,
      tmdb_id: Number(id),
      title,
      year: year || null,
      poster: poster || null,
      season: null,
      episode: null,
    });
  }
}

export function removeWatchLater(type: MediaType, id: string | number): void {
  const list = getWatchLater().filter((item: WatchLaterItem) => !(item.type === type && String(item.id) === String(id)));
  safeWrite(WL_KEY, JSON.stringify(list));

  if (currentUserId) {
    watchLaterRepository.remove(currentUserId, type, Number(id));
  }
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
    const p = parseProgressKey(k);
    if (!p) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}') as Record<string, unknown>;
      if (!data || (data.currentTime as number) <= 30) continue;
      const wKey = k.replace('progress:', 'watched:');
      if (localStorage.getItem(wKey)) continue;
      progressItems.push({
        type: p.type as MediaType,
        id: (p.showId ?? p.id) as string | number,
        season: p.season as number | null,
        episode: p.episode as number | null,
        currentTime: data.currentTime as number,
        savedAt: data.savedAt as number,
        meta: (data.meta || null) as Record<string, unknown> | null,
      });
    } catch {}
  }
  return progressItems.sort((a, b) => b.savedAt - a.savedAt);
}

export function getEpisodeWatchLater(): EpisodeWatchLaterItem[] {
  const items: EpisodeWatchLaterItem[] = [];
  const index = getIndex(EP_WL_INDEX_KEY, EP_WL_PREFIX);
  for (const k of index) {
    try {
      const item = JSON.parse(localStorage.getItem(k) || '{}') as EpisodeWatchLaterItem;
      if (item && item.showId != null) items.push(item);
    } catch {}
  }
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

function pruneEpisodeWatchLater(): void {
  const index = getIndex(EP_WL_INDEX_KEY, EP_WL_PREFIX);
  if (index.length <= EP_WL_MAX) return;
  const entries = index
    .map((k) => ({ key: k, addedAt: (JSON.parse(localStorage.getItem(k) || '{}') as EpisodeWatchLaterItem).addedAt || 0 }))
    .sort((a, b) => a.addedAt - b.addedAt);
  const toRemove = entries.slice(0, entries.length - EP_WL_MAX);
  toRemove.forEach(({ key }) => {
    localStorage.removeItem(key);
    removeFromIndex(key, EP_WL_INDEX_KEY, EP_WL_PREFIX);
  });
}

export function addEpisodeWatchLater(showId: string | number, season: number, episode: number, showTitle: string): void {
  const key = `${EP_WL_PREFIX}${showId}-S${season}E${episode}`;
  safeWrite(key, JSON.stringify({ showId, season, episode, showTitle, addedAt: Date.now() }));
  addToIndex(key, EP_WL_INDEX_KEY, EP_WL_PREFIX);
  pruneEpisodeWatchLater();

  if (currentUserId) {
    watchLaterRepository.add({
      user_id: currentUserId,
      media_type: 'tv',
      tmdb_id: Number(showId),
      title: showTitle,
      year: null,
      poster: null,
      season,
      episode,
    });
  }
}

export function removeEpisodeWatchLater(showId: string | number, season: number, episode: number): void {
  const key = `${EP_WL_PREFIX}${showId}-S${season}E${episode}`;
  localStorage.removeItem(key);
  removeFromIndex(key, EP_WL_INDEX_KEY, EP_WL_PREFIX);

  if (currentUserId) {
    watchLaterRepository.removeEpisode(currentUserId, Number(showId), season, episode);
  }
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
  const newKeys: string[] = [];
  const batch: WatchedInsert[] = [];
  const watchedAt = new Date().toISOString();
  const meta = { title: showName, poster };

  for (let i = 1; i <= episodeCount; i++) {
    const key = watchedKey('tv', showId, seasonNumber, i);
    if (localStorage.getItem(key)) continue;
    newKeys.push(key);
    safeWrite(key, JSON.stringify({ type: 'tv', id: showId, title: showName, season: seasonNumber, episode: i, watchedAt: Date.now(), meta }));
    if (currentUserId) {
      batch.push({
        user_id: currentUserId,
        media_type: 'tv',
        tmdb_id: Number(showId),
        title: showName,
        season: seasonNumber,
        episode: i,
        watched_at: watchedAt,
        meta: meta as never,
      });
    }
  }

  if (newKeys.length > 0) {
    const index = getWatchedIndex();
    const merged = [...new Set([...index, ...newKeys])];
    saveIndex(WATCHED_INDEX_KEY, merged);
  }

  if (batch.length > 0) {
    watchedRepository.markBatch(batch);
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
  safeWrite(SEARCH_HISTORY_KEY, JSON.stringify(list));

  if (currentUserId) {
    searchHistoryRepository.add({ user_id: currentUserId, query: trimmed });
  }
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

function rebuildIndices(): void {
  const watchedIndex: string[] = [];
  const progressIndex: string[] = [];
  const epwlIndex: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith('watched:')) watchedIndex.push(k);
    else if (k.startsWith('progress:')) progressIndex.push(k);
    else if (k.startsWith(EP_WL_PREFIX)) epwlIndex.push(k);
  }
  saveIndex(WATCHED_INDEX_KEY, watchedIndex);
  saveIndex(PROGRESS_INDEX_KEY, progressIndex);
  saveIndex(EP_WL_INDEX_KEY, epwlIndex);
}

export function importData(data: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge'): number {
  let imported = 0;
  if (mode === 'replace') {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isExportKey(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  }
  Object.entries(data).forEach(([k, v]) => {
    if (isExportKey(k)) {
      localStorage.setItem(k, String(v));
      imported++;
    }
  });
  // Imported watched/progress/epwl keys must be reflected in the indices or
  // they stay invisible to LastSeen/Stats/ContinueWatching.
  rebuildIndices();
  return imported;
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
  let seriesWatched = 0;
  const index = getWatchedIndex();
  for (const k of index) {
    if (k.includes('movie-')) moviesWatched++;
    else if (k.match(/tv-\d+-S\d+E\d+/)) episodesWatched++;
    else if (k.match(/^watched:tv-\d+$/)) seriesWatched++;
  }
  const wl = getWatchLater();
  const epWl = getEpisodeWatchLater();
  return { moviesWatched, episodesWatched, seriesWatched, watchLaterCount: wl.length + epWl.length };
}

export function clearAllData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && LOCAL_DATA_KEYS.some((prefix) => k === prefix || k.startsWith(prefix))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  clearOfflineQueue();
  void clearTMDBCache();
}

export function getVideoSource(): string {
  return localStorage.getItem(VIDEO_SOURCE_KEY) || 'vidsrc';
}

export function setVideoSource(source: string): void {
  safeWrite(VIDEO_SOURCE_KEY, source);

  if (currentUserId) {
    settingsRepository.upsert({ user_id: currentUserId, preferred_video_source: source });
  }
}

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
  safeWrite(NOTIFICATIONS_KEY, JSON.stringify(list));

  if (currentUserId) {
    notificationRepository.add({
      user_id: currentUserId,
      title: showTitle,
      message: episodeTitle || null,
      media_type: 'tv',
      tmdb_id: Number(showId),
      season,
      episode,
      read: false,
    });
  }

  return id;
}

export function removeNotification(id: string): void {
  const list = getNotifications();
  const item = list.find((n: NotificationItem) => n.id === id);
  safeWrite(NOTIFICATIONS_KEY, JSON.stringify(list.filter((n: NotificationItem) => n.id !== id)));

  if (currentUserId && item) {
    notificationRepository.remove(currentUserId, Number(item.showId), item.season, item.episode);
  }
}

export function markAllNotificationsRead(): void {
  const list = getNotifications();
  list.forEach((n: NotificationItem) => { n.read = true; });
  safeWrite(NOTIFICATIONS_KEY, JSON.stringify(list));

  if (currentUserId) {
    notificationRepository.markAllRead(currentUserId);
  }
}

export function clearAllNotifications(): void {
  localStorage.removeItem(NOTIFICATIONS_KEY);

  if (currentUserId) {
    notificationRepository.clearAll(currentUserId);
  }
}

export function isAlreadyNotified(showId: string | number, season: number, episode: number): boolean {
  const sid = String(showId);
  return getNotifications().some((n: NotificationItem) => n.showId === sid && n.season === season && n.episode === episode);
}
