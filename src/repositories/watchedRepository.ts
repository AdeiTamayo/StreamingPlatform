import { requireSupabase, isUniqueViolation } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { WatchedRow, WatchedInsert } from '../types/database';
import type { MediaType } from '../types';
import type { WriteOutcome } from './types';

// Supabase resolves query/network failures as `{ error }` instead of
// rejecting, so the check lives *inside* the retried callback - outside it,
// withRetry would never see the failure and no attempt would ever be retried.
// Reads use one retry to bound how long an offline caller waits for `[]`.
const READ_RETRY = { maxAttempts: 2 };

export const watchedRepository = {
  async mark(data: WatchedInsert): Promise<WriteOutcome & { row: WatchedRow | null }> {
    try {
      const result = await withRetry(async () => {
        const res = await requireSupabase().from('watched').insert(data).select().single();
        if (res.error) throw res.error;
        return res;
      });
      return { row: result.data, queued: false };
    } catch (err: unknown) {
      if (isUniqueViolation(err)) return { row: null, queued: false };
      return { row: null, queued: enqueueWrite('watched', 'insert', data) };
    }
  },

  async markBatch(items: WatchedInsert[]): Promise<WriteOutcome> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watched').insert(items);
        if (res.error) throw res.error;
        return res;
      });
      return { queued: false };
    } catch (err: unknown) {
      let queued = false;
      if (isUniqueViolation(err)) {
        // Some (or all) rows already exist - fall back to per-item writes so
        // the non-conflicting rows are still inserted.
        for (const item of items) {
          const result = await this.mark(item);
          queued = queued || result.queued;
        }
        return { queued };
      }
      for (const item of items) {
        queued = enqueueWrite('watched', 'insert', item) || queued;
      }
      return { queued };
    }
  },

  async unmark(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null): Promise<void> {
    try {
      await withRetry(async () => {
        // Build a fresh query per attempt - builders are single-use thenables.
        // The conditional filters change the builder's generic, so each
        // branch awaits its own fully-typed chain instead of reassigning.
        let res;
        if (mediaType === 'tv' && season != null && episode != null) {
          res = await requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('season', season)
            .eq('episode', episode);
        } else if (mediaType === 'tv' && season != null) {
          res = await requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('season', season);
        } else if (mediaType === 'tv' && episode != null) {
          res = await requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId)
            .eq('episode', episode);
        } else {
          res = await requireSupabase().from('watched')
            .delete()
            .eq('user_id', userId)
            .eq('media_type', mediaType)
            .eq('tmdb_id', tmdbId);
        }
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType, tmdbId, season, episode });
    }
  },

  // Removes only the series-level watched row (season/episode null), never
  // the per-episode rows of the show.
  async unmarkSeries(userId: string, tmdbId: number): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .is('season', null)
          .is('episode', null);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType: 'tv', tmdbId, seriesOnly: true });
    }
  },

  async getAll(userId: string): Promise<WatchedRow[]> {
    try {
      const { data } = await withRetry(async () => {
        const res = await requireSupabase().from('watched')
          .select('*')
          .eq('user_id', userId)
          .order('watched_at', { ascending: false });
        if (res.error) throw res.error;
        return res;
      }, READ_RETRY);
      return data ?? [];
    } catch {
      return [];
    }
  },

  async getAllStrict(userId: string): Promise<WatchedRow[]> {
    const { data } = await withRetry(async () => {
      const res = await requireSupabase().from('watched')
        .select('*')
        .eq('user_id', userId)
        .order('watched_at', { ascending: false });
      if (res.error) throw res.error;
      return res;
    }, READ_RETRY);
    return data ?? [];
  },

  async clearShowHistory(userId: string, tmdbId: number): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('tmdb_id', tmdbId)
          .eq('media_type', 'tv');
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType: 'tv', tmdbId });
    }
  },

  async clearAllMovies(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'movie');
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watched', 'delete', { userId, mediaType: 'movie' });
    }
  },

  async clearAll(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watched')
          .delete()
          .eq('user_id', userId);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watched', 'delete', { userId });
    }
  },
};
