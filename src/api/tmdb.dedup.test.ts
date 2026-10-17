import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Regression coverage for in-flight dedup: the shared request must not be
// tied to whichever caller happened to start it, or that caller's abort
// (unmount, an 8s status timeout) cancels everyone else's - which used to
// leave detail pages rendering "not found".
function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}

describe('tmdb in-flight dedup', () => {
  const fetchMock = vi.fn();
  let resolveFetch: ((res: Response) => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    resolveFetch = undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resolveFetch = undefined;
  });

  it('rejects only the caller that aborts; the other joiner still resolves', async () => {
    const { getPopularMovies } = await import('./tmdb');

    const first = new AbortController();
    const second = new AbortController();
    const page = 7 + Math.floor(Math.random() * 1000);

    const p1 = getPopularMovies(page, first.signal);
    const p2 = getPopularMovies(page, second.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    first.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });

    resolveFetch?.(jsonResponse({ page }));
    await expect(p2).resolves.toMatchObject({ page });
  });

  it('resolves every joiner when nobody aborts', async () => {
    const { getPopularTV } = await import('./tmdb');

    const page = 7 + Math.floor(Math.random() * 1000);
    const p1 = getPopularTV(page);
    const p2 = getPopularTV(page, new AbortController().signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    resolveFetch?.(jsonResponse({ page }));
    await expect(p1).resolves.toMatchObject({ page });
    await expect(p2).resolves.toMatchObject({ page });
  });

  it('rejects immediately for an already-aborted signal without firing a request', async () => {
    const { getTrending } = await import('./tmdb');

    const controller = new AbortController();
    controller.abort();
    await expect(getTrending('movie', 3, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
