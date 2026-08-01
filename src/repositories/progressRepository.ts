import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { ProgressRow, ProgressInsert } from '../types/database';

export const progressRepository = {
  async save(data: ProgressInsert): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase()
          .from('progress')
          .upsert(data as any, { onConflict: 'progress_unique_track' }),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('progress', 'upsert', data as any);
    }
  },

  async getAll(userId: string): Promise<ProgressRow[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
        requireSupabase()
          .from('progress')
          .select('*')
          .eq('user_id', userId),
      );
      if (error) throw error;
      return (data ?? []) as ProgressRow[];
    } catch {
      return [];
    }
  },

  async clear(userId: string, mediaType: 'movie' | 'tv', tmdbId: number, season?: number | null, episode?: number | null): Promise<void> {
    try {
      let query: any = requireSupabase()
        .from('progress')
        .delete()
        .eq('user_id', userId)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId);

      if (mediaType === 'tv') {
        if (season != null) query = query.eq('season', season);
        if (episode != null) query = query.eq('episode', episode);
      }

      const { error }: any = await withRetry(async () => query);
      if (error) throw error;
    } catch {
      enqueueWrite('progress', 'delete', { userId, mediaType, tmdbId, season, episode });
    }
  },

  async clearByShowId(userId: string, tmdbId: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase()
          .from('progress')
          .delete()
          .eq('user_id', userId)
          .eq('tmdb_id', tmdbId),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('progress', 'delete', { userId, mediaType: 'tv', tmdbId });
    }
  },
};
