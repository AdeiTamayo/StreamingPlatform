import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { SettingsRow, SettingsInsert } from '../types/database';

export const settingsRepository = {
  async get(userId: string): Promise<SettingsRow | null> {
    try {
      const { data, error }: any = await withRetry(async () =>
requireSupabase().from('settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
      );
      if (error) throw error;
      return data as SettingsRow | null;
    } catch {
      return null;
    }
  },

  async upsert(data: SettingsInsert): Promise<void> {
    try {
      const { error }: any = await withRetry(async () =>
        requireSupabase().from('settings').upsert(data as any, { onConflict: 'user_id' }),
      );
      if (error) throw error;
    } catch {
      enqueueWrite('settings', 'upsert', data as any);
    }
  },
};

