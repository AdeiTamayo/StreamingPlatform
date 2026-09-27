import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { WatchLaterRow, WatchLaterInsert } from '../types/database';
import type { MediaType } from '../types';

export const watchLaterRepository = {
  async add(data: WatchLaterInsert): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('watch_later').insert(data as any),
      );
      // 23505 = duplicate track (unique index on user/media/tmdb/season/episode).
      // Local state already holds the entry, so duplicates are safe to ignore.
      if (error && (error as { code?: string })?.code !== '23505') throw error;
    } catch {
      enqueueWrite('watch_later', 'insert', data as any);
    }
  },

  // Series/movie-level remove. Must only delete the series-level row
  // (season/episode null) - never the per-episode rows of the same show.
  async remove(userId: string, mediaType: MediaType, tmdbId: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', mediaType)
          .eq('tmdb_id', tmdbId)
          .is('season', null)
          .is('episode', null),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watch_later', 'delete', { userId, mediaType, tmdbId, seriesOnly: true });
    }
  },

  async getAll(userId: string): Promise<WatchLaterRow[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
        requireSupabase().from('watch_later')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      );
      if (error) throw error;
      return (data ?? []) as WatchLaterRow[];
    } catch {
      return [];
    }
  },

  async removeEpisode(userId: string, tmdbId: number, season: number, episode: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', season)
          .eq('episode', episode),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watch_later', 'delete', { userId, mediaType: 'tv', tmdbId, season, episode });
    }
  },
};
