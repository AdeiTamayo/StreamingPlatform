import type { MediaType } from '../types';
import type { WatchedInsert } from '../types/database';
import { watchedRepository } from '../repositories/watchedRepository';
import { progressRepository } from '../repositories/progressRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { notificationRepository } from '../repositories/notificationRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import { logError } from './logger';
import {
  watchedKey,
  progressKey,
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  NOTIFICATIONS_KEY,
  WATCHED_INDEX_KEY,
  PROGRESS_INDEX_KEY,
  NOTIFICATIONS_MAX,
  SEARCH_HISTORY_MAX,
  LOCAL_DATA_KEYS,
} from '../api/storage';

const MIGRATION_FLAG_KEY = 'supabase_data_migrated';

function getLegacyWatched(): WatchedInsert[] {
  const items: WatchedInsert[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('watched:')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}');
      const m = k.match(/^watched:tv-(\d+)-S(\d+)E(\d+)$/);
      if (m) {
        items.push({
          user_id: '',
          media_type: 'tv',
          tmdb_id: Number(m[1]),
          title: data.title || '',
          season: Number(m[2]),
          episode: Number(m[3]),
          watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
          meta: data.meta || null,
        });
      } else {
        const mm = k.match(/^watched:movie-(.+)$/);
        if (mm) {
          items.push({
            user_id: '',
            media_type: 'movie',
            tmdb_id: Number(mm[1]),
            title: data.title || '',
            season: null,
            episode: null,
            watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
            meta: data.meta || null,
          });
        }
      }
    } catch {
      // Skip corrupt entries
    }
  }
  return items;
}

function getLegacyProgress(): Array<{
  user_id: string;
  media_type: MediaType;
  tmdb_id: number;
  season: number | null;
  episode: number | null;
  current_time: number;
  meta: Record<string, unknown> | null;
}> {
  const items: Array<{
    user_id: string;
    media_type: MediaType;
    tmdb_id: number;
    season: number | null;
    episode: number | null;
    current_time: number;
    meta: Record<string, unknown> | null;
  }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('progress:')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}');
      const m = k.match(/^progress:tv-(\d+)-S(\d+)E(\d+)$/);
      if (m) {
        items.push({
          user_id: '',
          media_type: 'tv',
          tmdb_id: Number(m[1]),
          season: Number(m[2]),
          episode: Number(m[3]),
          current_time: data.currentTime || 0,
          meta: data.meta || null,
        });
      } else {
        const mm = k.match(/^progress:movie-(.+)$/);
        if (mm) {
          items.push({
            user_id: '',
            media_type: 'movie',
            tmdb_id: Number(mm[1]),
            season: null,
            episode: null,
            current_time: data.currentTime || 0,
            meta: data.meta || null,
          });
        }
      }
    } catch {
      // Skip corrupt entries
    }
  }
  return items;
}

function getLegacyWatchLater(): Array<{
  user_id: string;
  media_type: MediaType;
  tmdb_id: number;
  title: string;
  year: string | null;
  poster: string | null;
  season: number | null;
  episode: number | null;
}> {
  const items: Array<{
    user_id: string;
    media_type: MediaType;
    tmdb_id: number;
    title: string;
    year: string | null;
    poster: string | null;
    season: number | null;
    episode: number | null;
  }> = [];

  try {
    const raw = localStorage.getItem(WL_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          items.push({
            user_id: '',
            media_type: item.type as MediaType,
            tmdb_id: Number(item.id),
            title: item.title || '',
            year: item.year || null,
            poster: item.poster || null,
            season: null,
            episode: null,
          });
        }
      }
    }
  } catch {
    // Skip
  }

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(EP_WL_PREFIX)) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}');
      items.push({
        user_id: '',
        media_type: 'tv',
        tmdb_id: Number(data.showId),
        title: data.showTitle || '',
        year: null,
        poster: null,
        season: data.season || null,
        episode: data.episode || null,
      });
    } catch {
      // Skip
    }
  }

  return items;
}

function getLegacyNotifications(): Array<{
  user_id: string;
  title: string;
  message: string | null;
  media_type: 'movie' | 'tv' | null;
  tmdb_id: number | null;
  season: number | null;
  episode: number | null;
  read: boolean;
}> {
  const items: Array<{
    user_id: string;
    title: string;
    message: string | null;
    media_type: 'movie' | 'tv' | null;
    tmdb_id: number | null;
    season: number | null;
    episode: number | null;
    read: boolean;
  }> = [];

  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const n of list) {
          items.push({
            user_id: '',
            title: n.showTitle || '',
            message: n.episodeTitle || null,
            media_type: 'tv',
            tmdb_id: Number(n.showId) || null,
            season: n.season ?? null,
            episode: n.episode ?? null,
            read: n.read ?? false,
          });
        }
      }
    }
  } catch {
    // Skip
  }

  return items;
}

function getLegacySearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {
    // Skip
  }
  return [];
}

function clearLegacyData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && LOCAL_DATA_KEYS.some((prefix) => k === prefix || k.startsWith(prefix))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function setLocalWatchedKey(key: string, data: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify(data));
}

function mergeIntoIndex(indexKey: string, prefix: string, newKeys: string[]): void {
  const existing: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) existing.push(k);
  }
  localStorage.setItem(indexKey, JSON.stringify([...new Set([...existing, ...newKeys])]));
}

// Merge semantics for downloadSupabaseData: the server snapshot must never
// overwrite entries created locally while signed out. Each section writes
// only what is missing locally, then merges the indices.

async function downloadSupabaseData(userId: string): Promise<void> {
  const [watchedRows, progressRows, wlRows, notifRows, searchRows] = await Promise.all([
    watchedRepository.getAll(userId).catch(() => []),
    progressRepository.getAll(userId).catch(() => []),
    watchLaterRepository.getAll(userId).catch(() => []),
    notificationRepository.getAll(userId).catch(() => []),
    searchHistoryRepository.getAll(userId).catch(() => []),
  ]);

  if (watchedRows.length > 0) {
    const watchedIndex: string[] = [];
    for (const row of watchedRows) {
      const key = watchedKey(row.media_type, row.tmdb_id, row.season, row.episode);
      if (!localStorage.getItem(key)) {
        setLocalWatchedKey(key, {
          type: row.media_type,
          id: row.tmdb_id,
          title: row.title,
          season: row.season ?? undefined,
          episode: row.episode ?? undefined,
          watchedAt: new Date(row.watched_at).getTime(),
          meta: row.meta ?? undefined,
        });
        watchedIndex.push(key);
      }
    }
    if (watchedIndex.length > 0) mergeIntoIndex(WATCHED_INDEX_KEY, 'watched:', watchedIndex);
  }

  if (progressRows.length > 0) {
    const progressIndex: string[] = [];
    for (const row of progressRows) {
      const key = progressKey(row.media_type, row.tmdb_id, row.season, row.episode);
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify({
          type: row.media_type,
          id: row.tmdb_id,
          currentTime: row.current_time,
          savedAt: new Date(row.updated_at).getTime(),
          season: row.season ?? undefined,
          episode: row.episode ?? undefined,
          duration: row.duration ?? undefined,
        }));
        progressIndex.push(key);
      }
    }
    if (progressIndex.length > 0) mergeIntoIndex(PROGRESS_INDEX_KEY, 'progress:', progressIndex);
  }

  if (wlRows.length > 0) {
    const existingItems = getLegacyWatchLaterRaw();
    const items = wlRows
      .filter((r) => r.season == null && r.episode == null)
      .map((r) => ({
        type: r.media_type as 'movie' | 'tv',
        id: r.tmdb_id,
        title: r.title,
        year: r.year || '',
        poster: r.poster || '',
        addedAt: new Date(r.created_at).getTime(),
      }));

    const merged = [...existingItems];
    for (const item of items) {
      const exists = merged.some((m) => m.type === item.type && String(m.id) === String(item.id));
      if (!exists) merged.push(item);
    }
    localStorage.setItem(WL_KEY, JSON.stringify(merged));

    for (const row of wlRows) {
      if (row.season != null && row.episode != null) {
        const key = `${EP_WL_PREFIX}${row.tmdb_id}-S${row.season}E${row.episode}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify({
            showId: row.tmdb_id,
            season: row.season,
            episode: row.episode,
            showTitle: row.title,
            addedAt: new Date(row.created_at).getTime(),
          }));
          addToEpwlIndex(key);
        }
      }
    }
  }

  if (notifRows.length > 0) {
    const existing = getLegacyNotificationsRaw();
    const existingKeys = new Set(existing.map((n) => `${n.showId}-${n.season}-${n.episode}`));
    for (const r of notifRows) {
      const key = `${r.tmdb_id}-${r.season}-${r.episode}`;
      if (existingKeys.has(key)) continue;
      existing.push({
        id: `n-${new Date(r.created_at).getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        showId: String(r.tmdb_id ?? ''),
        showTitle: r.title,
        season: r.season ?? 0,
        episode: r.episode ?? 0,
        episodeTitle: r.message || null,
        type: 'new_episode',
        airDate: null,
        createdAt: new Date(r.created_at).getTime(),
        read: r.read,
      });
    }
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(existing.slice(0, NOTIFICATIONS_MAX)));
  }

  if (searchRows.length > 0) {
    const merged = [...getLegacySearchHistory()];
    for (const r of searchRows) {
      if (!merged.some((q) => q.toLowerCase() === r.query.toLowerCase())) {
        merged.push(r.query);
      }
    }
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(merged.slice(0, SEARCH_HISTORY_MAX)));
  }
}

function getLegacyWatchLaterRaw(): Array<{ type: MediaType; id: number | string; title: string; year: string; poster: string; addedAt: number }> {
  try {
    const raw = localStorage.getItem(WL_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

function getLegacyNotificationsRaw(): Array<{
  id: string;
  showId: string;
  showTitle: string;
  season: number;
  episode: number;
  episodeTitle: string | null;
  type: string;
  airDate: string | null;
  createdAt: number;
  read: boolean;
}> {
  try {
    const raw = localStorage.getItem(NOTIFICATIONS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch {}
  return [];
}

function addToEpwlIndex(key: string): void {
  const index: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(EP_WL_PREFIX)) index.push(k);
  }
  localStorage.setItem(EP_WL_INDEX_KEY, JSON.stringify([...new Set([...index, key])]));
}

export const dataMigration = {
  async migrateFromLocalStorage(userId: string): Promise<void> {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
      await this.syncFromSupabase(userId);
      return;
    }

    let hasData = false;
    let failed = false;

    const watchedItems = getLegacyWatched();
    if (watchedItems.length > 0) {
      hasData = true;
      try {
        const batch = watchedItems.map((item) => ({ ...item, user_id: userId }));
        await watchedRepository.markBatch(batch);
      } catch (err) {
        failed = true;
        logError('dataMigration.watched', err);
      }
    }

    const progressItems = getLegacyProgress();
    if (progressItems.length > 0) {
      hasData = true;
      try {
        for (const item of progressItems) {
          await progressRepository.save({
            user_id: userId,
            media_type: item.media_type,
            tmdb_id: item.tmdb_id,
            season: item.season,
            episode: item.episode,
            current_time: item.current_time,
            meta: item.meta as any,
          });
        }
      } catch (err) {
        failed = true;
        logError('dataMigration.progress', err);
      }
    }

    const wlItems = getLegacyWatchLater();
    if (wlItems.length > 0) {
      hasData = true;
      try {
        for (const item of wlItems) {
          await watchLaterRepository.add({
            user_id: userId,
            media_type: item.media_type,
            tmdb_id: item.tmdb_id,
            title: item.title,
            year: item.year,
            poster: item.poster,
            season: item.season,
            episode: item.episode,
          });
        }
      } catch (err) {
        failed = true;
        logError('dataMigration.watchLater', err);
      }
    }

    const notifItems = getLegacyNotifications();
    if (notifItems.length > 0) {
      hasData = true;
      try {
        for (const item of notifItems) {
          await notificationRepository.add({
            user_id: userId,
            title: item.title,
            message: item.message,
            media_type: item.media_type,
            tmdb_id: item.tmdb_id,
            season: item.season,
            episode: item.episode,
            read: item.read,
          });
        }
      } catch (err) {
        failed = true;
        logError('dataMigration.notifications', err);
      }
    }

    const searchItems = getLegacySearchHistory();
    if (searchItems.length > 0) {
      hasData = true;
      try {
        for (const query of searchItems) {
          await searchHistoryRepository.add({ user_id: userId, query });
        }
      } catch (err) {
        failed = true;
        logError('dataMigration.searchHistory', err);
      }
    }

    // Only clear local data and mark the flag when every section succeeded -
    // otherwise the next login retries the incomplete sections.
    if (hasData && !failed) {
      clearLegacyData();
    }

    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    await this.syncFromSupabase(userId);
  },

  async syncFromSupabase(userId: string): Promise<void> {
    try {
      await downloadSupabaseData(userId);
    } catch {
      // Silently fail - localStorage data will still be available
    }
  },
};
