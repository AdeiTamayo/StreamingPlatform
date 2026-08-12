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
      if (err?.code === '23505') {
        // Some (or all) rows already exist - fall back to per-item writes so
        // the non-conflicting rows are still inserted.
        for (const item of items) {
          await this.mark(item);
        }
        return;
      }
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

  // Removes only the series-level watched row (season/episode null), never
  // the per-episode rows of the show.
  async unmarkSeries(userId: string, tmdbId: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .is('season', null)
          .is('episode', null),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType: 'tv', tmdbId, seriesOnly: true });
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
      enqueueWrite('watched', 'delete', { userId, mediaType: 'tv', tmdbId });
    }
  },
};
