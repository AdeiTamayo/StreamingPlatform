import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { WatchedRow, WatchedInsert } from '../types/database';
import type { MediaType } from '../types';

export const watchedRepository = {
  async mark(data: WatchedInsert): Promise<WatchedRow | null> {
    try {
      const { data: result, error }: any = await withRetry(async () =>
        requireSupabase().from('watched').insert(data as any).select().single(),
      );
      if (error) throw error;
      return result as WatchedRow | null;
    } catch (err: any) {
      if (err?.code === '23505') return null;
      enqueueWrite('watched', 'insert', data as any);
      return null;
    }
  },

  async markBatch(items: WatchedInsert[]): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('watched').insert(items as any),
      );
      if (error) throw error;
    } catch (err: any) {
      if (err?.code === '23505') return;
      for (const item of items) {
        enqueueWrite('watched', 'insert', item as any);
      }
    }
  },

  async unmark(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null): Promise<void> {
    try {
      let query: any = requireSupabase().from('watched')
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
      enqueueWrite('watched', 'delete', { userId, mediaType, tmdbId, season, episode });
    }
  },

  async getEpisodeSet(userId: string, tmdbId: number, season: number, episodeCount?: number): Promise<Set<number>> {
    const set = new Set<number>();
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .select('episode')
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', season),
      );
      if (error) throw error;
      for (const row of (data ?? []) as { episode: number | null }[]) {
        if (row.episode != null && (!episodeCount || row.episode <= episodeCount)) {
          set.add(row.episode);
        }
      }
    } catch {
      // Return empty set on error
    }
    return set;
  },

  async isWatched(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null): Promise<boolean> {
    try {
      let query: any = requireSupabase().from('watched')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('media_type', mediaType)
        .eq('tmdb_id', tmdbId);

      if (mediaType === 'tv') {
        if (season != null) query = query.eq('season', season);
        if (episode != null) query = query.eq('episode', episode);
      }

      const { count, error }: any = await withRetry(async () => query);
      if (error) throw error;
      return (count ?? 0) > 0;
    } catch {
      return false;
    }
  },

  async getWatchedCount(userId: string, tmdbId: number, seasonNumber: number, episodeCount: number): Promise<number> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .select('episode')
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', seasonNumber),
      );
      if (error) throw error;
      return ((data ?? []) as { episode: number | null }[]).filter((r) => r.episode != null && r.episode <= episodeCount).length;
    } catch {
      return 0;
    }
  },

  async getAll(userId: string): Promise<WatchedRow[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .select('*')
          .eq('user_id', userId)
          .order('watched_at', { ascending: false }),
      );
      if (error) throw error;
      return (data ?? []) as WatchedRow[];
    } catch {
      return [];
    }
  },

  async getLastEpisode(userId: string, tmdbId: number): Promise<WatchedRow | null> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .select('*')
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .not('season', 'is', null)
          .order('watched_at', { ascending: false })
          .limit(1),
      );
      if (error) throw error;
      return (data ?? [])[0] as WatchedRow | null;
    } catch {
      return null;
    }
  },

  async clearShowHistory(userId: string, tmdbId: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('tmdb_id', tmdbId)
          .eq('media_type', 'tv'),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watched', 'delete', { userId, tmdbId });
    }
  },

  async getShowIds(userId: string): Promise<number[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('watched')
          .select('tmdb_id')
          .eq('user_id', userId)
          .eq('media_type', 'tv'),
      );
      if (error) throw error;
      return [...new Set(((data ?? []) as { tmdb_id: number }[]).map((r) => r.tmdb_id))];
    } catch {
      return [];
    }
  },
};

