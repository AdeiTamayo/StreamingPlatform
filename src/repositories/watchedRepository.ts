import { requireSupabase, isUniqueViolation } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { WatchedRow, WatchedInsert } from '../types/database';
import type { MediaType } from '../types';

export const watchedRepository = {
  async mark(data: WatchedInsert): Promise<WatchedRow | null> {
    try {
      const { data: result, error } = await withRetry(async () =>
        requireSupabase().from('watched').insert(data).select().single(),
      );
      if (error) throw error;
      return result;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) return null;
      enqueueWrite('watched', 'insert', data);
      return null;
    }
  },

  async markBatch(items: WatchedInsert[]): Promise<void> {
    try {
      const { error } = await withRetry(async () =>
        requireSupabase().from('watched').insert(items),
      );
      if (error) throw error;
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // Some (or all) rows already exist - fall back to per-item writes so
        // the non-conflicting rows are still inserted.
        for (const item of items) {
          await this.mark(item);
        }
        return;
      }
      for (const item of items) {
        enqueueWrite('watched', 'insert', item);
      }
    }
  },

  async unmark(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null): Promise<void> {
    try {
      const { error } = await withRetry(async () => {
        // Build a fresh query per attempt - builders are single-use thenables.
        // The conditional filters change the builder's generic, so each
        // branch awaits its own fully-typed chain instead of reassigning.
        if (mediaType === 'tv' && season != null && episode != null) {
          return requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('season', season)
            .eq('episode', episode);
        }
        if (mediaType === 'tv' && season != null) {
          return requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('season', season);
        }
        if (mediaType === 'tv' && episode != null) {
          return requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('episode', episode);
        }
        return requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', mediaType)
          .eq('tmdb_id', tmdbId);
      });
      if (error) throw error;
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType, tmdbId, season, episode });
    }
  },

  // Removes only the series-level watched row (season/episode null), never
  // the per-episode rows of the show.
  async unmarkSeries(userId: string, tmdbId: number): Promise<void> {
    try {
      const { error } = await withRetry(async () =>
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
      const { data, error } = await withRetry(async () =>
        requireSupabase().from('watched')
          .select('*')
          .eq('user_id', userId)
          .order('watched_at', { ascending: false }),
      );
      if (error) throw error;
      return data ?? [];
    } catch {
      return [];
    }
  },

  async clearShowHistory(userId: string, tmdbId: number): Promise<void> {
    try {
      const { error } = await withRetry(async () =>
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

  async clearAllMovies(userId: string): Promise<void> {
    try {
      const { error } = await withRetry(async () =>
        requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'movie'),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType: 'movie' });
    }
  },
};
