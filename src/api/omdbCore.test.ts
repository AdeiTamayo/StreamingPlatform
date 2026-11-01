import { describe, expect, it, vi } from 'vitest';
import { handleOmdbQuery } from './omdbCore';

function upstream(status: number, body: unknown) {
  return vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
}

const KEY = 'server-secret-key';

describe('handleOmdbQuery', () => {
  it('answers 503 when the server has no key, without calling OMDb', async () => {
    const fetchMock = upstream(200, {});
    const res = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: undefined, fetch: fetchMock });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up by imdb id with the server key and returns only the rating fields', async () => {
    const fetchMock = upstream(200, {
      Response: 'True',
      Title: 'secret extras',
      imdbRating: '9.3',
      imdbVotes: '1,000',
      Ratings: [
        { Source: 'Internet Movie Database', Value: '9.3/10' },
        { Source: 'Rotten Tomatoes', Value: '91%' },
      ],
    });
    const res = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: KEY, fetch: fetchMock });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('i=tt0111161');
    expect(url).toContain(`apikey=${KEY}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      imdbRating: '9.3',
      imdbVotes: '1,000',
      Ratings: [{ Source: 'Rotten Tomatoes', Value: '91%' }],
    });
    expect(JSON.stringify(res)).not.toContain(KEY);
    expect(res.headers['Cache-Control']).toContain('s-maxage');
  });

  it('looks up by title and year', async () => {
    const fetchMock = upstream(200, { imdbRating: '8.2', imdbVotes: '5' });
    await handleOmdbQuery({ t: 'Heat', y: '1995', type: 'movie' }, { apiKey: KEY, fetch: fetchMock });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('t=Heat');
    expect(url).toContain('y=1995');
  });

  it('never lets the client supply or override the apikey', async () => {
    const fetchMock = upstream(200, {});
    await handleOmdbQuery(
      { t: 'Heat&apikey=attacker', type: 'movie' },
      { apiKey: KEY, fetch: fetchMock },
    );
    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.searchParams.getAll('apikey')).toEqual([KEY]);
    expect(parsed.searchParams.get('t')).toBe('Heat&apikey=attacker');
  });

  it.each([
    [{ i: 'tt1', type: 'game' }],
    [{ i: 'not-an-id', type: 'movie' }],
    [{ i: 'tt0111161', t: 'x', type: 'movie' }],
    [{ type: 'movie' }],
    [{ t: 'x'.repeat(201), type: 'movie' }],
    [{ t: 'Heat', y: '95', type: 'movie' }],
    [{ t: 'Heat' }],
  ])('rejects invalid query %j with 400 and no upstream call', async (query) => {
    const fetchMock = upstream(200, {});
    const res = await handleOmdbQuery(query, { apiKey: KEY, fetch: fetchMock });
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a quota response (401 or limit message) to 429', async () => {
    const a = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: KEY, fetch: upstream(401, { Error: 'Request limit reached!' }) });
    const b = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: KEY, fetch: upstream(200, { Response: 'False', Error: 'Request limit reached!' }) });
    expect(a.status).toBe(429);
    expect(b.status).toBe(429);
    expect(a.headers['Cache-Control']).toBe('no-store');
  });

  it('returns a cacheable empty result for a definitive not-found', async () => {
    const res = await handleOmdbQuery({ t: 'Nope', type: 'movie' }, { apiKey: KEY, fetch: upstream(200, { Response: 'False', Error: 'Movie not found!' }) });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ Ratings: [] });
  });

  it('returns 502 on upstream failure, never caches it, and never logs or returns the key', async () => {
    const logError = vi.fn();
    const failing = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      throw new TypeError(`fetch failed https://www.omdbapi.com/?apikey=${KEY}`);
    });
    const res = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: KEY, fetch: failing, logError });
    expect(res.status).toBe(502);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(JSON.stringify(res)).not.toContain(KEY);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(KEY);

    const r500 = await handleOmdbQuery({ i: 'tt0111161', type: 'movie' }, { apiKey: KEY, fetch: upstream(500, {}) });
    expect(r500.status).toBe(502);
  });
});
