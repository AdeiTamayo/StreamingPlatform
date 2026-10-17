import { describe, expect, it, beforeEach, vi } from 'vitest';

// Success-path mock: records fluent calls so the test can assert the
// repository upserts on (user_id, query) instead of inserting blind - the
// unique index would otherwise reject repeat searches.
const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

vi.mock('../../lib/supabase', () => ({
  supabase: null,
  requireSupabase: () => ({
    from: (table: string) => ({
      upsert: (...args: unknown[]) => {
        calls.push({ table, method: 'upsert', args });
        return Promise.resolve({ error: null });
      },
      select: (...args: unknown[]) => {
        calls.push({ table, method: 'select', args });
        return {
          eq: () => ({
            // prune(): awaited for { data, error }; empty list ends pruning.
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  }),
}));

import { searchHistoryRepository } from '../searchHistoryRepository';

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
});

describe('searchHistoryRepository.add', () => {
  it('upserts on (user_id, query) with a fresh created_at', async () => {
    const outcome = await searchHistoryRepository.add({ user_id: 'user-1', query: 'fight club' });

    const upserts = calls.filter((c) => c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe('search_history');

    const [payload, options] = upserts[0].args as [Record<string, unknown>, Record<string, unknown>];
    expect(options.onConflict).toBe('user_id, query');
    expect(payload.user_id).toBe('user-1');
    expect(payload.query).toBe('fight club');
    expect(new Date(String(payload.created_at)).toISOString()).toBe(payload.created_at);

    // Reached the server - nothing parked in the offline queue.
    expect(outcome.queued).toBe(false);
  });

  it('preserves an explicit created_at (backup restore keeps history order)', async () => {
    await searchHistoryRepository.add({
      user_id: 'user-1',
      query: 'se7en',
      created_at: '2024-01-02T03:04:05.000Z',
    });

    const upserts = calls.filter((c) => c.method === 'upsert');
    expect(upserts).toHaveLength(1);
    const [payload] = upserts[0].args as [Record<string, unknown>];
    expect(payload.created_at).toBe('2024-01-02T03:04:05.000Z');
  });
});
