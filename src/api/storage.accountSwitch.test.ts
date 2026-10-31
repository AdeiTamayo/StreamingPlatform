import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A recording fake of the Supabase client. Every query chain resolves
// successfully, and every call is logged so the tests can assert which user's
// writes actually went out under which session.
const net = vi.hoisted(() => {
  type Op = { m: string; args: unknown[] };
  type Call = { table: string; ops: Op[] };
  const calls: Call[] = [];
  function makeChain(table: string) {
    const rec: Call = { table, ops: [] };
    calls.push(rec);
    const chain: unknown = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: {}, error: null }).then(resolve);
        }
        return (...args: unknown[]) => {
          rec.ops.push({ m: String(prop), args });
          return chain;
        };
      },
    });
    return chain;
  }
  return { calls, makeChain };
});

vi.mock('../lib/supabase', () => ({
  supabase: {},
  requireSupabase: () => ({ from: (table: string) => net.makeChain(table) }),
  fetchAllPages: vi.fn(async () => []),
  isUniqueViolation: () => false,
}));

import {
  setCurrentUserId,
  markWatched,
  markWatching,
  isWatched,
  sessionModifiedKeys,
  DATA_OWNER_KEY,
} from './storage';
import {
  OFFLINE_QUEUE_KEY,
  clearOfflineQueue,
  disposeOfflineQueueSync,
  enqueueWrite,
  getQueueSize,
  syncOfflineQueue,
} from '../utils/offlineQueue';

function writes(table: string): Array<Record<string, unknown>> {
  return net.calls
    .filter((c) => c.table === table)
    .flatMap((c) => c.ops.filter((o) => o.m === 'insert' || o.m === 'upsert').map((o) => o.args[0] as Record<string, unknown>));
}

const queue = () => JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]') as Array<{ attempts: number; data: Record<string, unknown> }>;

describe('switching accounts on a shared browser', () => {
  beforeEach(() => {
    net.calls.length = 0;
    clearOfflineQueue();
    setCurrentUserId(null);
    net.calls.length = 0;
  });

  afterEach(() => {
    setCurrentUserId(null);
    disposeOfflineQueueSync();
  });

  it("does not replay A's pending writes under B's session, and leaves them queued untouched", async () => {
    setCurrentUserId('user-a');
    enqueueWrite('watched', 'insert', { user_id: 'user-a', media_type: 'movie', tmdb_id: 1, title: 'A film' });
    setCurrentUserId(null);

    setCurrentUserId('user-b');
    await syncOfflineQueue();

    expect(writes('watched').filter((r) => r.user_id === 'user-a')).toEqual([]);
    expect(queue()).toHaveLength(1);
    expect(queue()[0].attempts).toBe(0);
  });

  it("replays A's pending write exactly once when A signs back in, and nothing else", async () => {
    setCurrentUserId('user-a');
    enqueueWrite('watched', 'insert', { user_id: 'user-a', media_type: 'movie', tmdb_id: 1, title: 'A film' });
    setCurrentUserId(null);
    setCurrentUserId('user-b');
    await syncOfflineQueue();
    setCurrentUserId(null);

    // Signing in already starts a sync, and a second call made while one is
    // running returns immediately (it only requests another pass), so wait for
    // the queue to drain rather than for the promise.
    setCurrentUserId('user-a');
    await syncOfflineQueue();
    await vi.waitFor(() => expect(getQueueSize()).toBe(0));
    await syncOfflineQueue();

    const sent = writes('watched').filter((r) => r.title === 'A film');
    expect(sent).toHaveLength(1);
    expect(sent[0].user_id).toBe('user-a');
    expect(getQueueSize()).toBe(0);
  });

  it('does not touch the queue or the network while nobody is signed in', async () => {
    enqueueWrite('watched', 'insert', { user_id: 'user-a', tmdb_id: 1 });
    net.calls.length = 0;

    await syncOfflineQueue();

    expect(net.calls).toHaveLength(0);
    expect(getQueueSize()).toBe(1);
  });

  it("wipes A's library and session-modified marks when B signs in directly, without a sign-out in between", () => {
    setCurrentUserId('user-a');
    markWatched('movie', '1', 'A film');
    expect(sessionModifiedKeys.watched.has('watched:movie-1')).toBe(true);

    setCurrentUserId('user-b');

    expect(isWatched('movie', '1')).toBe(false);
    expect(sessionModifiedKeys.watched.size).toBe(0);
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBe('user-b');
  });

  it("tags B's writes with B's id only", async () => {
    setCurrentUserId('user-a');
    markWatched('movie', '1', 'A film');
    await vi.waitFor(() => expect(writes('watched')).toHaveLength(1));

    setCurrentUserId('user-b');
    markWatched('movie', '2', 'B film');
    await vi.waitFor(() => expect(writes('watched')).toHaveLength(2));

    const byTitle = Object.fromEntries(writes('watched').map((r) => [r.title as string, r.user_id]));
    expect(byTitle).toEqual({ 'A film': 'user-a', 'B film': 'user-b' });
  });

  it("does not suppress B's progress upload because A just uploaded the same title", async () => {
    const meta = { title: 'Show', poster: 'p.jpg' };
    setCurrentUserId('user-a');
    markWatching('tv', '10', 1, 1, meta);
    await vi.waitFor(() => expect(writes('progress')).toHaveLength(1));

    setCurrentUserId(null);
    setCurrentUserId('user-b');
    markWatching('tv', '10', 1, 1, meta);

    await vi.waitFor(() => expect(writes('progress')).toHaveLength(2));
    expect(writes('progress').map((r) => r.user_id)).toEqual(['user-a', 'user-b']);
  });

  it('keeps anonymous data created before the first sign-in, and attributes it to that account', () => {
    markWatched('movie', '5', 'Offline anon');
    setCurrentUserId('user-a');
    expect(isWatched('movie', '5')).toBe(true);
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBe('user-a');
  });
});
