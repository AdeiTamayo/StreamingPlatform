import { describe, expect, it, beforeEach, vi } from 'vitest';

const { repo, strict } = vi.hoisted(() => {
  const repo = { fail: false };
  const strict = (rows: unknown[]) => async () => {
    if (repo.fail) throw new Error('network down');
    return rows;
  };
  return { repo, strict };
});
vi.mock('../../repositories/watchedRepository', () => ({
  watchedRepository: {
    getAllStrict: strict([
      { media_type: 'movie', tmdb_id: 1, title: 'A', season: null, episode: null, watched_at: '2026-01-01T00:00:00Z', meta: null },
    ]),
  },
}));
vi.mock('../../repositories/watchLaterRepository', () => ({ watchLaterRepository: { getAllStrict: strict([]) } }));
vi.mock('../../repositories/searchHistoryRepository', () => ({ searchHistoryRepository: { getAllStrict: strict([]) } }));
vi.mock('../../repositories/progressRepository', () => ({ progressRepository: { getAllStrict: strict([]) } }));
vi.mock('../storage', () => ({ getCurrentUserId: () => 'user-1' }));
vi.mock('../../utils/dataMigration', () => ({ dataMigration: { syncFromSupabase: async () => {} } }));

import { exportSupabaseData } from '../storageBackup';

beforeEach(() => {
  repo.fail = false;
});

describe('exportSupabaseData', () => {
  it('exports the rows of a full download', async () => {
    const data = await exportSupabaseData();
    expect(data?.watched).toHaveLength(1);
    expect(data?.watched[0]).toMatchObject({ user_id: 'user-1', tmdb_id: 1 });
  });

  // Regression: a failed read used to resolve to [] and produce an empty,
  // valid-looking backup file.
  it('rejects instead of producing an empty backup when a download fails', async () => {
    repo.fail = true;
    await expect(exportSupabaseData()).rejects.toThrow('network down');
  });
});
