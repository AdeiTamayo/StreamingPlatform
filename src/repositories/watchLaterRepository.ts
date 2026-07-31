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
      if (error) throw error;
    } catch {
      enqueueWrite('watch_later', 'insert', data as any);
    }
  },

  async remove(userId: string, mediaType: MediaType, tmdbId: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', mediaType)
          .eq('tmdb_id', tmdbId),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watch_later', 'delete', { userId, mediaType, tmdbId });
    }
  },

  async isInList(userId: string, mediaType: MediaType, tmdbId: number): Promise<boolean> {
    try {
      const { count, error }: any = await withRetry(async () =>
requireSupabase().from('watch_later')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('media_type', mediaType)
          .eq('tmdb_id', tmdbId),
      );
      if (error) throw error;
      return (count ?? 0) > 0;
    } catch {
      return false;
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

  async isEpisodeInList(userId: string, tmdbId: number, season: number, episode: number): Promise<boolean> {
    try {
      const { count, error }: any = await withRetry(async () =>
requireSupabase().from('watch_later')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', season)
          .eq('episode', episode),
      );
      if (error) throw error;
      return (count ?? 0) > 0;
    } catch {
      return false;
    }
  },
};

