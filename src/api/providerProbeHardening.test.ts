import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_MAX_ENTRIES,
  probeBestSource,
  probeProvider,
  resetProbeState,
} from './providerProbeCore';
import { SOURCE_KEYS } from './sources';
import { createRateLimiter, isCrossSiteRequest } from './rateLimit';

function page(status: number, html: string) {
  return { status, text: async () => html } as unknown as Response;
}
const VSEMBED_OK = page(200, JSON.stringify({ status_code: 200 }));
const EMPTY_VIDSRC = page(200, '<iframe src="https://vsembed.ru/embed/movie//"></iframe>');

beforeEach(() => {
  resetProbeState();
  vi.useRealTimers();
});

describe('probe scan runs providers in parallel', () => {
  it('starts every other provider before any of them has answered', async () => {
    const started: string[] = [];
    const releases: Array<() => void> = [];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      started.push(url);
      if (url.includes('vsembed.ru') || url.includes('vidsrc.fyi') || url.includes('vidsrc.')) {
        // current provider (vidsrc): answer immediately, missing
        if (!url.includes('data.vidsrc.sh')) return Promise.resolve(EMPTY_VIDSRC);
      }
      return new Promise<Response>((resolve) => {
        releases.push(() => resolve(url.includes('data.vidsrc.sh') ? VSEMBED_OK : page(502, '')));
      });
    }));

    const scan = probeBestSource({ source: 'vidsrc', type: 'movie', id: '9001' });
    await vi.waitFor(() => expect(releases.length).toBeGreaterThanOrEqual(2));
    // Nothing has resolved yet, yet more than one other provider was started.
    expect(started.length).toBeGreaterThanOrEqual(3);
    releases.forEach((release) => release());
    await expect(scan).resolves.toEqual({ available: false, best: 'vsembed' });
  });

  it('prefers the earlier provider when several confirm the title', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('data.vidsrc.sh')) return VSEMBED_OK;
      if (url.includes('2embed.stream')) return page(200, '<script>#file.m3u8</script>');
      return EMPTY_VIDSRC;
    }));
    const result = await probeBestSource({ source: 'vidsrc', type: 'movie', id: '9002' });
    expect(result.best).toBe(SOURCE_KEYS.find((k) => k === 'vsembed' || k === '2embed'));
  });
});

describe('probe cache and input limits', () => {
  it('keeps the cache bounded', async () => {
    const fetchMock = vi.fn(async () => EMPTY_VIDSRC);
    vi.stubGlobal('fetch', fetchMock);
    const total = CACHE_MAX_ENTRIES + 25;
    for (let i = 1; i <= total; i++) await probeProvider({ source: 'vidsrc', type: 'movie', id: String(i) });
    expect(fetchMock).toHaveBeenCalledTimes(total);

    // The oldest entry was evicted (refetched); the newest is still cached.
    await probeProvider({ source: 'vidsrc', type: 'movie', id: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(total + 1);
    await probeProvider({ source: 'vidsrc', type: 'movie', id: String(total) });
    expect(fetchMock).toHaveBeenCalledTimes(total + 1);
  });

  it('shares one upstream request between identical concurrent probes', async () => {
    const fetchMock = vi.fn(async () => EMPTY_VIDSRC);
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all(
      Array.from({ length: 5 }, () => probeProvider({ source: 'vidsrc', type: 'movie', id: '77' })),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { source: 'vidsrc', type: 'movie', id: '12345678901' },
    { source: 'vidsrc', type: 'tv', id: '1', season: '12345', episode: '1' },
    { source: 'vidsrc', type: 'tv', id: '1', season: '1', episode: '12345' },
  ])('refuses oversized ids %j without any upstream call', async (params) => {
    const fetchMock = vi.fn(async () => EMPTY_VIDSRC);
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeProvider(params)).resolves.toEqual({ available: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('rate limiter', () => {
  it('allows up to the limit per window, then blocks, then resets', () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => t });
    expect([1, 2, 3, 4].map(() => limiter.allow('a'))).toEqual([true, true, true, false]);
    expect(limiter.allow('b')).toBe(true);
    t = 1000;
    expect(limiter.allow('a')).toBe(true);
  });

  it('bounds the number of tracked keys', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2, now: () => 0 });
    limiter.allow('a');
    limiter.allow('b');
    limiter.allow('c'); // evicts a
    expect(limiter.allow('a')).toBe(true); // a was forgotten
    expect(limiter.allow('c')).toBe(false); // c still tracked
  });

  it('detects cross-site browser requests only', () => {
    expect(isCrossSiteRequest('cross-site')).toBe(true);
    expect(isCrossSiteRequest('same-origin')).toBe(false);
    expect(isCrossSiteRequest(undefined)).toBe(false);
  });
});

describe('GET /api/probe handler', () => {
  async function load() {
    vi.resetModules();
    return (await import('../../api/probe')).default;
  }
  function call(handler: Awaited<ReturnType<typeof load>>, headers: Record<string, string> = {}, method = 'GET') {
    const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
    const res = {
      status(code: number) { out.status = code; return res; },
      json(body: unknown) { out.body = body; },
      setHeader(name: string, value: string) { out.headers[name] = value; },
    };
    return handler({ method, query: { type: 'movie', id: 'bad' }, headers }, res).then(() => out);
  }

  it('rejects cross-site browser requests with 403', async () => {
    const handler = await load();
    const out = await call(handler, { 'sec-fetch-site': 'cross-site' });
    expect(out.status).toBe(403);
  });

  it('answers 429 once a client exceeds 30 requests a minute, per client', async () => {
    const handler = await load();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await call(handler, { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect((await call(handler, { 'x-forwarded-for': '5.6.7.8' })).status).toBe(200);
  });

  it('only accepts GET', async () => {
    const handler = await load();
    expect((await call(handler, {}, 'POST')).status).toBe(405);
  });
});
