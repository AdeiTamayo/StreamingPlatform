import { describe, it, expect, vi, beforeEach } from 'vitest';

async function importOmdb(withKey = true) {
  vi.stubEnv('VITE_OMDB_API_KEY', withKey ? 'test-key' : '');
  vi.resetModules();
  return await import('./omdb');
}

function mockFetch(routes: Array<{ url: RegExp; status?: number; body: unknown; networkError?: boolean }>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const route = routes.find((r) => r.url.test(url));
    if (route?.networkError) throw new TypeError('Failed to fetch');
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

  // Cinemeta has no meta/series/{id}/{season}/{episode}.json endpoint - it
  // 404s. Episodes resolve through meta/episode/{episodeImdbId}.json, so the
  // season/episode numbers must never be interpolated into the path.
  it('uses the Cinemeta episode endpoint for an episode imdb id', async () => {
    const { getImdbRating } = await importOmdb();
    const { cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '9.1', imdbVotes: '999' } } },
    ]);
    const rating = await getImdbRating('tt1480055', 'episode');
    expect(rating?.rating).toBe('9.1');
    expect(cinemetaCalls().some((c) => c.includes('/meta/episode/tt1480055.json'))).toBe(true);
    expect(cinemetaCalls().some((c) => c.includes('/meta/series/'))).toBe(false);
  });

  it('uses the Cinemeta series endpoint for a series imdb id', async () => {
    const { getImdbRating } = await importOmdb();
    const { cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, body: { meta: { imdbRating: '9.2', imdbVotes: '2000' } } },
    ]);
    const rating = await getImdbRating('tt0944947', 'series');
    expect(rating?.rating).toBe('9.2');
    expect(cinemetaCalls().some((c) => c.includes('/meta/series/tt0944947.json'))).toBe(true);
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

// Only definitive answers may be cached. A 5xx or network blip used to be
// written as a 24h "no rating" miss, so the badge stayed empty long after
// the connection recovered.
describe('omdb transient failures', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('does not cache a transient OMDb failure as a miss (by title)', async () => {
    const { getOmdbRatingByTitle, peekOmdbRatingByTmdb } = await importOmdb();
    const { omdbCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 500, body: {} },
    ]);

    expect(await getOmdbRatingByTitle(123, 'The Matrix', '1999', 'movie')).toBeNull();
    expect(peekOmdbRatingByTmdb(123).state).toBe('fresh');

    // A later visit retries instead of reusing the cached miss.
    await getOmdbRatingByTitle(123, 'The Matrix', '1999', 'movie');
    expect(omdbCalls()).toHaveLength(2);
  });

  it('does not cache a network error as a miss (by title)', async () => {
    const { getOmdbRatingByTitle, peekOmdbRatingByTmdb } = await importOmdb();
    mockFetch([{ url: /omdbapi\.com/, networkError: true, body: {} }]);

    expect(await getOmdbRatingByTitle(456, 'Heat', '1995', 'movie')).toBeNull();
    expect(peekOmdbRatingByTmdb(456).state).toBe('fresh');
  });

  it('still caches a definitive OMDb miss (title not found) by title', async () => {
    const { getOmdbRatingByTitle, peekOmdbRatingByTmdb } = await importOmdb();
    const { omdbCalls } = mockFetch([
      { url: /omdbapi\.com/, body: { Response: 'False', Error: 'Movie not found!' } },
    ]);

    expect(await getOmdbRatingByTitle(789, 'Nonexistent', '1900', 'movie')).toBeNull();
    expect(peekOmdbRatingByTmdb(789).state).toBe('miss');

    await getOmdbRatingByTitle(789, 'Nonexistent', '1900', 'movie');
    expect(omdbCalls()).toHaveLength(1);
  });

  it('does not cache when both OMDb and Cinemeta fail transiently', async () => {
    const { getImdbRating } = await importOmdb();
    const { omdbCalls, cinemetaCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 500, body: {} },
      { url: /cinemeta/, status: 502, body: {} },
    ]);

    expect(await getImdbRating('tt0111161', 'movie')).toBeNull();
    expect(localStorage.getItem('omdb:tt0111161')).toBeNull();

    await getImdbRating('tt0111161', 'movie');
    expect(omdbCalls()).toHaveLength(2);
    expect(cinemetaCalls()).toHaveLength(2);
  });

  it('does not cache when OMDb is limited and Cinemeta fails transiently', async () => {
    const { getImdbRating } = await importOmdb();
    mockFetch([
      { url: /omdbapi\.com/, status: 401, body: { Error: 'Request limit reached!' } },
      { url: /cinemeta/, status: 500, body: {} },
    ]);

    expect(await getImdbRating('tt0111161', 'movie')).toBeNull();
    expect(localStorage.getItem('omdb:tt0111161')).toBeNull();
  });

  it('caches a definitive Cinemeta miss after a transient OMDb failure', async () => {
    const { getImdbRating } = await importOmdb();
    const { omdbCalls } = mockFetch([
      { url: /omdbapi\.com/, status: 500, body: {} },
      { url: /cinemeta/, body: { meta: {} } },
    ]);

    expect(await getImdbRating('tt0111161', 'movie')).toBeNull();
    expect(JSON.parse(localStorage.getItem('omdb:tt0111161')!).data).toBeNull();

    await getImdbRating('tt0111161', 'movie');
    expect(omdbCalls()).toHaveLength(1);
  });

  it('still caches a definitive OMDb miss via the ok path', async () => {
    const { getImdbRating } = await importOmdb();
    const { omdbCalls } = mockFetch([
      { url: /omdbapi\.com/, body: { Response: 'False', Error: 'Movie not found!' } },
    ]);

    expect(await getImdbRating('tt9999999', 'movie')).toBeNull();
    expect(JSON.parse(localStorage.getItem('omdb:tt9999999')!).data).toBeNull();

    await getImdbRating('tt9999999', 'movie');
    expect(omdbCalls()).toHaveLength(1);
  });
});