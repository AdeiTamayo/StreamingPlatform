import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Controllable Supabase stub: every write resolves to `outcome.error`, so the
// queue's classification of server errors can be exercised deterministically.
const outcome = vi.hoisted(() => ({ error: null as null | { code?: string; message: string }, calls: 0 }));
vi.mock('../../lib/supabase', () => {
  const result = () => {
    outcome.calls += 1;
    return Promise.resolve({ error: outcome.error });
  };
  const chain: Record<string, unknown> = {};
  const builder = () => {
    const b: Record<string, unknown> = { then: (res: (v: unknown) => unknown) => result().then(res) };
    for (const m of ['eq', 'is', 'ilike', 'in']) b[m] = () => b;
    return b;
  };
  void chain;
  return {
    supabase: null,
    requireSupabase: () => ({
      from: () => ({
        insert: () => result(),
        upsert: () => result(),
        update: () => builder(),
        delete: () => builder(),
      }),
    }),
  };
});

import {
  SYNC_DROPPED_EVENT,
  SYNC_DROPPED_KEY,
  clearOfflineQueue,
  enqueueWrite,
  getDroppedCount,
  getQueueSize,
  setSyncUserId,
  syncOfflineQueue,
} from '../offlineQueue';

function queued() {
  return JSON.parse(localStorage.getItem('supabase_offline_queue') || '[]') as Array<{ attempts: number }>;
}

describe('offlineQueue error classification', () => {
  beforeEach(() => {
    clearOfflineQueue();
    localStorage.removeItem(SYNC_DROPPED_KEY);
    outcome.error = null;
    outcome.calls = 0;
    setSyncUserId('u');
  });
  afterEach(() => setSyncUserId(null));

  it('removes a synced op and records nothing', async () => {
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 1 });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(getDroppedCount()).toBe(0);
  });

  // Regression: a unique violation means the row already exists. It used to
  // burn all five attempts (blocking reconcile meanwhile) and then be dropped.
  it('treats "already exists" (23505) as success on the first attempt', async () => {
    outcome.error = { code: '23505', message: 'duplicate key' };
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 1 });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(outcome.calls).toBe(1);
    expect(getDroppedCount()).toBe(0);
  });

  it('does not treat a unique violation on a delete as anything special', async () => {
    outcome.error = { code: '23505', message: 'duplicate key' };
    enqueueWrite('watched', 'delete', { userId: 'u', tmdbId: 1 });
    await syncOfflineQueue();
    // A delete cannot violate uniqueness; if the server says so it is a real
    // error, not "already done". It is permanent, so it is dropped and recorded.
    expect(getQueueSize()).toBe(0);
    expect(getDroppedCount()).toBe(1);
  });

  it('drops a permanently rejected write immediately and records it', async () => {
    outcome.error = { code: '42501', message: 'row-level security violation' };
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 1 });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(outcome.calls).toBe(1);
    expect(getDroppedCount()).toBe(1);
  });

  it('keeps retrying transient failures and only drops after the attempt limit', async () => {
    outcome.error = { code: '08006', message: 'connection failure' };
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 1 });
    for (let i = 1; i <= 5; i++) {
      await syncOfflineQueue();
      expect(queued()).toHaveLength(1);
      expect(queued()[0].attempts).toBe(i);
      expect(getDroppedCount()).toBe(0);
    }
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(getDroppedCount()).toBe(1);
  });

  it('drops a malformed update/delete (no identifiers) immediately', async () => {
    enqueueWrite('watched', 'delete', {});
    enqueueWrite('watched', 'update', {});
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(outcome.calls).toBe(0);
    expect(getDroppedCount()).toBe(2);
  });

  it('announces drops once per pass, not once per op', async () => {
    outcome.error = { code: '42501', message: 'rls' };
    const listener = vi.fn();
    window.addEventListener(SYNC_DROPPED_EVENT, listener);
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 1 });
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 2 });
    enqueueWrite('watched', 'insert', { user_id: 'u', tmdb_id: 3 });
    await syncOfflineQueue();
    window.removeEventListener(SYNC_DROPPED_EVENT, listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.count).toBe(3);
    expect(getDroppedCount()).toBe(3);
  });

  it('does not touch another user\'s ops or record anything for them', async () => {
    outcome.error = { code: '42501', message: 'rls' };
    enqueueWrite('watched', 'insert', { user_id: 'someone-else', tmdb_id: 1 });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(1);
    expect(outcome.calls).toBe(0);
    expect(getDroppedCount()).toBe(0);
  });
});
