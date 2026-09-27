import { describe, expect, it, beforeEach, vi } from 'vitest';

// Failure path only: a throwing client must end in a queued op, never a
// rejection out of the repository.
vi.mock('../../lib/supabase', () => ({
  supabase: null,
  requireSupabase: () => {
    throw new Error('Supabase is not configured (test mock)');
  },
}));

import { OFFLINE_QUEUE_KEY } from '../../utils/offlineQueue';
import { searchHistoryRepository } from '../searchHistoryRepository';

function queuedOps(): Array<{ table: string; method: string; data: Record<string, unknown> }> {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

beforeEach(() => {
  localStorage.clear();
});

describe('searchHistoryRepository', () => {
  // withRetry sleeps ~3s across attempts before the op is queued.
  it('queues the remove op when offline', async () => {
    await searchHistoryRepository.remove('user-1', 'Hello %');
    const ops = queuedOps();
    expect(ops).toHaveLength(1);
    expect(ops[0].table).toBe('search_history');
    expect(ops[0].method).toBe('delete');
    expect(ops[0].data).toMatchObject({ userId: 'user-1', query: 'Hello %' });
  }, 15000);
});
