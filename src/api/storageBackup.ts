import { getCurrentUserId } from './storage';
import { dataMigration } from '../utils/dataMigration';
import { watchedRepository } from '../repositories/watchedRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import { progressRepository } from '../repositories/progressRepository';
import type { WatchedInsert, WatchLaterInsert, SearchHistoryInsert, ProgressInsert } from '../types/database';

export interface SupabaseBackupData {
  watched: WatchedInsert[];
  // Kept optional so backups exported before migrations 003/004 still import.
  progress?: ProgressInsert[];
  watchLater: WatchLaterInsert[];
  notifications?: unknown[];
  searchHistory: SearchHistoryInsert[];
}

// Mirrors the per-user row caps enforced by migration 004. Rejecting an
// oversized file up front avoids thousands of doomed requests.
const BACKUP_ROW_LIMITS: Record<'watched' | 'progress' | 'watchLater' | 'searchHistory', number> = {
  watched: 10000,
  progress: 5000,
  watchLater: 5000,
  searchHistory: 100,
};

function backupArray(data: unknown, field: keyof SupabaseBackupData): unknown[] | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as Record<string, unknown>)[field];
  if (value == null) return [];
  return Array.isArray(value) ? value : null;
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isSupabaseBackupWithinLimits(data: unknown): boolean {
  for (const [field, limit] of Object.entries(BACKUP_ROW_LIMITS) as Array<
    [keyof typeof BACKUP_ROW_LIMITS, number]
  >) {
    const rows = backupArray(data, field);
    if (!rows || rows.length > limit) return false;
    if (!rows.every(isPlainObject)) return false;

    if (field === 'watched') {
      const invalidMeta = rows.some((row) => {
        const meta = (row as Record<string, unknown>).meta;
        if (meta == null) return false;
        try {
          return JSON.stringify(meta).length > 16384;
        } catch {
          return true;
        }
      });
      if (invalidMeta) return false;
    }
  }
  return true;
}

export async function exportSupabaseData(): Promise<SupabaseBackupData | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const [watched, watchLater, searchHistory, progress] = await Promise.all([
    watchedRepository.getAll(userId),
    watchLaterRepository.getAll(userId),
    searchHistoryRepository.getAll(userId),
    progressRepository.getAll(userId),
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
    progress: progress.map((r) => ({
      user_id: userId,
      media_type: r.media_type,
      tmdb_id: r.tmdb_id,
      title: r.title,
      poster: r.poster,
      season: r.season,
      episode: r.episode,
    })),
  };
}

// True when the object has no user data at all - used to reject empty or
// malformed files before any import work happens.
export function isSupabaseBackupEmpty(data: unknown): boolean {
  if (!data || typeof data !== 'object') return true;
  return (
    (backupArray(data, 'watched')?.length ?? 0) === 0 &&
    (backupArray(data, 'progress')?.length ?? 0) === 0 &&
    (backupArray(data, 'watchLater')?.length ?? 0) === 0 &&
    (backupArray(data, 'searchHistory')?.length ?? 0) === 0
  );
}

export async function importSupabaseData(data: SupabaseBackupData): Promise<boolean> {
  const userId = getCurrentUserId();
  if (!userId || !isSupabaseBackupWithinLimits(data)) return false;

  const operations: Promise<unknown>[] = [];

  if ((data.watched?.length ?? 0) > 0) {
    const batch = (data.watched ?? []).map((item) => ({ ...item, user_id: userId }));
    operations.push(watchedRepository.markBatch(batch));
  }

  if ((data.progress?.length ?? 0) > 0) {
    for (const item of data.progress ?? []) {
      operations.push(progressRepository.save({ ...item, user_id: userId }));
    }
  }

  if ((data.watchLater?.length ?? 0) > 0) {
    for (const item of data.watchLater ?? []) {
      operations.push(watchLaterRepository.add({ ...item, user_id: userId }));
    }
  }

  if ((data.searchHistory?.length ?? 0) > 0) {
    // Skip queries already on the server so a repeated import doesn't bump
    // their created_at (a unique index now blocks duplicates anyway).
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
