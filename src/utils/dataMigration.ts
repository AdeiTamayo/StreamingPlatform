import type { MediaType } from '../types';
import type { WatchedInsert } from '../types/database';
import { watchedRepository } from '../repositories/watchedRepository';
import { progressRepository } from '../repositories/progressRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { notificationRepository } from '../repositories/notificationRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';

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
    const raw = localStorage.getItem('watchlater');
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
    if (!k || !k.startsWith('epwl:')) continue;
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
    const raw = localStorage.getItem('notifications');
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
    const raw = localStorage.getItem('search_history');
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
    if (k && (
      k.startsWith('watched:') ||
      k.startsWith('progress:') ||
      k === 'watchlater' ||
      k.startsWith('epwl:') ||
      k === 'search_history' ||
      k === 'notifications' ||
      k === 'watched_index' ||
      k === 'progress_index'
    )) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
}

function setLocalWatchedKey(key: string, data: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify(data));
}

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
      const key = row.media_type === 'movie'
        ? `watched:movie-${row.tmdb_id}`
        : `watched:tv-${row.tmdb_id}-S${row.season}E${row.episode}`;
      watchedIndex.push(key);
      setLocalWatchedKey(key, {
        type: row.media_type,
        id: row.tmdb_id,
        title: row.title,
        season: row.season ?? undefined,
        episode: row.episode ?? undefined,
        watchedAt: new Date(row.watched_at).getTime(),
        meta: row.meta ?? undefined,
      });
    }
    localStorage.setItem('watched_index', JSON.stringify(watchedIndex));
  }

  if (progressRows.length > 0) {
    const progressIndex: string[] = [];
    for (const row of progressRows) {
      const key = row.media_type === 'movie'
        ? `progress:movie-${row.tmdb_id}`
        : `progress:tv-${row.tmdb_id}-S${row.season}E${row.episode}`;
      progressIndex.push(key);
      localStorage.setItem(key, JSON.stringify({
        type: row.media_type,
        id: row.tmdb_id,
        currentTime: row.current_time,
        savedAt: new Date(row.updated_at).getTime(),
        season: row.season ?? undefined,
        episode: row.episode ?? undefined,
      }));
    }
    localStorage.setItem('progress_index', JSON.stringify(progressIndex));
  }

  if (wlRows.length > 0) {
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
    localStorage.setItem('watchlater', JSON.stringify(items));

    for (const row of wlRows) {
      if (row.season != null && row.episode != null) {
        const key = `epwl:${row.tmdb_id}-S${row.season}E${row.episode}`;
        localStorage.setItem(key, JSON.stringify({
          showId: row.tmdb_id,
          season: row.season,
          episode: row.episode,
          showTitle: row.title,
          addedAt: new Date(row.created_at).getTime(),
        }));
      }
    }
  }

  if (notifRows.length > 0) {
    const items = notifRows.map((r) => ({
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
    }));
    localStorage.setItem('notifications', JSON.stringify(items));
  }

  if (searchRows.length > 0) {
    const queries = searchRows.map((r) => r.query);
    localStorage.setItem('search_history', JSON.stringify(queries));
  }
}

export const dataMigration = {
  async migrateFromLocalStorage(userId: string): Promise<void> {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) {
      await this.syncFromSupabase(userId);
      return;
    }

    let hasData = false;

    const watchedItems = getLegacyWatched();
    if (watchedItems.length > 0) {
      hasData = true;
      const batch = watchedItems.map((item) => ({ ...item, user_id: userId }));
      await watchedRepository.markBatch(batch);
    }

    const progressItems = getLegacyProgress();
    if (progressItems.length > 0) {
      hasData = true;
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
    }

    const wlItems = getLegacyWatchLater();
    if (wlItems.length > 0) {
      hasData = true;
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
    }

    const notifItems = getLegacyNotifications();
    if (notifItems.length > 0) {
      hasData = true;
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
    }

    const searchItems = getLegacySearchHistory();
    if (searchItems.length > 0) {
      hasData = true;
      for (const query of searchItems) {
        await searchHistoryRepository.add({ user_id: userId, query });
      }
    }

    if (hasData) {
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

  hasMigrated(): boolean {
    return localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
  },

  resetMigrationFlag(): void {
    localStorage.removeItem(MIGRATION_FLAG_KEY);
  },
};
