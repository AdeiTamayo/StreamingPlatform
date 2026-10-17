import { describe, expect, it, beforeEach, vi } from 'vitest';

// Hermetic: never touch the network in unit tests (.env credentials are
// loaded by Vite). Repositories resolve empty so flag/merge logic is tested.
const repoState = vi.hoisted(() => ({ queued: false }));
vi.mock('../../repositories/watchedRepository', () => ({
  watchedRepository: {
    getAll: async () => [],
    markBatch: async () => ({ queued: repoState.queued }),
  },
}));
vi.mock('../../repositories/watchLaterRepository', () => ({
  watchLaterRepository: {
    getAll: async () => [],
    add: async () => ({ queued: repoState.queued }),
  },
}));
vi.mock('../../repositories/searchHistoryRepository', () => ({
  searchHistoryRepository: {
    getAll: async () => [],
    add: async () => ({ queued: repoState.queued }),
  },
}));

import { dataMigration } from '../dataMigration';

beforeEach(() => {
  localStorage.clear();
  repoState.queued = false;
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
    expect(localStorage.getItem('watched:movie-603')).toBeNull();
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
});
