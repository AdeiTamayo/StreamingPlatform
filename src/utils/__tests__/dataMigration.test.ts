import { describe, expect, it, beforeEach, vi } from 'vitest';

// Hermetic: never touch the network in unit tests (.env credentials are
// loaded by Vite). Repositories resolve empty so flag/merge logic is tested.
const repoState = vi.hoisted(() => ({
  queued: false,
  failDownload: false,
  watched: [] as Array<Record<string, unknown>>,
  watchLater: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../repositories/watchedRepository', () => ({
  watchedRepository: {
    getAll: async () => [],
    getAllStrict: async () => {
      if (repoState.failDownload) throw new Error('network down');
      return repoState.watched;
    },
    markBatch: async (items: Array<Record<string, unknown>>) => {
      // A queued write was NOT persisted: only a successful write reaches the
      // fake server, otherwise the snapshot would contain rows the real one
      // would not and reconcile tests could not tell a guard from luck.
      if (!repoState.queued) repoState.watched = items.map((i) => ({ ...i }));
      return { queued: repoState.queued };
    },
  },
}));
vi.mock('../../repositories/watchLaterRepository', () => ({
  watchLaterRepository: {
    getAll: async () => [],
    getAllStrict: async () => {
      if (repoState.failDownload) throw new Error('network down');
      return repoState.watchLater;
    },
    add: async (row: Record<string, unknown>) => {
      if (!repoState.queued) repoState.watchLater.push({ ...row });
      return { queued: repoState.queued };
    },
  },
}));
vi.mock('../../repositories/searchHistoryRepository', () => ({
  searchHistoryRepository: {
    getAll: async () => [],
    add: async () => ({ queued: repoState.queued }),
  },
}));
vi.mock('../../repositories/progressRepository', () => ({
  progressRepository: {
    getAll: async () => [],
    getAllStrict: async () => [],
    save: async () => ({ queued: repoState.queued }),
  },
}));

import { dataMigration } from '../dataMigration';
import { SYNC_DROPPED_KEY, getDroppedCount } from '../offlineQueue';

beforeEach(() => {
  localStorage.clear();
  repoState.queued = false;
  repoState.failDownload = false;
  repoState.watched = [];
  repoState.watchLater = [];
});

describe('migration flag', () => {
  it('marks migration per user id', async () => {
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem('supabase_data_migrated:user-1')).toBe('true');
    expect(localStorage.getItem('supabase_data_migrated')).toBeNull();
  });

  it('migrates a second user on the same browser instead of skipping', async () => {
    await dataMigration.migrateFromLocalStorage('user-1');
    await dataMigration.migrateFromLocalStorage('user-2');
    expect(localStorage.getItem('supabase_data_migrated:user-2')).toBe('true');
  });

  it('upgrades the legacy global flag without re-uploading', async () => {
    localStorage.setItem('supabase_data_migrated', 'true');
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem('supabase_data_migrated:user-1')).toBe('true');
  });
});

describe('upload outcome', () => {
  beforeEach(() => {
    localStorage.setItem(
      'watched:movie-603',
      JSON.stringify({ type: 'movie', id: '603', title: 'The Matrix', watchedAt: Date.now() }),
    );
  });

  it('keeps local data and the flag when every write reached the server', async () => {
    repoState.queued = false;
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem('supabase_data_migrated:user-1')).toBe('true');
    // The pre-login copy was wiped and re-hydrated from the verified server
    // row (numeric id), not left as the original local string id.
    const stored = JSON.parse(localStorage.getItem('watched:movie-603') ?? 'null');
    expect(stored?.id).toBe(603);
  });

  // Regression: repositories never throw - they park failures in the offline
  // queue - so a queued-only upload used to count as success and delete the
  // pre-login library while nothing was stored remotely.
  it('does not clear local data or set the flag when writes are only queued', async () => {
    repoState.queued = true;
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem('supabase_data_migrated:user-1')).toBeNull();
    expect(localStorage.getItem('watched:movie-603')).not.toBeNull();
  });

  // The local pre-login library is only wiped once the server demonstrably
  // holds it. If the post-upload download fails or times out, keeping the local
  // copy is the only thing standing between the user and total loss.
  it('keeps local data when the download after a successful upload fails', async () => {
    repoState.failDownload = true;
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem('watched:movie-603')).not.toBeNull();
    expect(localStorage.getItem('supabase_data_migrated:user-1')).toBe('true');
  });
});

// Writes dropped from the offline queue never reached the server, so the local
// library can legitimately hold rows the snapshot lacks. Reconcile treats the
// server as authoritative for deletions, which would turn that into data loss.
describe('dropped writes', () => {
  const FLAG = 'supabase_data_migrated:user-1';
  const key = 'watched:movie-603';

  beforeEach(() => {
    localStorage.setItem(FLAG, 'true');
    localStorage.setItem(
      key,
      JSON.stringify({ type: 'movie', id: 603, title: 'The Matrix', watchedAt: Date.now() }),
    );
    // Server snapshot is empty: the row was never uploaded.
    repoState.watched = [];
  });

  it('control: without a marker, reconcile removes a local row the server lacks', async () => {
    repoState.queued = true;
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps the local row and the marker while the re-upload still fails', async () => {
    localStorage.setItem(SYNC_DROPPED_KEY, JSON.stringify({ count: 2, lastAt: 1 }));
    repoState.queued = true; // upload parked in the queue again = not persisted
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(getDroppedCount()).toBe(2);
  });

  it('re-uploads on sign-in and clears the marker once everything is stored', async () => {
    localStorage.setItem(SYNC_DROPPED_KEY, JSON.stringify({ count: 2, lastAt: 1 }));
    repoState.queued = false;
    await dataMigration.migrateFromLocalStorage('user-1');
    expect(repoState.watched).toHaveLength(1);
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(getDroppedCount()).toBe(0);
  });

  it('resync() reports whether recovery fully succeeded', async () => {
    localStorage.setItem(SYNC_DROPPED_KEY, JSON.stringify({ count: 1, lastAt: 1 }));
    repoState.queued = true;
    expect(await dataMigration.resync('user-1')).toBe(false);
    expect(getDroppedCount()).toBe(1);
    repoState.queued = false;
    expect(await dataMigration.resync('user-1')).toBe(true);
    expect(getDroppedCount()).toBe(0);
  });
});
