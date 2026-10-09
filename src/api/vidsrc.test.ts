import { describe, it, expect } from 'vitest';
import { getMovieEmbedUrl, getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from './vidsrc';

describe('vidsrc', () => {
  it('returns movie embed URL for default source', () => {
    const url = getMovieEmbedUrl(123);
    expect(url).toBe('https://vidsrc.fyi/embed/movie/123?autoplay=1');
  });

  it('returns movie embed URL for a specific source', () => {
    const url = getMovieEmbedUrl(456, '2embed');
    expect(url).toBe('https://www.2embed.cc/embed/456?autoplay=1');
  });

  it('returns TV embed URL with season and episode', () => {
    const url = getTVEmbedUrl(789, 2, 3);
    expect(url).toBe('https://vidsrc.fyi/embed/tv/789/2/3?autoplay=1');
  });

  it('returns TV embed URL for a specific source', () => {
    const url = getTVEmbedUrl(789, 2, 3, 'embos');
    expect(url).toBe('https://embos.top/tv/?mid=789&s=2&e=3&autoplay=1');
  });

  it('falls back to vidsrc for unknown source', () => {
    const url = getMovieEmbedUrl(1, 'nonexistent');
    expect(url).toBe('https://vidsrc.fyi/embed/movie/1?autoplay=1');
  });

  it('returns source label for each source', () => {
    expect(getSourceLabel('vidsrc')).toBe('VidSrc');
    expect(getSourceLabel('2embed')).toBe('2Embed');
    expect(getSourceLabel('embos')).toBe('Embos');
  });

  it('returns the source key itself for unknown source labels', () => {
    expect(getSourceLabel('unknown')).toBe('unknown');
  });

  it('exports all source keys', () => {
    expect(SOURCE_KEYS).toEqual(['vidsrc', '2embed', 'embos']);
  });

  // The chosen source is read from localStorage and is user-writable through
  // Settings -> Import, so an inherited object key must not resolve to a
  // function. Optional chaining does not help here: SOURCES['constructor']
  // returns Object's constructor, and calling .movie on it throws.
  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'falls back to vidsrc for the prototype key %s',
    (key) => {
      expect(getMovieEmbedUrl(5, key)).toBe('https://vidsrc.fyi/embed/movie/5?autoplay=1');
      expect(getTVEmbedUrl(5, 1, 2, key)).toBe('https://vidsrc.fyi/embed/tv/5/1/2?autoplay=1');
    },
  );

  it('handles an empty or whitespace source without throwing', () => {
    expect(getMovieEmbedUrl(9, '')).toBe('https://vidsrc.fyi/embed/movie/9?autoplay=1');
    expect(getMovieEmbedUrl(9, '   ')).toBe('https://vidsrc.fyi/embed/movie/9?autoplay=1');
  });

  it('does not let a source name reach the URL when it is rejected', () => {
    const url = getMovieEmbedUrl(1, 'evil.example');
    expect(url).not.toContain('evil.example');
  });
});
