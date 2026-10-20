import { logDebug, logError } from '../utils/logger';
import { getTMDBCacheSize, clearTMDBCache } from './tmdbCache';
import { watchedRepository } from '../repositories/watchedRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import { progressRepository } from '../repositories/progressRepository';
import { syncOfflineQueue, initOfflineQueueSync, disposeOfflineQueueSync, clearOfflineQueue, setSyncUserId, OFFLINE_QUEUE_KEY } from '../utils/offlineQueue';
import { isValidTimezone, getSystemTimezone } from '../utils/calendar';
import type { WatchedInsert } from '../types/database';
import type { LastSeenItem, ContinueWatchingItem, WatchLaterItem, EpisodeWatchLaterItem, NotificationItem, StorageUsage, Stats, ProgressData, WatchedData, MediaType } from '../types';

export const WL_KEY = 'watchlater';
export const PROGRESS_INDEX_KEY = 'progress_index';
export const WATCHED_INDEX_KEY = 'watched_index';
export const EP_WL_INDEX_KEY = 'epwl_index';
export const VIDEO_SOURCE_KEY = 'video_source';
export const NOTIFICATIONS_KEY = 'notifications';
export const NOTIFICATIONS_DISMISSED_KEY = 'notifications_dismissed';
export const SEARCH_HISTORY_KEY = 'search_history';
export const EP_WL_PREFIX = 'epwl:';
export const NOTIFICATIONS_MAX = 50;
export const SEARCH_HISTORY_MAX = 15;
export const EP_WL_MAX = 200;
export const WATCH_LATER_MAX = 5000;
export const NEW_EPISODE_SCAN_KEY = 'new_episode_scan_last_run';
export const DATA_OWNER_KEY = 'streamflow_data_owner';
export const MIGRATION_FLAG_PREFIX = 'supabase_data_migrated:';
export const LEGACY_MIGRATION_FLAG_KEY = 'supabase_data_migrated';

// Keys/prefixes owned by this app's data layer. clearAllData (explicit user
// wipe) removes all of these; the login migration only clears the mirrored
// subset (see MIGRATED_KEYS in dataMigration) and preserves local-only state.
export const LOCAL_DATA_KEYS: string[] = [
  'watched:',
  'progress:',
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  NOTIFICATIONS_KEY,
  NOTIFICATIONS_DISMISSED_KEY,
  PROGRESS_INDEX_KEY,
  WATCHED_INDEX_KEY,
  OFFLINE_QUEUE_KEY,
  NEW_EPISODE_SCAN_KEY,
  'app_errors',
  'player_debug',
  'omdb:',
];

let currentUserId: string | null = null;

// Keys written locally during this tab session. The sign-in reconcile treats
// the cloud as authoritative for deletions (so removing something on another
// device propagates here), but must never drop a row the user just created
// locally while its upload is still in flight or parked in the offline queue.
export const sessionModifiedKeys = {
  progress: new Set<string>(),
  watched: new Set<string>(),
  watchLater: new Set<string>(),
  episodeWatchLater: new Set<string>(),
};

// Local state that belongs to a signed-in account. It is mirrored from
// Supabase, so clearing it never loses cloud data - it is re-downloaded on the
// next sign-in. The offline queue and per-user migration flags are
// deliberately excluded: they must survive a sign-out so another account can
// never replay or inherit the previous user's pending writes.
const USER_SCOPED_LOCAL_KEYS: string[] = [
  'watched:',
  'progress:',
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  NOTIFICATIONS_KEY,
  NOTIFICATIONS_DISMISSED_KEY,
  PROGRESS_INDEX_KEY,
  WATCHED_INDEX_KEY,
  NEW_EPISODE_SCAN_KEY,
  'app_errors',
  'player_debug',
];

/**
 * Removes every local key that belongs to the current account, except the
 * offline queue and migration flags. Used when the local owner changes so a
 * second account on a shared browser cannot see or re-upload the first
 * account's library.
 */
export function clearLocalUserData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && USER_SCOPED_LOCAL_KEYS.some((key) => k === key || k.startsWith(key))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  sessionModifiedKeys.progress.clear();
  sessionModifiedKeys.watched.clear();
  sessionModifiedKeys.watchLater.clear();
  sessionModifiedKeys.episodeWatchLater.clear();
}

// The owner marker is absent for anonymous (pre-login) data and for data
// written by versions that predate it. Migration flags act as a fallback
// owner signal for that upgrade path: if a flag exists for a different user,
// the local data must not be uploaded to the account that is signing in now.
function localDataBelongsToAnotherUser(userId: string): boolean {
  const owner = localStorage.getItem(DATA_OWNER_KEY);
  if (owner) return owner !== userId;

  // Pre-owner versions used a single global migration flag. Its owner is
  // unknowable, so treat the data as foreign and re-download it from the
  // account's cloud copy when it signs in.
  if (localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY)) return true;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(MIGRATION_FLAG_PREFIX) && k.slice(MIGRATION_FLAG_PREFIX.length) !== userId) {
      return true;
    }
  }
  return false;
}

const PROGRESS_REMOTE_SYNC_MS = 60_000;
const progressRemoteSyncedAt = new Map<string, number>();

export function setCurrentUserId(userId: string | null): void {
  if (userId) {
    if (localDataBelongsToAnotherUser(userId)) {
      clearLocalUserData();
    }
    localStorage.setItem(DATA_OWNER_KEY, userId);
  } else if (localStorage.getItem(DATA_OWNER_KEY)) {
    // A real sign-out (or an expired session on boot) must not leave the
    // previous account's library readable to the next visitor. Anonymous data
    // created while signed out has no owner marker and is preserved.
    clearLocalUserData();
    localStorage.removeItem(DATA_OWNER_KEY);
  }

  currentUserId = userId;
  progressRemoteSyncedAt.clear();
  // Scope queue replay to this user so another account's pending writes are
  // left queued instead of failing RLS under this session.
  setSyncUserId(userId);
  if (userId) {
    initOfflineQueueSync();
    syncOfflineQueue().catch(() => {});
  } else {
    // Signed out: stop the retry loop so the queue can't be replayed (and
    // dropped) without a session. Re-initialised on the next sign-in.
    disposeOfflineQueueSync();
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
  if (index.length > 0) saveIndex(key, index);
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

// Returns false when the write failed (e.g. quota exceeded). Indexed writers
// must only update the index on true, otherwise the index points at missing
// values that readers count as real entries (ghosts).
function safeWrite(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    logError('storage.setItem', err);
    return false;
  }
}

// Remote tables use integer tmdb_id columns. Non-numeric local ids (movie
// slugs) stay local-only instead of sending NaN to Supabase, where the write
// would fail, get queued, and burn retries forever.
function isSyncableId(id: string | number): boolean {
  return Number.isFinite(Number(id));
}

export function isWatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): boolean {
  return localStorage.getItem(watchedKey(type, id, season, episode)) !== null;
}

export function markWatched(type: MediaType, id: string | number, title: string, season?: number | null, episode?: number | null, meta?: Record<string, unknown>): void {
  const data: WatchedData = { type, id, title, season: season ?? undefined, episode: episode ?? undefined, watchedAt: Date.now(), ...(meta ? { meta } : {}) };
  const key = watchedKey(type, id, season, episode);
  sessionModifiedKeys.watched.add(key);
  if (safeWrite(key, JSON.stringify(data))) {
    addToWatchedIndex(key);
  }

  if (currentUserId && isSyncableId(id)) {
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

  // Marked watched means no longer being watched.
  if (localStorage.getItem(progressKey(type, id, season, episode))) {
    clearWatching(type, id, season, episode);
  }
}

export function markUnwatched(type: MediaType, id: string | number, season?: number | null, episode?: number | null): void {
  const key = watchedKey(type, id, season, episode);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);

  if (currentUserId && isSyncableId(id)) {
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

export function getSeriesWatchedFlag(showId: string | number): { watched: boolean; source?: 'explicit' | 'auto'; watchedAt?: number } {
  const raw = localStorage.getItem(watchedKey('tv', showId, null, null));
  if (!raw) return { watched: false };
  try {
    const data = JSON.parse(raw) as WatchedData;
    return { watched: true, source: (data.meta?.source as 'explicit' | 'auto') || 'explicit', watchedAt: data.watchedAt };
  } catch {
    return { watched: true };
  }
}

export function getSeriesWatchedShows(): Array<{ id: string; title: string; poster: string; watchedAt: number; source: 'explicit' | 'auto' }> {
  const shows: Array<{ id: string; title: string; poster: string; watchedAt: number; source: 'explicit' | 'auto' }> = [];
  const index = getWatchedIndex();
  for (const k of index) {
    const m = k.match(/^watched:tv-(\d+)$/);
    if (!m) continue;
    const raw = localStorage.getItem(k);
    if (!raw) {
      // Index points at a missing value: heal it instead of fabricating a
      // titleless show from the key alone.
      removeFromWatchedIndex(k);
      continue;
    }
    try {
      const data = JSON.parse(raw) as WatchedData;
      shows.push({
        id: m[1],
        title: data.title || '',
        poster: (data.meta?.poster as string) || '',
        watchedAt: data.watchedAt || 0,
        source: (data.meta?.source as 'explicit' | 'auto') || 'explicit',
      });
    } catch {}
  }
  return shows;
}

export function markSeriesWatched(showId: string | number, showName: string, poster: string, source: 'explicit' | 'auto' = 'explicit'): void {
  const meta = { title: showName, poster, source };
  const key = watchedKey('tv', showId, null, null);
  sessionModifiedKeys.watched.add(key);
  if (safeWrite(key, JSON.stringify({ type: 'tv', id: showId, title: showName, watchedAt: Date.now(), meta }))) {
    addToWatchedIndex(key);
  }

  if (currentUserId && isSyncableId(showId)) {
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

  // The whole show is watched, so nothing in it is being watched.
  clearWatchingForShow(showId);
}

export function unmarkSeriesWatched(showId: string | number): void {
  const key = watchedKey('tv', showId, null, null);
  localStorage.removeItem(key);
  removeFromWatchedIndex(key);

  if (currentUserId && isSyncableId(showId)) {
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
    // Also drop the remote Continue Watching rows for the show, otherwise the
    // next sync re-downloads them (as cloudOnly) and they reappear.
    await progressRepository.clearShow(currentUserId, Number(showId));
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

// Records that a movie/episode is being watched. No playback position is
// stored: the embed does not report one reliably, so Continue Watching is
// driven purely by this flag. Starting a title also clears its watched mark,
// so a rewatch moves it out of Last Seen and back into Continue Watching.
export function markWatching(type: MediaType, id: string | number, season?: number | null, episode?: number | null, meta?: Record<string, unknown>): void {
  const data: ProgressData = { type, id, savedAt: Date.now(), season: season ?? undefined, episode: episode ?? undefined, ...(meta ? { meta } : {}) };
  const key = progressKey(type, id, season, episode);
  sessionModifiedKeys.progress.add(key);
  try {
    localStorage.setItem(key, JSON.stringify(data));
    addToProgressIndex(key);
  } catch (err) {
    logDebug(`markWatching FAILED key=${key} err=${String(err)}`);
  }

  // Watched and watching are mutually exclusive.
  if (localStorage.getItem(watchedKey(type, id, season, episode))) {
    markUnwatched(type, id, season, episode);
  }
  if (type === 'tv' && isSeriesWatched(id)) {
    unmarkSeriesWatched(id);
  }

  const title = typeof meta?.title === 'string' ? meta.title : '';
  if (currentUserId && isSyncableId(id) && title) {
    const now = Date.now();
    const last = progressRemoteSyncedAt.get(key);
    if (last == null || now - last >= PROGRESS_REMOTE_SYNC_MS) {
      progressRemoteSyncedAt.set(key, now);
      progressRepository.save({
        user_id: currentUserId,
        media_type: type,
        tmdb_id: Number(id),
        title,
        poster: typeof meta?.poster === 'string' ? meta.poster : null,
        season: season ?? null,
        episode: episode ?? null,
      });
    }
  }
}

export function getWatching(type: string, id: string | number, season?: number | null, episode?: number | null): ProgressData | null {
  try {
    const raw = localStorage.getItem(progressKey(type, id, season, episode));
    if (!raw) return null;
    return JSON.parse(raw) as ProgressData || null;
  } catch {
    return null;
  }
}

export function clearWatching(type: MediaType, id: string | number, season?: number | null, episode?: number | null): void {
  const key = progressKey(type, id, season, episode);
  localStorage.removeItem(key);
  removeFromProgressIndex(key);
  progressRemoteSyncedAt.delete(key);

  if (currentUserId && isSyncableId(id)) {
    progressRepository.remove(currentUserId, type, Number(id), season, episode);
  }
}

// Drops every Continue Watching row for a show (local + remote). Used when a
// series/season is marked watched, which means nothing in it is being watched.
function clearWatchingForShow(showId: string | number): void {
  const showIdStr = String(showId);
  const keep: string[] = [];
  for (const k of getProgressIndex()) {
    if (parseProgressKey(k)?.showId === showIdStr) {
      localStorage.removeItem(k);
      progressRemoteSyncedAt.delete(k);
    } else {
      keep.push(k);
    }
  }
  saveIndex(PROGRESS_INDEX_KEY, keep);
  if (currentUserId && isSyncableId(showId)) {
    void progressRepository.clearShow(currentUserId, Number(showId)).catch(() => {});
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
  sessionModifiedKeys.watchLater.add(`${type}:${String(id)}`);

  if (currentUserId && isSyncableId(id)) {
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

  if (currentUserId && isSyncableId(id)) {
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
      const raw = localStorage.getItem(k);
      if (!raw) {
        // Dangling index key: heal it rather than emitting a ghost row
        // (empty title, ts 0) built from the key alone.
        removeFromWatchedIndex(k);
        continue;
      }
      const data = JSON.parse(raw) as Record<string, unknown>;
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
          meta: (data.meta || null) as Record<string, unknown> | null,
        });
      }
    } catch {}
  }

  // Last Seen is a watch history: only finished or explicitly marked items.
  // In-progress entries live in Continue Watching and must not leak in here.
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
      if (!data) continue;
      // Safety net for rows written by older versions that never cleared
      // progress when something was marked watched.
      if (localStorage.getItem(k.replace('progress:', 'watched:'))) continue;
      if (p.type === 'tv' && isSeriesWatched(p.showId ?? p.id)) continue;
      progressItems.push({
        type: p.type as MediaType,
        id: (p.showId ?? p.id) as string | number,
        season: p.season as number | null,
        episode: p.episode as number | null,
        savedAt: (data.savedAt as number) || 0,
        meta: (data.meta || null) as Record<string, unknown> | null,
        cloudOnly: data.cloudOnly === true ? true : undefined,
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

function readEpwlAddedAt(key: string): number {
  try {
    return (JSON.parse(localStorage.getItem(key) || '{}') as EpisodeWatchLaterItem).addedAt || 0;
  } catch {
    return 0;
  }
}

function pruneEpisodeWatchLater(): void {
  const index = getIndex(EP_WL_INDEX_KEY, EP_WL_PREFIX);
  if (index.length <= EP_WL_MAX) return;
  const entries = index
    .map((k) => ({ key: k, addedAt: readEpwlAddedAt(k) }))
    .sort((a, b) => a.addedAt - b.addedAt);
  const toRemove = entries.slice(0, entries.length - EP_WL_MAX);
  toRemove.forEach(({ key }) => {
    localStorage.removeItem(key);
    removeFromIndex(key, EP_WL_INDEX_KEY, EP_WL_PREFIX);
  });
}

export function addEpisodeWatchLater(showId: string | number, season: number, episode: number, showTitle: string): void {
  const key = `${EP_WL_PREFIX}${showId}-S${season}E${episode}`;
  sessionModifiedKeys.episodeWatchLater.add(key);
  if (safeWrite(key, JSON.stringify({ showId, season, episode, showTitle, addedAt: Date.now() }))) {
    addToIndex(key, EP_WL_INDEX_KEY, EP_WL_PREFIX);
  }
  pruneEpisodeWatchLater();

  if (currentUserId && isSyncableId(showId)) {
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

  if (currentUserId && isSyncableId(showId)) {
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
    sessionModifiedKeys.watched.add(key);
    if (!safeWrite(key, JSON.stringify({ type: 'tv', id: showId, title: showName, season: seasonNumber, episode: i, watchedAt: Date.now(), meta }))) {
      continue;
    }
    newKeys.push(key);
    if (currentUserId && isSyncableId(showId)) {
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

  // Every episode in the season is now watched, so none of them is in progress.
  for (let i = 1; i <= episodeCount; i++) {
    if (localStorage.getItem(progressKey('tv', showId, seasonNumber, i))) {
      clearWatching('tv', showId, seasonNumber, i);
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

export async function clearAllMoviesWatched(): Promise<void> {
  const watchedIndex = getWatchedIndex();
  const movieKeys: string[] = [];
  for (const k of watchedIndex) {
    const p = parseWatchedKey(k);
    if (p && p.type === 'movie') {
      localStorage.removeItem(k);
      movieKeys.push(k);
    }
  }
  const remaining = watchedIndex.filter((k) => !movieKeys.includes(k));
  saveIndex(WATCHED_INDEX_KEY, remaining);

  const progressIndex = getProgressIndex();
  const progressKeys: string[] = [];
  for (const k of progressIndex) {
    const p = parseProgressKey(k);
    if (p && p.type === 'movie') {
      localStorage.removeItem(k);
      progressKeys.push(k);
    }
  }
  const remainingProgress = progressIndex.filter((k) => !progressKeys.includes(k));
  saveIndex(PROGRESS_INDEX_KEY, remainingProgress);

  let orphans = false;
  const sweep: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (parseWatchedKey(k)?.type === 'movie') {
      sweep.push(k);
      orphans = true;
    } else if (parseProgressKey(k)?.type === 'movie') {
      sweep.push(k);
      orphans = true;
    }
  }
  sweep.forEach((k) => localStorage.removeItem(k));
  if (orphans) {
    saveIndex(WATCHED_INDEX_KEY, getWatchedIndex());
    saveIndex(PROGRESS_INDEX_KEY, getProgressIndex());
  }

  if (currentUserId) {
    await watchedRepository.clearAllMovies(currentUserId);
    await progressRepository.clearAllMovies(currentUserId);
  }
}

// --- Sign-in reconcile helpers -------------------------------------------
// Once a user's data has been uploaded, the cloud is authoritative for
// deletions: a row removed on another device must disappear here too. These
// helpers drop local keys the server snapshot no longer contains, while
// protecting (a) keys written in this session (in-flight/queued uploads) and
// (b) local-only keys whose id is not syncable (movie slugs).

function isSyncableLocalId(id: string | number | null | undefined): boolean {
  return id != null && Number.isFinite(Number(id));
}

export function reconcileProgressToRemote(remoteKeys: Set<string>): void {
  const keep: string[] = [];
  for (const k of getProgressIndex()) {
    const parsed = parseProgressKey(k);
    if (!parsed || !isSyncableLocalId(parsed.id) || remoteKeys.has(k) || sessionModifiedKeys.progress.has(k)) {
      keep.push(k);
      continue;
    }
    localStorage.removeItem(k);
    progressRemoteSyncedAt.delete(k);
  }
  saveIndex(PROGRESS_INDEX_KEY, keep);
}

export function reconcileWatchedToRemote(remoteKeys: Set<string>): void {
  const keep: string[] = [];
  for (const k of getWatchedIndex()) {
    const parsed = parseWatchedKey(k);
    if (!parsed || !isSyncableLocalId(parsed.id) || remoteKeys.has(k) || sessionModifiedKeys.watched.has(k)) {
      keep.push(k);
      continue;
    }
    localStorage.removeItem(k);
  }
  saveIndex(WATCHED_INDEX_KEY, keep);
}

export function reconcileWatchLaterToRemote(remoteItemKeys: Set<string>, remoteEpisodeKeys: Set<string>): void {
  const current = getWatchLater();
  const kept = current.filter((item) => {
    const token = `${item.type}:${String(item.id)}`;
    return !isSyncableLocalId(item.id) || remoteItemKeys.has(token) || sessionModifiedKeys.watchLater.has(token);
  });
  if (kept.length !== current.length) safeWrite(WL_KEY, JSON.stringify(kept));

  const keepEpisodes: string[] = [];
  for (const k of getIndex(EP_WL_INDEX_KEY, EP_WL_PREFIX)) {
    const rawId = k.slice(EP_WL_PREFIX.length).split('-S')[0];
    if (!isSyncableLocalId(rawId) || remoteEpisodeKeys.has(k) || sessionModifiedKeys.episodeWatchLater.has(k)) {
      keepEpisodes.push(k);
      continue;
    }
    localStorage.removeItem(k);
  }
  saveIndex(EP_WL_INDEX_KEY, keepEpisodes);
}

function markIndicesAsSessionModified(): void {
  for (const k of getWatchedIndex()) sessionModifiedKeys.watched.add(k);
  for (const k of getProgressIndex()) sessionModifiedKeys.progress.add(k);
  for (const item of getWatchLater()) sessionModifiedKeys.watchLater.add(`${item.type}:${String(item.id)}`);
  for (const k of getIndex(EP_WL_INDEX_KEY, EP_WL_PREFIX)) sessionModifiedKeys.episodeWatchLater.add(k);
}

export function getSearchHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]') as string[] || [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string): void {
  // Matches the 200-char DB constraint from migration 004 so an over-long
  // paste cannot queue a write that will be rejected server-side forever.
  const trimmed = query.trim().slice(0, 200);
  if (!trimmed) return;
  const list = getSearchHistory().filter((q: string) => q.toLowerCase() !== trimmed.toLowerCase());
  list.unshift(trimmed);
  if (list.length > SEARCH_HISTORY_MAX) list.length = SEARCH_HISTORY_MAX;
  safeWrite(SEARCH_HISTORY_KEY, JSON.stringify(list));

  if (currentUserId) {
    searchHistoryRepository.add({ user_id: currentUserId, query: trimmed });
  }
}

export function removeSearchHistory(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  const lowered = trimmed.toLowerCase();
  const list = getSearchHistory().filter((q: string) => q.toLowerCase() !== lowered);
  safeWrite(SEARCH_HISTORY_KEY, JSON.stringify(list));

  if (currentUserId) {
    searchHistoryRepository.remove(currentUserId, trimmed);
  }
}

const EXPORT_KEYS = ['watched:', 'progress:', 'watchlater', 'epwl:', 'search_history', 'watched_index', 'progress_index', 'notifications'];

// A backup is small by construction. Capping the entry count keeps a hostile
// or corrupt file from freezing the tab during Object.entries/JSON work.
const MAX_IMPORT_ENTRIES = 20000;

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

// Union a backed-up watch-later list into the current one. Returns the
// number of entries actually added.
function mergeWatchLaterList(raw: string): number {
  let incoming: unknown;
  try {
    incoming = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(incoming)) return 0;
  const merged = [...getWatchLater()];
  let added = 0;
  for (const item of incoming as WatchLaterItem[]) {
    if (merged.length >= WATCH_LATER_MAX) break;
    if (!item || item.type == null || item.id == null) continue;
    if (merged.some((m) => m.type === item.type && String(m.id) === String(item.id))) continue;
    merged.push({ ...item, addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now() });
    added++;
  }
  if (added === 0) return 0;
  try {
    localStorage.setItem(WL_KEY, JSON.stringify(merged));
  } catch (err) {
    logError('storage.importData', err);
    return 0;
  }
  return added;
}

// Union backed-up search history into the current one (most recent first,
// capped). Returns the number of queries actually added.
function mergeSearchHistoryList(raw: string): number {
  let incoming: unknown;
  try {
    incoming = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(incoming)) return 0;
  const merged = [...getSearchHistory()];
  let added = 0;
  for (const q of incoming as unknown[]) {
    if (added >= SEARCH_HISTORY_MAX || merged.length >= SEARCH_HISTORY_MAX) break;
    if (typeof q !== 'string' || !q.trim()) continue;
    if (merged.some((m) => m.toLowerCase() === q.toLowerCase())) continue;
    merged.push(q);
    added++;
  }
  if (added === 0) return 0;
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(merged.slice(0, SEARCH_HISTORY_MAX)));
  } catch (err) {
    logError('storage.importData', err);
    return 0;
  }
  return added;
}

export function importData(data: Record<string, unknown>, mode: 'merge' | 'replace' = 'merge'): number {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 0;
  if (Object.keys(data).length > MAX_IMPORT_ENTRIES) {
    throw new Error('Backup contains too many entries');
  }
  let imported = 0;
  if (mode === 'replace') {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isExportKey(k)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } else {
    // List-valued keys union with the existing entries so importing a partial
    // backup can't wipe the rest of the local lists.
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (!isExportKey(k)) continue;
      if (k === WL_KEY && v != null) {
        imported += mergeWatchLaterList(String(v));
      } else if (k === SEARCH_HISTORY_KEY && v != null) {
        imported += mergeSearchHistoryList(String(v));
      } else {
        rest[k] = v;
      }
    }
    data = rest;
  }
  Object.entries(data).forEach(([k, v]) => {
    if (!isExportKey(k)) return;
    try {
      // Exported null means "key absent" - remove instead of storing the
      // literal string "null".
      if (v == null) {
        localStorage.removeItem(k);
      } else {
        localStorage.setItem(k, String(v));
      }
      imported++;
    } catch (err) {
      logError('storage.importData', err);
    }
  });
  // Imported watched/progress/epwl keys must be reflected in the indices or
  // they stay invisible to LastSeen/Stats/ContinueWatching.
  rebuildIndices();
  // Imported rows are locally authoritative for this session so the sign-in
  // reconcile cannot delete them before they are uploaded.
  markIndicesAsSessionModified();
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
    // Only count keys whose value exists - a dangling index entry used to
    // inflate the stats even though nothing is stored for it.
    if (!localStorage.getItem(k)) {
      removeFromWatchedIndex(k);
      continue;
    }
    if (k.includes('movie-')) moviesWatched++;
    else if (k.match(/tv-\d+-S\d+E\d+/)) episodesWatched++;
    else if (k.match(/^watched:tv-\d+$/)) seriesWatched++;
  }
  const wl = getWatchLater();
  const epWl = getEpisodeWatchLater();
  return { moviesWatched, episodesWatched, seriesWatched, watchLaterCount: wl.length + epWl.length };
}

export async function clearAllData(): Promise<void> {
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

  // Mirror the wipe to the cloud, otherwise the next sign-in re-downloads
  // everything and the user sees their "cleared" library reappear.
  if (currentUserId) {
    await Promise.all([
      watchedRepository.clearAll(currentUserId),
      watchLaterRepository.clearAll(currentUserId),
      searchHistoryRepository.clearAll(currentUserId),
      progressRepository.clearAll(currentUserId),
    ]);
  }
}

export function getVideoSource(): string {
  return localStorage.getItem(VIDEO_SOURCE_KEY) || 'vidsrc';
}

// The preferred video source is local-only (no Supabase table).
export function setVideoSource(source: string): void {
  safeWrite(VIDEO_SOURCE_KEY, source);
}

export const TIMEZONE_KEY = 'display_timezone';
export const UPCOMING_OPEN_KEY = 'upcoming_open';

// Stored calendar timezone (IANA name), or '' for the system zone.
export function getTimezone(): string {
  return localStorage.getItem(TIMEZONE_KEY) || '';
}

// The calendar timezone is local-only (no Supabase table), like the
// video source, so it survives data wipes that clear watch state.
export function setTimezone(timeZone: string): void {
  safeWrite(TIMEZONE_KEY, timeZone);
}

export function getEffectiveTimezone(): string {
  const stored = getTimezone();
  // Corrupt/unknown zone - fall through to the system zone.
  if (isValidTimezone(stored)) return stored;
  return getSystemTimezone();
}

// Whether the Watch Later upcoming list starts expanded. Local-only UI
// preference like the video source; defaults to open.
export function getUpcomingOpen(): boolean {
  return localStorage.getItem(UPCOMING_OPEN_KEY) !== '0';
}

export function setUpcomingOpen(open: boolean): void {
  safeWrite(UPCOMING_OPEN_KEY, open ? '1' : '0');
}

export function getNotifications(): NotificationItem[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_KEY) || '[]') as NotificationItem[] || [];
  } catch {
    return [];
  }
}

// Notifications are only relevant for episodes aired within the last week, so
// anything older is dropped. Air date is the source of truth; when it's
// missing we fall back to when the notification was created.
export function pruneOldNotifications(): void {
  const list = getNotifications();
  if (list.length === 0) return;
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const kept = list.filter((n) => (n.airDate ? new Date(n.airDate).getTime() : n.createdAt) >= cutoff);
  if (kept.length !== list.length) {
    safeWrite(NOTIFICATIONS_KEY, JSON.stringify(kept));
  }
}

const NOTIFICATIONS_DISMISSED_MAX = 500;

function getDismissedNotifications(): { showId: string; season: number; episode: number }[] {
  try {
    const raw = JSON.parse(localStorage.getItem(NOTIFICATIONS_DISMISSED_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeDismissedNotifications(list: { showId: string; season: number; episode: number }[]): void {
  safeWrite(NOTIFICATIONS_DISMISSED_KEY, JSON.stringify(list.slice(0, NOTIFICATIONS_DISMISSED_MAX)));
}

function dismissNotification(showId: string | number, season: number, episode: number): void {
  const sid = String(showId);
  const list = getDismissedNotifications();
  if (list.some((d) => d.showId === sid && d.season === season && d.episode === episode)) return;
  list.unshift({ showId: sid, season, episode });
  writeDismissedNotifications(list);
}

// A dismissed episode stays dismissed until it is watched, so scans after a
// remove/clear don't immediately re-create the same notification. Entries for
// watched episodes are pruned lazily to keep the list small.
function isDismissedNotification(showId: string | number, season: number, episode: number): boolean {
  const sid = String(showId);
  const list = getDismissedNotifications();
  const dismissed = list.some((d) => d.showId === sid && d.season === season && d.episode === episode);
  if (dismissed) {
    const remaining = list.filter((d) => !isWatched('tv', d.showId, d.season, d.episode));
    if (remaining.length !== list.length) writeDismissedNotifications(remaining);
  }
  return dismissed;
}

// Episode notifications are local-only (no Supabase table) - the bell,
// scans, and dismissals never leave this browser.
export function addNotification(showId: string | number, showTitle: string, season: number, episode: number, episodeTitle: string | null, type: string, airDate: string | null): string {
  if (isDismissedNotification(showId, season, episode)) return '';
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

  return id;
}

export function removeNotification(id: string): void {
  const list = getNotifications();
  const item = list.find((n: NotificationItem) => n.id === id);
  safeWrite(NOTIFICATIONS_KEY, JSON.stringify(list.filter((n: NotificationItem) => n.id !== id)));

  if (item) dismissNotification(item.showId, item.season, item.episode);
}

export function markAllNotificationsRead(): void {
  const list = getNotifications();
  list.forEach((n: NotificationItem) => { n.read = true; });
  safeWrite(NOTIFICATIONS_KEY, JSON.stringify(list));
}

export function clearAllNotifications(): void {
  getNotifications().forEach((n: NotificationItem) => dismissNotification(n.showId, n.season, n.episode));
  localStorage.removeItem(NOTIFICATIONS_KEY);
}

export function isAlreadyNotified(showId: string | number, season: number, episode: number): boolean {
  const sid = String(showId);
  return getNotifications().some((n: NotificationItem) => n.showId === sid && n.season === season && n.episode === episode);
}
