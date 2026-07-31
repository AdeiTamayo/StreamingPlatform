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

  async remove(userId: string, id: string): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
requireSupabase().from('notifications')
          .delete()
          .eq('user_id', userId)
          .eq('id', id),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('notifications', 'delete', { userId, id });
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

  async isAlreadyNotified(userId: string, showId: number, season: number, episode: number): Promise<boolean> {
    try {
      const { count, error }: any = await withRetry(async () =>
requireSupabase().from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('tmdb_id', showId)
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

