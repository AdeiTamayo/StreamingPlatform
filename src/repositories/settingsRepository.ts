import { requireSupabase } from '../lib/supabase';
import { withRetry } from '../utils/retry';
import { enqueueWrite } from '../utils/offlineQueue';
import type { SettingsInsert } from '../types/database';

export const settingsRepository = {
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
