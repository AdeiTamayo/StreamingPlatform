import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Hermetic: repository syncs must never touch the network in unit tests
// (.env credentials are loaded by Vite). A throwing client exercises the
// failure/attempt paths deterministically.
vi.mock('../lib/supabase', () => ({
  supabase: null,
  requireSupabase: () => {
    throw new Error('Supabase is not configured (test mock)');
  },
}));

import {
  clearOfflineQueue,
  enqueueWrite,
  getQueueSize,
  OFFLINE_QUEUE_KEY,
  setSyncUserId,
  syncOfflineQueue,
} from '../offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    clearOfflineQueue();
  });

  afterEach(() => {
    setSyncUserId(null);
  });

  it('enqueues writes and reports size', () => {
    enqueueWrite('watched', 'insert', { tmdb_id: 1 });
    enqueueWrite('watch_later', 'upsert', { tmdb_id: 2 });
    expect(getQueueSize()).toBe(2);
  });

  it('caps the queue at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) {
      enqueueWrite('watched', 'insert', { tmdb_id: i });
    }
    expect(getQueueSize()).toBe(200);
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(queue[0].data.tmdb_id).toBe(5);
  });

  it('clearOfflineQueue empties the queue', () => {
    enqueueWrite('watched', 'insert', { tmdb_id: 1 });
    clearOfflineQueue();
    expect(getQueueSize()).toBe(0);
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
  });

  it('leaves another user\'s ops queued without burning attempts', async () => {
    setSyncUserId('user-b');
    enqueueWrite('watched', 'insert', { user_id: 'user-a', tmdb_id: 1 });
    await syncOfflineQueue();
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(0);
    // Their owner syncs later - the op is attempted, fails offline, attempts 1.
    setSyncUserId('user-a');
    await syncOfflineQueue();
    const retry = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(retry).toHaveLength(1);
    expect(retry[0].attempts).toBe(1);
  });

  it('drains ops for dropped local-only tables immediately', async () => {
    enqueueWrite('progress', 'upsert', { user_id: 'u', tmdb_id: 1 });
    enqueueWrite('settings', 'upsert', { user_id: 'u' });
    enqueueWrite('notifications', 'insert', { user_id: 'u' });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
  });

  it('keeps failing operations up to MAX_OP_ATTEMPTS, then drops them', async () => {
    enqueueWrite('watched', 'insert', { tmdb_id: 1 });
    for (let i = 1; i <= 5; i++) {
      await syncOfflineQueue();
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].attempts).toBe(i);
    }
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
  });
});
