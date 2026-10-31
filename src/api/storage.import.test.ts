import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  importData,
  importDataDetailed,
  exportData,
  isWatched,
  markWatched,
  getWatchLater,
  getSearchHistory,
  getNotifications,
} from './storage';

// Captured before any spy replaces it, so the failing stub can delegate.
const realSetItem = Storage.prototype.setItem;

const watched = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'movie', id, title: `T${id}`, watchedAt: 100, ...extra });

describe('importData: key validation', () => {
  it.each([
    ['watchlaterX'],
    ['search_historyfoo'],
    ['notifications_extra'],
    ['watched:'],
    ['watched:movie-'],
    ['watched:movie-../../etc'],
    ['watched:movie-a b'],
    ['watched:tv-abc'],
    ['progress:tv-1'],
    ['progress:tv-1-S1'],
    ['epwl:1'],
    ['watched:movie-' + 'x'.repeat(65)],
  ])('rejects the key %s', (key) => {
    const res = importDataDetailed({ [key]: watched('1') });
    expect(res).toEqual({ imported: 0, skipped: 1 });
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('ignores keys outside the export set without counting them as skipped', () => {
    const res = importDataDetailed({ video_source: 'evil', random: '1' });
    expect(res).toEqual({ imported: 0, skipped: 0 });
    expect(localStorage.getItem('video_source')).toBeNull();
  });

  it('never imports the derived index keys; they are rebuilt from the entries', () => {
    importData({
      'watched:movie-1': watched('1'),
      watched_index: JSON.stringify(['watched:movie-999', 'evil']),
    });
    const index = JSON.parse(localStorage.getItem('watched_index') || '[]') as string[];
    expect(index).toEqual(['watched:movie-1']);
  });

  it('treats a backup index as derived data: not imported and not an error', () => {
    expect(importDataDetailed({ watched_index: '["x"]', progress_index: '["y"]' })).toEqual({
      imported: 0,
      skipped: 0,
    });
  });
});

describe('importData: value validation', () => {
  it.each([
    ['not json', 'not json'],
    ['a JSON array', '[1,2]'],
    ['a JSON primitive', '42'],
    ['a string season', JSON.stringify({ type: 'tv', id: '1', season: '1', watchedAt: 1 })],
    ['an unknown type', JSON.stringify({ type: 'evil', id: '1', watchedAt: 1 })],
    ['an object id', JSON.stringify({ type: 'movie', id: { a: 1 }, watchedAt: 1 })],
    ['an oversized value', JSON.stringify({ type: 'movie', id: '1', title: 'x'.repeat(9000) })],
  ])('skips a watched entry that is %s', (_label, value) => {
    const res = importDataDetailed({ 'watched:movie-1': value });
    expect(res).toEqual({ imported: 0, skipped: 1 });
    expect(isWatched('movie', '1')).toBe(false);
  });

  it('stores a real object value as JSON, never as "[object Object]"', () => {
    importData({ 'watched:movie-1': { type: 'movie', id: '1', title: 'T', watchedAt: 5 } });
    expect(localStorage.getItem('watched:movie-1')).toContain('"title":"T"');
    expect(localStorage.getItem('watched:movie-1')).not.toContain('[object');
  });

  it('rejects numbers and booleans as values', () => {
    expect(importDataDetailed({ 'watched:movie-1': 5 as never, 'watched:movie-2': true as never }).skipped).toBe(2);
  });

  it('fills a missing or non-numeric timestamp so sorting cannot produce NaN', () => {
    importData({ 'watched:movie-1': JSON.stringify({ type: 'movie', id: '1', title: 'T', watchedAt: 'yesterday' }) });
    const stored = JSON.parse(localStorage.getItem('watched:movie-1') as string) as { watchedAt: number };
    expect(Number.isFinite(stored.watchedAt)).toBe(true);
  });

  it('validates episode watch-later entries', () => {
    const ok = importDataDetailed({
      'epwl:1-S1E1': JSON.stringify({ showId: 1, season: 1, episode: 1, showTitle: 'S', addedAt: 3 }),
    });
    expect(ok.imported).toBe(1);
    const bad = importDataDetailed({
      'epwl:2-S1E1': JSON.stringify({ season: 1, episode: 1 }), // no showId
      'epwl:3-S1E1': JSON.stringify({ showId: 3, season: 'x', episode: 1 }),
    });
    expect(bad).toEqual({ imported: 0, skipped: 2 });
  });
});

describe('importData: list sanitising', () => {
  it('drops malformed watch-later items and keeps valid ones', () => {
    importData({
      watchlater: JSON.stringify([
        { type: 'movie', id: 1, title: 'Good', year: '2020', poster: '', addedAt: 1 },
        { type: 'evil', id: 2, title: 'Bad type' },
        { type: 'movie' },
        'string',
        null,
        { type: 'tv', id: 3, title: 'No timestamp' },
      ]),
    });
    const list = getWatchLater();
    expect(list.map((i) => String(i.id)).sort()).toEqual(['1', '3']);
    expect(list.every((i) => Number.isFinite(i.addedAt))).toBe(true);
  });

  it('keeps only strings in search history and caps its length', () => {
    importData({ search_history: JSON.stringify(['ok', 5, null, { a: 1 }, '  ', ...Array.from({ length: 40 }, (_, i) => `q${i}`)]) });
    const h = getSearchHistory();
    expect(h[0]).toBe('ok');
    expect(h.every((q) => typeof q === 'string')).toBe(true);
    expect(h.length).toBeLessThanOrEqual(15);
  });

  it('caps notifications and drops entries without an id', () => {
    const list = Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, createdAt: i }));
    importData({ notifications: JSON.stringify([...list, { createdAt: 1 }, 'x']) });
    expect(getNotifications()).toHaveLength(50);
  });

  it('rejects a list value that is not an array', () => {
    expect(importDataDetailed({ watchlater: '{"a":1}' })).toEqual({ imported: 0, skipped: 1 });
  });

  it('still treats null as a removal and counts it', () => {
    importData({ watchlater: JSON.stringify([{ type: 'movie', id: 1, title: 'x', year: '', poster: '', addedAt: 1 }]) });
    expect(importData({ watchlater: null })).toBe(1);
    expect(getWatchLater()).toEqual([]);
  });

  it('throws on a backup with too many entries before touching storage', () => {
    markWatched('movie', '1', 'Keep');
    const big: Record<string, unknown> = {};
    for (let i = 0; i < 20001; i++) big[`watched:movie-${i}`] = watched(String(i));
    expect(() => importData(big, 'replace')).toThrow(/too many/i);
    expect(isWatched('movie', '1')).toBe(true);
  });
});

describe('importData: atomic apply', () => {
  let setItem: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    setItem = vi.spyOn(Storage.prototype, 'setItem');
  });
  afterEach(() => {
    setItem.mockRestore();
  });

  function failOn(key: string) {
    setItem.mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === key) throw new DOMException('quota', 'QuotaExceededError');
      return realSetItem.call(this, k, v);
    });
  }

  it('replace mode restores the previous library when a write fails part-way', () => {
    markWatched('movie', '1', 'Existing');
    markWatched('movie', '2', 'Also existing');
    const before = exportData();
    failOn('watched:movie-9');

    const res = importDataDetailed(
      { 'watched:movie-8': watched('8'), 'watched:movie-9': watched('9'), 'watched:movie-10': watched('10') },
      'replace',
    );

    expect(res.imported).toBe(0);
    setItem.mockRestore();
    expect(exportData()).toEqual(before);
    expect(isWatched('movie', '1')).toBe(true);
    expect(isWatched('movie', '8')).toBe(false);
  });

  it('merge mode also rolls back entries written before the failure', () => {
    markWatched('movie', '1', 'Existing');
    const before = exportData();
    failOn('watched:movie-3');

    importData({ 'watched:movie-2': watched('2'), 'watched:movie-3': watched('3') }, 'merge');

    setItem.mockRestore();
    expect(exportData()).toEqual(before);
  });

  it('a successful replace still removes entries that are not in the backup', () => {
    markWatched('movie', '1', 'Existing');
    importData({ 'watched:movie-2': watched('2') }, 'replace');
    expect(isWatched('movie', '1')).toBe(false);
    expect(isWatched('movie', '2')).toBe(true);
  });
});
