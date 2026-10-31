import { describe, it, expect, beforeEach } from 'vitest';
import {
  markWatching,
  markWatched,
  markSeriesWatched,
  clearShowHistory,
  getContinueWatching,
  getLastSeen,
  getStats,
  getWatching,
  importData,
  PROGRESS_INDEX_KEY,
} from './storage';

beforeEach(() => {
  localStorage.clear();
});

describe('Continue Watching vs Last Seen are mutually exclusive', () => {
  it('moves a title from Continue Watching to Last Seen when it is marked watched, and back on a rewatch', () => {
    markWatching('movie', '1', null, null, { title: 'Film' });
    expect(getContinueWatching().map((c) => c.id)).toEqual(['1']);
    expect(getLastSeen()).toEqual([]);

    markWatched('movie', '1', 'Film');
    expect(getContinueWatching()).toEqual([]);
    expect(getLastSeen().map((l) => l.id)).toEqual(['1']);

    markWatching('movie', '1', null, null, { title: 'Film' });
    expect(getContinueWatching().map((c) => c.id)).toEqual(['1']);
    expect(getLastSeen()).toEqual([]);
  });

  it('hides progress rows for a show once the whole series is flagged watched, even if a stale row remains', () => {
    markWatching('tv', '7', 1, 2, { title: 'Show' });
    markSeriesWatched('7', 'Show', 'p.jpg');
    // Simulate a row restored by an older version / a late sync after the flag.
    localStorage.setItem('progress:tv-7-S1E3', JSON.stringify({ type: 'tv', id: '7', savedAt: 5 }));
    localStorage.setItem(PROGRESS_INDEX_KEY, JSON.stringify(['progress:tv-7-S1E3']));

    expect(getContinueWatching()).toEqual([]);
  });

  it('marking a series watched clears that show\'s in-progress rows but not other shows', () => {
    markWatching('tv', '7', 1, 1, { title: 'Show 7' });
    markWatching('tv', '8', 1, 1, { title: 'Show 8' });
    markSeriesWatched('7', 'Show 7', 'p.jpg');

    expect(getWatching('tv', '7', 1, 1)).toBeNull();
    expect(getContinueWatching().map((c) => c.id)).toEqual(['8']);
  });
});

describe('Continue Watching tolerates damaged local data', () => {
  it('does not fabricate a row for an index key whose value is missing, and heals the index', () => {
    markWatching('tv', '1', 1, 1, { title: 'Real' });
    localStorage.setItem(
      PROGRESS_INDEX_KEY,
      JSON.stringify(['progress:tv-1-S1E1', 'progress:tv-99-S1E1']),
    );

    const list = getContinueWatching();

    expect(list.map((c) => c.id)).toEqual(['1']);
    expect(JSON.parse(localStorage.getItem(PROGRESS_INDEX_KEY) as string)).toEqual(['progress:tv-1-S1E1']);
  });

  it('skips an entry with corrupt JSON instead of throwing, and keeps the rest', () => {
    markWatching('tv', '1', 1, 1, { title: 'Real' });
    localStorage.setItem('progress:tv-2-S1E1', '{not json');
    localStorage.setItem(PROGRESS_INDEX_KEY, JSON.stringify(['progress:tv-1-S1E1', 'progress:tv-2-S1E1']));

    expect(() => getContinueWatching()).not.toThrow();
    expect(getContinueWatching().map((c) => c.id)).toEqual(['1']);
  });

  it('an index key that does not parse as a progress key is ignored', () => {
    markWatching('tv', '1', 1, 1, { title: 'Real' });
    localStorage.setItem(PROGRESS_INDEX_KEY, JSON.stringify(['progress:tv-1-S1E1', 'progress:garbage', 42, null]));
    expect(() => getContinueWatching()).not.toThrow();
    expect(getContinueWatching()).toHaveLength(1);
  });
});

describe('clearShowHistory', () => {
  it('removes watched and in-progress rows for the show, including ones missing from the index', async () => {
    markWatched('tv', '5', 'Show', 1, 1);
    markWatching('tv', '5', 1, 2, { title: 'Show' });
    markWatched('tv', '6', 'Other', 1, 1);
    // Orphans written outside the index.
    localStorage.setItem('watched:tv-5-S2E1', JSON.stringify({ type: 'tv', id: '5', watchedAt: 1 }));
    localStorage.setItem('progress:tv-5-S2E2', JSON.stringify({ type: 'tv', id: '5', savedAt: 1 }));

    await clearShowHistory('5');

    expect(localStorage.getItem('watched:tv-5-S1E1')).toBeNull();
    expect(localStorage.getItem('watched:tv-5-S2E1')).toBeNull();
    expect(localStorage.getItem('progress:tv-5-S1E2')).toBeNull();
    expect(localStorage.getItem('progress:tv-5-S2E2')).toBeNull();
    expect(getLastSeen().map((l) => l.id)).toEqual(['6']);
    expect(getContinueWatching()).toEqual([]);
  });

  it('does not remove a show whose id merely starts with the same digits', async () => {
    markWatched('tv', '55', 'Other', 1, 1);
    markWatched('tv', '5', 'Show', 1, 1);
    await clearShowHistory('5');
    expect(localStorage.getItem('watched:tv-55-S1E1')).not.toBeNull();
  });
});

describe('screens survive an imported backup with odd but valid entries', () => {
  it('reading Continue Watching, Last Seen and Stats never throws on sparse imported rows', () => {
    importData({
      'progress:movie-1': JSON.stringify({}),
      'progress:tv-2-S1E1': JSON.stringify({ type: 'tv' }),
      'watched:movie-3': JSON.stringify({}),
      'watched:tv-4': JSON.stringify({ meta: { title: 'No top-level title' } }),
    });

    expect(() => getContinueWatching()).not.toThrow();
    expect(() => getLastSeen()).not.toThrow();
    expect(() => getStats()).not.toThrow();
    expect(getContinueWatching().every((c) => Number.isFinite(c.savedAt))).toBe(true);
    expect(getLastSeen().every((l) => Number.isFinite(l.ts))).toBe(true);
  });
});
