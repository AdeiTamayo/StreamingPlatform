import { describe, expect, it, beforeEach, vi } from 'vitest';

// Hermetic: never touch the network in unit tests (.env credentials are
// loaded by Vite). Repositories resolve empty so flag/merge logic is tested.
vi.mock('../../repositories/watchedRepository', () => ({
  watchedRepository: {
    getAll: async () => [],
    markBatch: async () => {},
  },
}));
vi.mock('../../repositories/watchLaterRepository', () => ({
  watchLaterRepository: {
    getAll: async () => [],
    add: async () => {},
  },
}));
vi.mock('../../repositories/searchHistoryRepository', () => ({
  searchHistoryRepository: {
    getAll: async () => [],
    add: async () => {},
  },
}));

import { dataMigration } from '../dataMigration';

beforeEach(() => {
  localStorage.clear();
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
