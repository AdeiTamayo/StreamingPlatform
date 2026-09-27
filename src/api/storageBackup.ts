import { getCurrentUserId } from './storage';
import { dataMigration } from '../utils/dataMigration';
import { watchedRepository } from '../repositories/watchedRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import type { WatchedInsert, WatchLaterInsert, SearchHistoryInsert } from '../types/database';

export interface SupabaseBackupData {
  watched: WatchedInsert[];
  // Kept optional so backups exported before migrations 003/004 still import.
  progress?: unknown[];
  watchLater: WatchLaterInsert[];
  notifications?: unknown[];
  searchHistory: SearchHistoryInsert[];
}

export async function exportSupabaseData(): Promise<SupabaseBackupData | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const [watched, watchLater, searchHistory] = await Promise.all([
    watchedRepository.getAll(userId),
    watchLaterRepository.getAll(userId),
    searchHistoryRepository.getAll(userId),
  ]);

  return {
    watched: watched.map((r) => ({
      user_id: userId,
      media_type: r.media_type,
      tmdb_id: r.tmdb_id,
      title: r.title,
      season: r.season,
      episode: r.episode,
      watched_at: r.watched_at,
      meta: r.meta,
    })),
    watchLater: watchLater.map((r) => ({
      user_id: userId,
      media_type: r.media_type,
      tmdb_id: r.tmdb_id,
      title: r.title,
      year: r.year,
      poster: r.poster,
      season: r.season,
      episode: r.episode,
    })),
    searchHistory: searchHistory.map((r) => ({
      user_id: userId,
      query: r.query,
    })),
  };
}

// True when the object has no user data at all - used to reject empty or
// malformed files before any import work happens.
export function isSupabaseBackupEmpty(data: SupabaseBackupData): boolean {
  return (
    (data.watched?.length ?? 0) === 0 &&
    (data.watchLater?.length ?? 0) === 0 &&
    (data.searchHistory?.length ?? 0) === 0
  );
}

export async function importSupabaseData(data: SupabaseBackupData): Promise<boolean> {
  const userId = getCurrentUserId();
  if (!userId) return false;

  const operations: Promise<unknown>[] = [];

  if ((data.watched?.length ?? 0) > 0) {
    const batch = (data.watched ?? []).map((item) => ({ ...item, user_id: userId }));
    operations.push(watchedRepository.markBatch(batch));
  }

  if ((data.watchLater?.length ?? 0) > 0) {
    for (const item of data.watchLater ?? []) {
      operations.push(watchLaterRepository.add({ ...item, user_id: userId }));
    }
  }

  if ((data.searchHistory?.length ?? 0) > 0) {
    // search_history has no unique constraint - skip queries already on the
    // server so a repeated import doesn't duplicate every row.
    const existing = await searchHistoryRepository.getAll(userId).catch(() => []);
    const seen = new Set(existing.map((r) => r.query.toLowerCase()));
    for (const item of data.searchHistory ?? []) {
      if (seen.has(item.query.toLowerCase())) continue;
      seen.add(item.query.toLowerCase());
      operations.push(searchHistoryRepository.add({ ...item, user_id: userId }));
    }
  }

  if (operations.length === 0) return true;

  const results = await Promise.allSettled(operations);
  const ok = results.every((r) => r.status === 'fulfilled');
  if (ok) {
    // Mirror the imported rows into localStorage so the UI reflects them
    // without waiting for the next login sync.
    await dataMigration.syncFromSupabase(userId);
  }
  return ok;
}
