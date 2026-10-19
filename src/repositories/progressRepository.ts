import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { ProgressRow, ProgressInsert } from '../types/database';
import type { MediaType } from '../types';
import type { WriteOutcome } from './types';

const READ_RETRY = { maxAttempts: 2 };

function deleteTrackQuery(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null) {
  const base = requireSupabase().from('progress')
    .delete()
    .eq('user_id', userId)
    .eq('media_type', mediaType)
    .eq('tmdb_id', tmdbId);
  const withSeason = season == null ? base.is('season', null) : base.eq('season', season);
  return episode == null ? withSeason.is('episode', null) : withSeason.eq('episode', episode);
}

export const progressRepository = {
  async save(data: ProgressInsert): Promise<WriteOutcome> {
    try {
      await withRetry(async () => {
        const del = await deleteTrackQuery(
          data.user_id,
          data.media_type,
          data.tmdb_id,
          data.season ?? null,
          data.episode ?? null,
        );
        if (del.error) throw del.error;
        const res = await requireSupabase().from('progress').insert(data);
        if (res.error) throw res.error;
        return res;
      });
      return { queued: false };
    } catch {
      return { queued: enqueueWrite('progress', 'insert', data) };
    }
  },

  async getAll(userId: string): Promise<ProgressRow[]> {
    try {
      const { data } = await withRetry(async () => {
        const res = await requireSupabase().from('progress')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        if (res.error) throw res.error;
        return res;
      }, READ_RETRY);
      return data ?? [];
    } catch {
      return [];
    }
  },

  async remove(userId: string, mediaType: MediaType, tmdbId: number, season?: number | null, episode?: number | null): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await deleteTrackQuery(userId, mediaType, tmdbId, season, episode);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('progress', 'delete', { userId, mediaType, tmdbId, season, episode });
    }
  },

  async clearAll(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('progress')
          .delete()
          .eq('user_id', userId);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('progress', 'delete', { userId });
    }
  },

  // Removes every track of a show (all seasons/episodes), unlike `remove`
  // which isolates a single season/episode pair. Used when the show is removed
  // from history so its remote rows cannot resurrect in Continue Watching.
  async clearShow(userId: string, tmdbId: number): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('progress')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('progress', 'delete', { userId, mediaType: 'tv', tmdbId, allTracks: true });
    }
  },

  async clearAllMovies(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('progress')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'movie');
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('progress', 'delete', { userId, mediaType: 'movie', allTracks: true });
    }
  },
};
