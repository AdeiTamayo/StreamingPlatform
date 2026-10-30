import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));

import { fetchAllPages } from '../supabase';

function pager(total: number, serverCap: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + serverCap)), error: null, count: total };
  };
  return { fetchPage, calls };
}

describe('fetchAllPages', () => {
  it('returns every row when the library exceeds one page', async () => {
    const { fetchPage, calls } = pager(2500, 1000);
    const rows = await fetchAllPages(fetchPage, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('makes a single request for a small library', async () => {
    const { fetchPage, calls } = pager(10, 1000);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it('still returns everything when the server caps responses below the page size', async () => {
    const { fetchPage } = pager(1200, 500);
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(1200);
  });

  it('handles an empty table', async () => {
    const { fetchPage } = pager(0, 1000);
    expect(await fetchAllPages(fetchPage, 1000)).toEqual([]);
  });

  it('falls back to short-page detection when no count is returned', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const fetchPage = async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null });
    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(1500);
  });

  it('throws instead of returning a partial result when a later page fails', async () => {
    let n = 0;
    const fetchPage = async () => {
      n += 1;
      if (n === 2) return { data: null, error: new Error('boom'), count: 2000 };
      return { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null, count: 2000 };
    };
    await expect(fetchAllPages(fetchPage, 1000)).rejects.toThrow('boom');
  });

  it('refuses to download an unbounded number of rows', async () => {
    const fetchPage = async () => ({ data: [{ id: 1 }, { id: 2 }], error: null, count: 1_000_000 });
    await expect(fetchAllPages(fetchPage, 2, 10)).rejects.toThrow('Too many rows');
  });
});
