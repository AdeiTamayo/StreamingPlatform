import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_BODY_BYTES, isAllowedUpstream, probeProvider, resetProbeState } from './providerProbeCore';

const NONTONGO_OK = '<title>NontonGo</title><a href="https://nontongo.win/watch/1">watch</a>';
const params = { source: 'nontongo', type: 'movie', id: '4242' };

function redirect(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

beforeEach(() => {
  resetProbeState();
});

describe('probe upstream allow-list', () => {
  it.each([
    ['https://nontongo.win/embed/movie/1', true],
    ['https://www.nontongo.win/embed/movie/1', true],
    ['https://data.vidsrc.sh/api.php?x=1', true],
    ['https://www.2embed.stream/embed/movie/1', true],
    ['http://nontongo.win/embed/movie/1', false],
    ['https://evil.example/x', false],
    ['https://nontongo.win.evil.example/x', false],
    ['https://169.254.169.254/latest/meta-data', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(isAllowedUpstream(url)).toBe(expected);
  });
});

describe('probe redirects', () => {
  it('never follows redirects automatically', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(NONTONGO_OK, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await probeProvider(params);
    expect(fetchMock.mock.calls[0][1]?.redirect).toBe('manual');
  });

  it('follows a redirect between allowed hosts', async () => {
    const fetchMock = vi.fn(async (url: unknown) =>
      String(url).includes('www.nontongo.win')
        ? new Response(NONTONGO_OK, { status: 200 })
        : redirect('https://www.nontongo.win/embed/movie/4242'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeProvider(params)).resolves.toEqual({ available: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    'https://evil.example/steal',
    'http://nontongo.win/embed/movie/4242',
    'https://169.254.169.254/latest/meta-data',
  ])('refuses a redirect to %s without contacting it', async (target) => {
    const fetchMock = vi.fn(async () => redirect(target));
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeProvider(params)).resolves.toEqual({ available: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after three redirects', async () => {
    const fetchMock = vi.fn(async () => redirect('https://nontongo.win/embed/movie/4242'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(probeProvider(params)).resolves.toEqual({ available: null });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe('probe body size limit', () => {
  it('ignores a response that declares a body over the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(NONTONGO_OK, { status: 200, headers: { 'content-length': String(MAX_BODY_BYTES + 1) } })));
    await expect(probeProvider(params)).resolves.toEqual({ available: null });
  });

  it('stops reading a stream that grows past the limit, even without a content-length', async () => {
    let cancelled = false;
    const chunk = new Uint8Array(200_000).fill(97);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, { status: 200 })));
    await expect(probeProvider(params)).resolves.toEqual({ available: null });
    expect(cancelled).toBe(true);
  });

  it('still reads a normal page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(NONTONGO_OK, { status: 200 })));
    await expect(probeProvider(params)).resolves.toEqual({ available: true });
  });
});
