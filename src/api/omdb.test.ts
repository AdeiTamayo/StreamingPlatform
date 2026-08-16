import { describe, it, expect, vi, beforeEach } from 'vitest';

async function importOmdb(withKey = true) {
  vi.stubEnv('VITE_OMDB_API_KEY', withKey ? 'test-key' : '');
  vi.resetModules();
  return await import('./omdb');
}

function mockFetch(routes: Array<{ url: RegExp; status?: number; body: unknown }>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((r) => r.url.test(url));
    return new Response(JSON.stringify(route?.body ?? {}), {
      status: route?.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, omdbCalls: () => calls.filter((c) => c.includes('omdbapi.com')), cinemetaCalls: () => calls.filter((c) => c.includes('cinemeta.strem.io')) };
}

describe('omdb fallback', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('falls back to Cinemeta when OMDb returns the quota limit error', async () => {
    const { getImdbRating } = await importOmdb();
    const { cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '8.5', imdbVotes: '1234' } } },
    ]);
    const rating = await getImdbRating('tt0111161', 'movie');
    expect(rating).toEqual({ rating: '8.5', votes: '1234' });
    expect(cinemetaCalls().some((c) => c.includes('/meta/movie/tt0111161.json'))).toBe(true);
  });

  it('builds the Cinemeta episode URL from season and episode numbers', async () => {
    const { getImdbRating } = await importOmdb();
    const { cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '9.1', imdbVotes: '999' } } },
    ]);
    const rating = await getImdbRating('tt0944947', 'episode', undefined, 1, 2);
    expect(rating?.rating).toBe('9.1');
    expect(cinemetaCalls().some((c) => c.includes('/meta/series/tt0944947/1/2.json'))).toBe(true);
  });

  it('skips OMDb during the cooldown window and goes straight to Cinemeta', async () => {
    const { getImdbRating } = await importOmdb();
    const { omdbCalls, cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '8.5', imdbVotes: '1234' } } },
    ]);
    await getImdbRating('tt0111161', 'movie');
    expect(omdbCalls()).toHaveLength(1);
    await getImdbRating('tt0468569', 'movie');
    expect(omdbCalls()).toHaveLength(1);
    expect(cinemetaCalls().some((c) => c.includes('/meta/movie/tt0468569.json'))).toBe(true);
  });

  it('caches the fallback rating so repeat lookups do not refetch', async () => {
    const { getImdbRating } = await importOmdb();
    const { calls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '8.5', imdbVotes: '1234' } } },
    ]);
    const first = await getImdbRating('tt0111161', 'movie');
    const second = await getImdbRating('tt0111161', 'movie');
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
  });

  it('uses only Cinemeta when no OMDb key is configured', async () => {
    const { getImdbRating } = await importOmdb(false);
    const { omdbCalls, cinemetaCalls } = mockFetch([
      { url: /cinemeta/, body: { meta: { imdbRating: '7.7', imdbVotes: '500' } } },
    ]);
    const rating = await getImdbRating('tt1375666', 'movie');
    expect(rating?.rating).toBe('7.7');
    expect(omdbCalls()).toHaveLength(0);
    expect(cinemetaCalls()).toHaveLength(1);
  });
});