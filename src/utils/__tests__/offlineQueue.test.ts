import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Hermetic: repository syncs must never touch the network in unit tests
// (.env credentials are loaded by Vite). A throwing client exercises the
// failure/attempt paths deterministically.
// The path is relative to this file (src/utils/__tests__). It used to read
// '../lib/supabase', which matched nothing, so the real client was used and the
// "transient failure" below was really the permanent "not configured" error.
vi.mock('../../lib/supabase', () => ({
  supabase: null,
  requireSupabase: () => {
    throw new Error('Network request failed (test mock)');
  },
}));

import {
  clearOfflineQueue,
  disposeOfflineQueueSync,
  enqueueWrite,
  getQueueSize,
  initOfflineQueueSync,
  OFFLINE_QUEUE_KEY,
  SYNC_DROPPED_KEY,
  getDroppedCount,
  setSyncUserId,
  syncOfflineQueue,
} from '../offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    clearOfflineQueue();
    localStorage.removeItem(SYNC_DROPPED_KEY);
  });

  afterEach(() => {
    setSyncUserId(null);
  });

  it('enqueues writes and reports size', () => {
    enqueueWrite('watched', 'insert', { tmdb_id: 1 });
    enqueueWrite('watch_later', 'upsert', { tmdb_id: 2 });
    expect(getQueueSize()).toBe(2);
  });

  it('caps the queue at 1000 entries, dropping the oldest and recording the loss', () => {
    for (let i = 0; i < 1005; i++) {
      enqueueWrite('watched', 'insert', { tmdb_id: i });
    }
    expect(getQueueSize()).toBe(1000);
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(queue[0].data.tmdb_id).toBe(5);
    // Overflow must never be silent: the marker drives the warning and stops
    // reconcile from deleting local rows that never uploaded.
    expect(getDroppedCount()).toBe(5);
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
    setSyncUserId('u');
    enqueueWrite('progress', 'upsert', { user_id: 'u', tmdb_id: 1 });
    enqueueWrite('settings', 'upsert', { user_id: 'u' });
    enqueueWrite('notifications', 'insert', { user_id: 'u' });
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
  });

  it('leaves every op queued without burning attempts while signed out', async () => {
    enqueueWrite('watched', 'insert', { user_id: 'user-a', tmdb_id: 1 });
    // Shaped like the real delete ops the repositories enqueue (userId/tmdbId).
    enqueueWrite('watch_later', 'delete', { userId: 'user-a', tmdbId: 2 });
    // syncUserId is null here (afterEach / signed-out state).
    await syncOfflineQueue();
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(queue).toHaveLength(2);
    expect(queue.every((op: { attempts: number }) => op.attempts === 0)).toBe(true);
    // The owner signs back in - ops are replayed and, being offline, count attempts.
    setSyncUserId('user-a');
    await syncOfflineQueue();
    const retry = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    expect(retry).toHaveLength(2);
    expect(retry.every((op: { attempts: number }) => op.attempts === 1)).toBe(true);
  });

  it('keeps failing operations up to MAX_OP_ATTEMPTS, then drops them', async () => {
    setSyncUserId('u');
    enqueueWrite('watched', 'insert', { tmdb_id: 1 });
    for (let i = 1; i <= 5; i++) {
      await syncOfflineQueue();
      const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
      expect(queue).toHaveLength(1);
      expect(queue[0].attempts).toBe(i);
    }
    await syncOfflineQueue();
    expect(getQueueSize()).toBe(0);
    // The op never reached the server: that has to be recorded.
    expect(getDroppedCount()).toBe(1);
  });

  describe('background sync lifecycle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      disposeOfflineQueueSync();
      vi.useRealTimers();
    });

    it('starts a retry timer and an online listener exactly once', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      initOfflineQueueSync();
      initOfflineQueueSync();
      const onlineCalls = addSpy.mock.calls.filter(([type]) => type === 'online');
      expect(onlineCalls).toHaveLength(1);
      addSpy.mockRestore();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    // The timer used to live for the lifetime of the tab with no way to stop
    // it, which leaked a timer in every test that initialised sync.
    it('stops the timer and detaches the listener on dispose', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      initOfflineQueueSync();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
      disposeOfflineQueueSync();
      expect(vi.getTimerCount()).toBe(0);
      const onlineCalls = removeSpy.mock.calls.filter(([type]) => type === 'online');
      expect(onlineCalls).toHaveLength(1);
      removeSpy.mockRestore();
    });

    it('can be re-initialised after disposal', () => {
      initOfflineQueueSync();
      disposeOfflineQueueSync();
      initOfflineQueueSync();
      expect(vi.getTimerCount()).toBeGreaterThan(0);
    });

    it('is safe to dispose when never initialised', () => {
      expect(() => disposeOfflineQueueSync()).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
