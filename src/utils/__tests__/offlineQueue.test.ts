import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearOfflineQueue,
  enqueueWrite,
  getQueueSize,
  OFFLINE_QUEUE_KEY,
  syncOfflineQueue,
} from '../offlineQueue';

describe('offlineQueue', () => {
  beforeEach(() => {
    clearOfflineQueue();
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
