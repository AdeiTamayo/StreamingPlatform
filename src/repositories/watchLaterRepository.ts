import { requireSupabase, isUniqueViolation, fetchAllPages } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { WatchLaterRow, WatchLaterInsert } from '../types/database';
import type { MediaType } from '../types';
import type { WriteOutcome } from './types';

// The `{ error }` check must run inside the retried callback: Supabase
// resolves failures instead of rejecting, so outside it withRetry would never
// retry. Reads get one retry to bound the wait for `[]` when offline.
const READ_RETRY = { maxAttempts: 2 };

export const watchLaterRepository = {
  async add(data: WatchLaterInsert): Promise<WriteOutcome> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watch_later').insert(data);
        if (res.error) throw res.error;
        return res;
      });
      return { queued: false };
    } catch (err: unknown) {
      // 23505 = duplicate track (unique index on user/media/tmdb/season/episode).
      // Local state already holds the entry, so duplicates are safe to ignore.
      if (isUniqueViolation(err)) return { queued: false };
      return { queued: enqueueWrite('watch_later', 'insert', data) };
    }
  },

  // Series/movie-level remove. Must only delete the series-level row
  // (season/episode null) - never the per-episode rows of the same show.
  async remove(userId: string, mediaType: MediaType, tmdbId: number): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', mediaType)
          .eq('tmdb_id', tmdbId)
          .is('season', null)
          .is('episode', null);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watch_later', 'delete', { userId, mediaType, tmdbId, seriesOnly: true });
    }
  },

  // Complete, paginated download. Throws on failure so callers never mistake a
  // partial result for the whole library.
  async getAllStrict(userId: string): Promise<WatchLaterRow[]> {
    return fetchAllPages<WatchLaterRow>((from, to) =>
      withRetry(async () => {
        const res = await requireSupabase().from('watch_later')
          .select('*', { count: 'exact' })
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to);
        if (res.error) throw res.error;
        return res;
      }, READ_RETRY),
    );
  },

  // Best-effort variant for UI code that can show an empty list on failure.
  async getAll(userId: string): Promise<WatchLaterRow[]> {
    try {
      return await this.getAllStrict(userId);
    } catch {
      return [];
    }
  },

  async removeEpisode(userId: string, tmdbId: number, season: number, episode: number): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', season)
          .eq('episode', episode);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watch_later', 'delete', { userId, mediaType: 'tv', tmdbId, season, episode });
    }
  },

  async clearAll(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('watch_later')
          .delete()
          .eq('user_id', userId);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('watch_later', 'delete', { userId });
    }
  },
};
