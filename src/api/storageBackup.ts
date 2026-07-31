import { getCurrentUserId } from './storage';
import { watchedRepository } from '../repositories/watchedRepository';
import { progressRepository } from '../repositories/progressRepository';
import { watchLaterRepository } from '../repositories/watchLaterRepository';
import { notificationRepository } from '../repositories/notificationRepository';
import { searchHistoryRepository } from '../repositories/searchHistoryRepository';
import type { WatchedInsert, ProgressInsert, WatchLaterInsert, NotificationInsert, SearchHistoryInsert } from '../types/database';

export interface SupabaseBackupData {
  watched: WatchedInsert[];
  progress: ProgressInsert[];
  watchLater: WatchLaterInsert[];
  notifications: NotificationInsert[];
  searchHistory: SearchHistoryInsert[];
}

export async function exportSupabaseData(): Promise<SupabaseBackupData | null> {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const [watched, progress, watchLater, notifications, searchHistory] = await Promise.all([
    watchedRepository.getAll(userId),
    progressRepository.getAll(userId),
    watchLaterRepository.getAll(userId),
    notificationRepository.getAll(userId),
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
    progress: progress.map((r) => ({
      user_id: userId,
      media_type: r.media_type,
      tmdb_id: r.tmdb_id,
      season: r.season,
      episode: r.episode,
      current_time: r.current_time,
      duration: r.duration,
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
    notifications: notifications.map((r) => ({
      user_id: userId,
      title: r.title,
      message: r.message,
      media_type: r.media_type,
      tmdb_id: r.tmdb_id,
      season: r.season,
      episode: r.episode,
      read: r.read,
    })),
    searchHistory: searchHistory.map((r) => ({
      user_id: userId,
      query: r.query,
    })),
  };
}

export async function importSupabaseData(data: SupabaseBackupData): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;

  const operations: Promise<unknown>[] = [];

  if (data.watched.length > 0) {
    const batch = data.watched.map((item) => ({ ...item, user_id: userId }));
    operations.push(watchedRepository.markBatch(batch));
  }

  if (data.progress.length > 0) {
    for (const item of data.progress) {
      operations.push(progressRepository.save({ ...item, user_id: userId }));
    }
  }

  if (data.watchLater.length > 0) {
    for (const item of data.watchLater) {
      operations.push(watchLaterRepository.add({ ...item, user_id: userId }));
    }
  }

  if (data.notifications.length > 0) {
    for (const item of data.notifications) {
      operations.push(notificationRepository.add({ ...item, user_id: userId }));
    }
  }

  if (data.searchHistory.length > 0) {
    for (const item of data.searchHistory) {
      operations.push(searchHistoryRepository.add({ ...item, user_id: userId }));
    }
  }

  await Promise.allSettled(operations);
}
