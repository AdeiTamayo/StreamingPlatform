import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { SearchHistoryRow, SearchHistoryInsert } from '../types/database';

const MAX_HISTORY = 15;

export const searchHistoryRepository = {
  async add(data: SearchHistoryInsert): Promise<void> {
    try {
      const { error } = await withRetry(async () =>
        requireSupabase().from('search_history').insert(data),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('search_history', 'insert', data);
    }
    await this.prune(data.user_id);
  },

  // Removes one query (case-insensitive). LIKE wildcards in the query are
  // escaped so a search for "100%" doesn't wipe unrelated rows.
  async remove(userId: string, query: string): Promise<void> {
    try {
      const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
      const { error } = await withRetry(async () =>
        requireSupabase().from('search_history')
          .delete()
          .eq('user_id', userId)
          .ilike('query', escaped),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('search_history', 'delete', { userId, query });
    }
  },

  async getAll(userId: string): Promise<SearchHistoryRow[]> {
    try {
      const { data, error } = await withRetry(async () =>
        requireSupabase().from('search_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY),
      );
      if (error) throw error;
      return data ?? [];
    } catch {
      return [];
    }
  },

  async prune(userId: string): Promise<void> {
    try {
      const { data, error: selectError } = await withRetry(async () =>
        requireSupabase().from('search_history')
          .select('id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
      );
      if (selectError || !data) return;

      const rows = data;
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

