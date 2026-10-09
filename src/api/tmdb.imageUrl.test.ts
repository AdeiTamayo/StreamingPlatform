import { describe, it, expect, beforeEach, vi } from 'vitest';

const PLACEHOLDER = 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';

// tmdb.ts throws at import time without a key, and the cache layer is not
// under test here, so stub both before importing the module under test.
async function importTmdb() {
  vi.stubEnv('VITE_TMDB_API_KEY', 'test-key');
  vi.resetModules();
  const cache = await import('./tmdbCache');
  vi.doMock('./tmdbCache', () => ({
    getCached: async () => null,
    setCache: async () => {},
  }));
  void cache;
  return await import('./tmdb');
}

describe('imageUrl', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the placeholder for a missing path', async () => {
    const { imageUrl } = await importTmdb();
    expect(imageUrl(null)).toBe(PLACEHOLDER);
    expect(imageUrl('')).toBe(PLACEHOLDER);
  });

  it('builds a TMDB CDN URL from a relative path', async () => {
    const { imageUrl } = await importTmdb();
    expect(imageUrl('/abc.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc.jpg');
    expect(imageUrl('/abc.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/abc.jpg');
  });
});

describe('safeImageUrl', () => {
  // Poster values come back out of localStorage, which a user can populate
  // through Settings -> Import. Anything that is not a TMDB path or a TMDB CDN
  // URL must not be rendered as a source, or a crafted import can make the app
  // load images from a host of the importer's choosing.
  it('accepts a plain TMDB relative path', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl('/abc123.jpg')).toBe('https://image.tmdb.org/t/p/w500/abc123.jpg');
    expect(safeImageUrl('/a-b_c.1.jpg', 'w185')).toBe('https://image.tmdb.org/t/p/w185/a-b_c.1.jpg');
  });

  it('passes through a URL already pointing at the TMDB CDN', async () => {
    const { safeImageUrl } = await importTmdb();
    const full = 'https://image.tmdb.org/t/p/w92/xyz.jpg';
    expect(safeImageUrl(full)).toBe(full);
  });

  it('rejects an absolute URL to another host', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl('https://evil.example/pixel.png')).toBe(PLACEHOLDER);
    expect(safeImageUrl('http://evil.example/pixel.png')).toBe(PLACEHOLDER);
  });

  it('rejects protocol-relative and data URLs', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl('//evil.example/x.png')).toBe(PLACEHOLDER);
    expect(safeImageUrl('data:image/svg+xml;base64,AAAA')).toBe(PLACEHOLDER);
    expect(safeImageUrl('javascript:alert(1)')).toBe(PLACEHOLDER);
  });

  it('rejects a relative path with traversal or injected characters', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl('/../../secret')).toBe(PLACEHOLDER);
    expect(safeImageUrl('/a.jpg?x=1')).toBe(PLACEHOLDER);
    expect(safeImageUrl('/a b.jpg')).toBe(PLACEHOLDER);
    expect(safeImageUrl('/a");background:url(//evil.example/b')).toBe(PLACEHOLDER);
  });

  it('falls back to the placeholder for non-string values', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl(null)).toBe(PLACEHOLDER);
    expect(safeImageUrl(undefined)).toBe(PLACEHOLDER);
    expect(safeImageUrl(123)).toBe(PLACEHOLDER);
    expect(safeImageUrl({ path: '/a.jpg' })).toBe(PLACEHOLDER);
    expect(safeImageUrl(['/a.jpg'])).toBe(PLACEHOLDER);
  });

  it('honours the requested size', async () => {
    const { safeImageUrl } = await importTmdb();
    expect(safeImageUrl('/a.jpg', 'w300')).toBe('https://image.tmdb.org/t/p/w300/a.jpg');
  });
});