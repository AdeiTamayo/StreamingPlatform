import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { SearchHistoryRow, SearchHistoryInsert } from '../types/database';
import type { WriteOutcome } from './types';

const MAX_HISTORY = 15;

// The `{ error }` check must run inside the retried callback: Supabase
// resolves failures instead of rejecting, so outside it withRetry would never
// retry. Reads get one retry to bound the wait for `[]` when offline.
const READ_RETRY = { maxAttempts: 2 };

export const searchHistoryRepository = {
  async add(data: SearchHistoryInsert): Promise<WriteOutcome> {
    let queued = false;
    try {
      await withRetry(async () => {
        // Upsert on (user_id, query): the unique index rejects a second row
        // for the same query, and re-searching should move it to the top
        // (fresh created_at) rather than fail into the offline queue.
        const res = await requireSupabase().from('search_history').upsert(
          { ...data, created_at: data.created_at ?? new Date().toISOString() },
          { onConflict: 'user_id, query' },
        );
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      queued = enqueueWrite('search_history', 'insert', data);
    }
    await this.prune(data.user_id);
    return { queued };
  },

  // Removes one query (case-insensitive). LIKE wildcards in the query are
  // escaped so a search for "100%" doesn't wipe unrelated rows.
  async remove(userId: string, query: string): Promise<void> {
    try {
      const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`);
      await withRetry(async () => {
        const res = await requireSupabase().from('search_history')
          .delete()
          .eq('user_id', userId)
          .ilike('query', escaped);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('search_history', 'delete', { userId, query });
    }
  },

  async getAll(userId: string): Promise<SearchHistoryRow[]> {
    try {
      const { data } = await withRetry(async () => {
        const res = await requireSupabase().from('search_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_HISTORY);
        if (res.error) throw res.error;
        return res;
      }, READ_RETRY);
      return data ?? [];
    } catch {
      return [];
    }
  },

  async prune(userId: string): Promise<void> {
    try {
      const { data } = await withRetry(async () => {
        const res = await requireSupabase().from('search_history')
          .select('id, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        if (res.error) throw res.error;
        return res;
      }, READ_RETRY);
      if (!data) return;

      const rows = data;
      if (rows.length > MAX_HISTORY) {
        const toDelete = rows.slice(MAX_HISTORY).map((r) => r.id);
        if (toDelete.length > 0) {
          await withRetry(async () => {
            const res = await requireSupabase().from('search_history')
              .delete()
              .eq('user_id', userId)
              .in('id', toDelete);
            if (res.error) throw res.error;
            return res;
          });
        }
      }
    } catch {
      // Silently fail for pruning
    }
  },

  async clearAll(userId: string): Promise<void> {
    try {
      await withRetry(async () => {
        const res = await requireSupabase().from('search_history')
          .delete()
          .eq('user_id', userId);
        if (res.error) throw res.error;
        return res;
      });
    } catch {
      enqueueWrite('search_history', 'delete', { userId });
    }
  },
};
