import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { SearchHistoryRow, SearchHistoryInsert } from '../types/database';

const MAX_HISTORY = 15;

export const searchHistoryRepository = {
  async add(data: SearchHistoryInsert): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('search_history').insert(data as any),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('search_history', 'insert', data as any);
    }
    await this.prune(data.user_id);
  },

  async getAll(userId: string): Promise<SearchHistoryRow[]> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('search_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY),
      );
      if (error) throw error;
      return (data ?? []) as SearchHistoryRow[];
    } catch {
      return [];
    }
  },

  async prune(userId: string): Promise<void> {
    try {
      const { data, error: selectError }: any = await withRetry(async () =>
requireSupabase().from('search_history')
          .select('id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      );
      if (selectError || !data) return;

      const rows = data as { id: string; created_at: string }[];
      if (rows.length > MAX_HISTORY) {
        const toDelete = rows.slice(MAX_HISTORY).map((r) => r.id);
        if (toDelete.length > 0) {
          await withRetry(async () =>
            requireSupabase().from('search_history')
              .delete()
              .eq('user_id', userId)
              .in('id', toDelete),
          );
        }
      }
    } catch {
      // Silently fail for pruning
    }
  },
};

