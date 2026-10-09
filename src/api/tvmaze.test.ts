import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupTvMazeShowId, getEpisodeAirInstant, isEpisodeReleased } from './tvmaze';

const SHOW = {
  id: 82,
  name: 'Game of Thrones',
  network: { country: { timezone: 'America/New_York' } },
  externals: { imdb: 'tt0944947' },
};

const EPISODE = {
  id: 1623968,
  season: 8,
  number: 6,
  airdate: '2019-05-19',
  airtime: '21:00',
  // 21:00 ET Sunday = 03:00 Monday in Spain.
  airstamp: '2019-05-20T01:00:00+00:00',
};

function jsonResponse(data: unknown) {
  return Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve(data) });
}

describe('tvmaze', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const u = String(url);
        if (u.includes('/lookup/shows')) return jsonResponse(SHOW);
        if (u.includes('/episodebynumber')) return jsonResponse(EPISODE);
        return Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve(null) });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves the exact air instant with timezone math applied', async () => {
    const instant = await getEpisodeAirInstant('tt0944947', 8, 6);
    expect(instant).toBe(Date.parse('2019-05-20T01:00:00+00:00'));
  });

  it('caches show lookups and episode instants', async () => {
    await getEpisodeAirInstant('tt0944947', 8, 6);
    await getEpisodeAirInstant('tt0944947', 8, 6);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes('/lookup/shows'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('/episodebynumber'))).toHaveLength(1);
  });

  it('returns null for unknown shows and caches the miss', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve(null) })),
    );
    expect(await lookupTvMazeShowId('tt0000000')).toBeNull();
    expect(await lookupTvMazeShowId('tt0000000')).toBeNull();
    expect(fetch as unknown as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);
  });

  it('returns null without fetching for a blank imdb id', async () => {
    await expect(getEpisodeAirInstant('', 1, 1)).resolves.toBeNull();
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('uses cheap date logic far from the boundary without fetching', async () => {
    await expect(
      isEpisodeReleased({ imdbId: 'tt0944947', season: 8, episode: 6, airDate: '2030-01-01' }, Date.parse('2026-01-01T00:00:00Z')),
    ).resolves.toBe(false);
    await expect(
      isEpisodeReleased({ imdbId: 'tt0944947', season: 8, episode: 6, airDate: '2020-01-01' }, Date.parse('2026-01-01T00:00:00Z')),
    ).resolves.toBe(true);
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('holds the notification until the real broadcast instant in Spain', async () => {
    const sundayNoonUtc = Date.parse('2019-05-19T12:00:00+00:00');
    const mondayMorningSpain = Date.parse('2019-05-20T07:00:00+00:00');
    const input = { imdbId: 'tt0944947', season: 8, episode: 6, airDate: '2019-05-19' };
    // TMDB date alone says "released" all Sunday; the airstamp says not yet.
    await expect(isEpisodeReleased(input, sundayNoonUtc)).resolves.toBe(false);
    await expect(isEpisodeReleased(input, mondayMorningSpain)).resolves.toBe(true);
  });

  it('falls back to date logic when the provider has no match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ status: 404, ok: false, json: () => Promise.resolve(null) })),
    );
    await expect(
      isEpisodeReleased(
        { imdbId: 'tt0000000', season: 1, episode: 1, airDate: '2019-05-19' },
        Date.parse('2019-05-19T12:00:00+00:00'),
      ),
    ).resolves.toBe(true);
  });

  it('rejects on an already-aborted signal without fetching', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(getEpisodeAirInstant('tt0944947', 8, 6, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
