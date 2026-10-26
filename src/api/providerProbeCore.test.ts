import { describe, it, expect, vi } from 'vitest';
import { probeBestSource, probeProvider } from './providerProbeCore';

function page(status: number, html: string) {
  return { status, text: async () => html } as unknown as Response;
}

function json(statusCode: string | number) {
  return page(200, JSON.stringify({ status_code: statusCode }));
}

describe('probeProvider', () => {
  it('detects the empty VidSrc movie frame', async () => {
    const fetchMock = vi.fn(async () =>
      page(200, '<iframe src="https://vsembed.ru/embed/movie//" allowfullscreen></iframe>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProvider({ source: 'vidsrc', type: 'movie', id: '550' }))
      .resolves.toEqual({ available: false });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('accepts a VidSrc TV frame that carries the id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<iframe src="https://vsembed.ru/embed/tv/1399/1-1?autoplay=1"></iframe>'),
    ));

    await expect(probeProvider({ source: 'vidsrc', type: 'tv', id: '1399', season: '1', episode: '1' }))
      .resolves.toEqual({ available: true });
  });

  it('treats the 2Embed error title as missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<html><head><title>Failed Fetching Data</title></head></html>'),
    ));

    await expect(probeProvider({ source: '2embed', type: 'movie', id: '551' }))
      .resolves.toEqual({ available: false });
  });

  it('accepts a 2Embed inner page that renders stream links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<html><head><title>Fight Club (1999)</title></head><body>https://upcloud.2embed.stream/bl/abc#file.m3u8</body></html>'),
    ));

    await expect(probeProvider({ source: '2embed', type: 'movie', id: '552' }))
      .resolves.toEqual({ available: true });
  });

  it('rejects a 2Embed page that has a title but no streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<html><head><title>LA BOLA NEGRA</title></head><body>Media not found</body></html>'),
    ));

    await expect(probeProvider({ source: '2embed', type: 'movie', id: '1422041' }))
      .resolves.toEqual({ available: false });
  });

  it('returns no signal for 2Embed Skin, which serves the same shell for every id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProvider({ source: '2embedskin', type: 'movie', id: '553' }))
      .resolves.toEqual({ available: null });
    await expect(probeProvider({ source: '2embedskin', type: 'tv', id: '1399', season: '1', episode: '1' }))
      .resolves.toEqual({ available: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no signal when NontonGo is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => page(502, '')));

    await expect(probeProvider({ source: 'nontongo', type: 'movie', id: '554' }))
      .resolves.toEqual({ available: null });
  });

  it('rejects a NontonGo page without watch links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<html><head><title>Fight Club (1999) - NontonGo</title></head></html>'),
    ));

    await expect(probeProvider({ source: 'nontongo', type: 'movie', id: '555' }))
      .resolves.toEqual({ available: false });
  });

  it('accepts a NontonGo page that renders watch links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      page(200, '<html><head><title>Fight Club (1999) - NontonGo</title></head><body><a href="https://nontongo.win/watch/abc">Watch</a></body></html>'),
    ));

    await expect(probeProvider({ source: 'nontongo', type: 'movie', id: '556' }))
      .resolves.toEqual({ available: true });
  });

  it('uses the VsEmbed media API instead of its identical player shell', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => json('404'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProvider({ source: 'vsembed', type: 'movie', id: '557' }))
      .resolves.toEqual({ available: false });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('data.vidsrc.sh/api.php');
    expect(url).toContain('tmdb=557');
  });

  it('accepts a VsEmbed media API response with file data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json('200')));

    await expect(probeProvider({ source: 'vsembed', type: 'tv', id: '1399', season: '1', episode: '1' }))
      .resolves.toEqual({ available: true });
  });

  it('returns no signal for Embos, which serves the same shell for bad ids', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProvider({ source: 'embos', type: 'movie', id: '558' }))
      .resolves.toEqual({ available: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no signal for invalid input without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProvider({ source: '2embed', type: 'movie', id: 'not-a-number' }))
      .resolves.toEqual({ available: null });
    await expect(probeProvider({ source: '2embed', type: 'tv', id: '10', season: '1' }))
      .resolves.toEqual({ available: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('probeBestSource', () => {
  it('returns the current provider when it already has the title', async () => {
    const fetchMock = vi.fn(async () =>
      page(200, '<iframe src="https://vsembed.ru/embed/tv/801/1-1"></iframe>'),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeBestSource({ source: 'vidsrc', type: 'tv', id: '801', season: '1', episode: '1' }))
      .resolves.toEqual({ available: true, best: 'vidsrc' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('scans forward to the first provider that confirms the title', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('data.vidsrc.sh')) return json('200');
      if (url.includes('nontongo')) return page(502, '');
      return page(200, '<iframe src="https://vsembed.ru/embed/movie//"></iframe>');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeBestSource({ source: 'vidsrc', type: 'movie', id: '701' }))
      .resolves.toEqual({ available: false, best: 'vsembed' });
  });

  it('reports no source when every readable provider says the title is missing', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('data.vidsrc.sh')) return json('404');
      if (url.includes('2embed.stream')) {
        return page(200, '<html><head><title>LA BOLA NEGRA</title></head></html>');
      }
      if (url.includes('nontongo')) return page(502, '');
      return page(200, '<iframe src="https://vsembed.ru/embed/movie//"></iframe>');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeBestSource({ source: 'vidsrc', type: 'movie', id: '1422041' }))
      .resolves.toEqual({ available: false, best: null });
  });
});
