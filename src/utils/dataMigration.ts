import type { MediaType } from '../types';
import type { WatchedInsert } from '../types/database';
import { watchedRepository } from '../repositories/watchedRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import { logError } from './logger';
import {
  watchedKey,
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  WATCHED_INDEX_KEY,
  SEARCH_HISTORY_MAX,
} from '../api/storage';

// Per-user flag: a global flag skips the upload for a second account on the
// same browser, silently losing that account's pre-login rows.
const MIGRATION_FLAG_PREFIX = 'supabase_data_migrated:';
const LEGACY_MIGRATION_FLAG_KEY = 'supabase_data_migrated';

function migrationFlagKey(userId: string): string {
  return `${MIGRATION_FLAG_PREFIX}${userId}`;
}

// Non-numeric ids (movie slugs) can't be stored in the integer tmdb_id
// column - they stay local-only and are skipped here so one bad row can't
// poison the batch or the offline queue.
function finiteTmdbId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

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
        const mf = k.match(/^watched:tv-(\d+)$/);
        if (mf) {
          items.push({
            user_id: '',
            media_type: 'tv',
            tmdb_id: Number(mf[1]),
            title: data.title || '',
            season: null,
            episode: null,
            watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
            meta: data.meta || null,
          });
        } else {
          const mm = k.match(/^watched:movie-(.+)$/);
          if (mm) {
            const tmdbId = finiteTmdbId(mm[1]);
            if (tmdbId == null) continue;
            items.push({
              user_id: '',
              media_type: 'movie',
              tmdb_id: tmdbId,
              title: data.title || '',
              season: null,
              episode: null,
              watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
              meta: data.meta || null,
            });
          }
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
          const tmdbId = finiteTmdbId(item.id);
          if (tmdbId == null) continue;
          items.push({
            user_id: '',
            media_type: item.type as MediaType,
            tmdb_id: tmdbId,
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
      const tmdbId = finiteTmdbId(data.showId);
      if (tmdbId == null) continue;
      items.push({
        user_id: '',
        media_type: 'tv',
        tmdb_id: tmdbId,
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

// Keys mirrored to Supabase - safe to wipe after a successful upload because
// syncFromSupabase re-downloads them straight after. Local-only state
// (progress/resume points, notifications, the offline queue, caches and logs)
// has no cloud counterpart and is preserved.
const MIGRATED_KEYS = [
  'watched:',
  WL_KEY,
  EP_WL_PREFIX,
  EP_WL_INDEX_KEY,
  SEARCH_HISTORY_KEY,
  WATCHED_INDEX_KEY,
];

function clearMigratedData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && MIGRATED_KEYS.some((prefix) => k === prefix || k.startsWith(prefix))) {
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
  const [watchedRows, wlRows, searchRows] = await Promise.all([
    watchedRepository.getAll(userId).catch(() => []),
    watchLaterRepository.getAll(userId).catch(() => []),
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

function addToEpwlIndex(key: string): void {
  const index: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(EP_WL_PREFIX)) index.push(k);
  }
  localStorage.setItem(EP_WL_INDEX_KEY, JSON.stringify([...new Set([...index, key])]));
}

// Guards against concurrent migration runs (e.g. sign-in resolving while the
// SIGNED_IN event fires too). Without this, two overlapping runs would upload
// the same local rows twice - search_history/notifications have no unique
// constraint, so the duplicates would persist in Supabase.
let inflightMigration: { userId: string; promise: Promise<void> } | null = null;

export const dataMigration = {
  migrateFromLocalStorage(userId: string): Promise<void> {
    if (inflightMigration && inflightMigration.userId === userId) {
      return inflightMigration.promise;
    }
    const promise = this.runMigration(userId).finally(() => {
      if (inflightMigration?.promise === promise) inflightMigration = null;
    });
    inflightMigration = { userId, promise };
    return promise;
  },

  async runMigration(userId: string): Promise<void> {
    const flagKey = migrationFlagKey(userId);
    if (localStorage.getItem(flagKey)) {
      await this.syncFromSupabase(userId);
      return;
    }
    // Upgrade path: migrated under the old global flag - don't re-upload
    // (search_history has no unique constraint, so re-uploading would
    // duplicate every row), just mark this user and sync down.
    if (localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY)) {
      try {
        localStorage.setItem(flagKey, 'true');
      } catch (err) {
        logError('dataMigration.flag', err);
      }
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

    // Only clear the mirrored data and mark the flag when every section
    // succeeded - otherwise the next login retries the incomplete sections.
    // Local-only state is never wiped here (see clearMigratedData).
    if (hasData && !failed) {
      clearMigratedData();
      try {
        localStorage.setItem(flagKey, 'true');
      } catch (err) {
        logError('dataMigration.flag', err);
      }
      await this.syncFromSupabase(userId);
    } else if (failed) {
      // Don't set the flag; next login will retry the failed sections.
      await this.syncFromSupabase(userId);
    } else {
      // No local data to migrate; just sync and set the flag.
      try {
        localStorage.setItem(flagKey, 'true');
      } catch (err) {
        logError('dataMigration.flag', err);
      }
      await this.syncFromSupabase(userId);
    }
  },

  async syncFromSupabase(userId: string): Promise<void> {
    try {
      await downloadSupabaseData(userId);
    } catch {
      // Silently fail - localStorage data will still be available
    }
  },
};
