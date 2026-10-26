import { describe, it, expect, vi } from 'vitest';
import { probeProviderAvailability } from './providerProbe';

function jsonResponse(body: unknown, init: { ok?: boolean; contentType?: string } = {}) {
  return {
    ok: init.ok ?? true,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? init.contentType ?? 'application/json' : null) },
    json: async () => body,
  } as unknown as Response;
}

describe('probeProviderAvailability', () => {
  it('calls the same-origin probe with movie params and scan enabled', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ available: false, best: 'vsembed' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProviderAvailability({ source: 'vidsrc', mediaType: 'movie', id: '550' }))
      .resolves.toEqual({ available: false, best: 'vsembed' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/probe?');
    expect(url).toContain('source=vidsrc');
    expect(url).toContain('type=movie');
    expect(url).toContain('id=550');
    expect(url).toContain('scan=1');
    expect(url).not.toContain('season=');
  });

  it('includes season and episode for TV', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ available: true, best: '2embed' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(probeProviderAvailability({
      source: '2embed', mediaType: 'tv', id: '1399', season: 2, episode: 5,
    })).resolves.toEqual({ available: true, best: '2embed' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('season=2');
    expect(url).toContain('episode=5');
  });

  it('normalizes malformed payloads to unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ available: 'yes', best: 42 })));
    await expect(probeProviderAvailability({ source: 'vidsrc', mediaType: 'movie', id: '550' }))
      .resolves.toEqual({ available: null, best: null });
  });

  it('treats an HTML fallback (probe not deployed) as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('<html></html>', { contentType: 'text/html' })));
    await expect(probeProviderAvailability({ source: 'vidsrc', mediaType: 'movie', id: '550' }))
      .resolves.toEqual({ available: null, best: null });
  });

  it('returns unknown when the probe request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await expect(probeProviderAvailability({ source: 'vidsrc', mediaType: 'movie', id: '550' }))
      .resolves.toEqual({ available: null, best: null });
  });
});
