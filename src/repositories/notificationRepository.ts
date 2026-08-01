import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { NotificationRow, NotificationInsert } from '../types/database';

export const notificationRepository = {
  async add(data: NotificationInsert): Promise<NotificationRow | null> {
    try {
      const { data: result, error }: any = await withRetry(async () =>
        requireSupabase().from('notifications').insert(data as any).select().single(),
      );
      if (error) throw error;
      return result as NotificationRow | null;
    } catch {
      enqueueWrite('notifications', 'insert', data as any);
      return null;
    }
  },

  async getAll(userId: string): Promise<NotificationRow[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
        requireSupabase().from('notifications')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      );
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    } catch {
      return [];
    }
  },

  // Local notification ids (n-<ts>-<rand>) never match server UUIDs, so remote
  // deletion matches the same (user_id, tmdb_id, season, episode) track the
  // insert used instead of an id.
  async remove(userId: string, tmdbId: number, season: number, episode: number): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('notifications')
          .delete()
          .eq('user_id', userId)
          .eq('media_type', 'tv')
          .eq('tmdb_id', tmdbId)
          .eq('season', season)
          .eq('episode', episode),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('notifications', 'delete', { userId, mediaType: 'tv', tmdbId, season, episode });
    }
  },

  async markAllRead(userId: string): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        (requireSupabase().from('notifications') as any)
          .update({ read: true })
          .eq('user_id', userId)
          .eq('read', false),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('notifications', 'update', { userId, read: true });
    }
  },

  async clearAll(userId: string): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('notifications')
          .delete()
          .eq('user_id', userId),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('notifications', 'delete', { userId });
    }
  },
};
