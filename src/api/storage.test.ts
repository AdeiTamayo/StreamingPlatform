import { describe, it, expect, beforeEach } from 'vitest';
import { isWatched, markWatched, markUnwatched, getWatchLater, addWatchLater, removeWatchLater, isInWatchLater, getLastWatchedEpisode, getStats, getWatchedCount, clearShowHistory, getVideoSource, setVideoSource, getSearchHistory, addSearchHistory, getEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, isInEpisodeWatchLater } from './storage';

beforeEach(() => {
  localStorage.clear();
});

describe('watched marks', () => {
  it('marks a movie as watched', () => {
    markWatched('movie', '1', 'Test Movie');
    expect(isWatched('movie', '1')).toBe(true);
  });

  it('marks a TV episode as watched', () => {
    markWatched('tv', '1', 'Test Show', 1, 1);
    expect(isWatched('tv', '1', 1, 1)).toBe(true);
  });

  it('unmarks a watched item', () => {
    markWatched('movie', '1', 'Test Movie');
    markUnwatched('movie', '1');
    expect(isWatched('movie', '1')).toBe(false);
  });

  it('reports unwatched items correctly', () => {
    expect(isWatched('movie', '999')).toBe(false);
  });
});

describe('getLastWatchedEpisode', () => {
  it('returns null when nothing watched', () => {
    expect(getLastWatchedEpisode('1')).toBeNull();
  });

  it('returns the most recently watched episode', async () => {
    markWatched('tv', '1', 'Show', 1, 1);
    await new Promise((r) => setTimeout(r, 5));
    markWatched('tv', '1', 'Show', 1, 2);
    const last = getLastWatchedEpisode('1');
    expect(last).not.toBeNull();
    expect(last!.episode).toBe(2);
  });
});

describe('getWatchedCount', () => {
  it('counts 0 when nothing watched', () => {
    expect(getWatchedCount('1', 1, 10)).toBe(0);
  });

  it('counts watched episodes in a season', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 1, 2);
    markWatched('tv', '1', 'Show', 1, 5);
    expect(getWatchedCount('1', 1, 10)).toBe(3);
  });
});

describe('clearShowHistory', () => {
  it('removes all watched marks for a show', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 1, 2);
    markWatched('tv', '1', 'Show', 2, 1);
    markWatched('movie', '2', 'Other');
    clearShowHistory('1');
    expect(isWatched('tv', '1', 1, 1)).toBe(false);
    expect(isWatched('tv', '1', 1, 2)).toBe(false);
    expect(isWatched('tv', '1', 2, 1)).toBe(false);
    expect(isWatched('movie', '2')).toBe(true);
  });
});

describe('watch later', () => {
  it('starts empty', () => {
    expect(getWatchLater()).toEqual([]);
  });

  it('adds an item', () => {
    addWatchLater('movie', '1', 'Test', '2024', 'poster.jpg');
    expect(getWatchLater()).toHaveLength(1);
    expect(getWatchLater()[0].title).toBe('Test');
  });

  it('removes an item', () => {
    addWatchLater('movie', '1', 'Test', '2024', 'poster.jpg');
    removeWatchLater('movie', '1');
    expect(getWatchLater()).toEqual([]);
  });

  it('checks if item is in watch later', () => {
    addWatchLater('movie', '1', 'Test', '2024', 'poster.jpg');
    expect(isInWatchLater('movie', '1')).toBe(true);
    expect(isInWatchLater('movie', '2')).toBe(false);
  });
});

describe('episode watch later', () => {
  it('starts empty', () => {
    expect(getEpisodeWatchLater()).toEqual([]);
  });

  it('adds and removes episodes', () => {
    addEpisodeWatchLater('1', 1, 1, 'Show');
    expect(isInEpisodeWatchLater('1', 1, 1)).toBe(true);
    expect(getEpisodeWatchLater()).toHaveLength(1);
    removeEpisodeWatchLater('1', 1, 1);
    expect(isInEpisodeWatchLater('1', 1, 1)).toBe(false);
    expect(getEpisodeWatchLater()).toEqual([]);
  });
});

describe('search history', () => {
  it('starts empty', () => {
    expect(getSearchHistory()).toEqual([]);
  });

  it('adds and deduplicates search terms', () => {
    addSearchHistory('hello');
    addSearchHistory('world');
    addSearchHistory('hello');
    const history = getSearchHistory();
    expect(history).toHaveLength(2);
    expect(history[0]).toBe('hello');
  });

  it('ignores empty strings', () => {
    addSearchHistory('  ');
    expect(getSearchHistory()).toEqual([]);
  });
});

describe('getStats', () => {
  it('returns zero counts when nothing exists', () => {
    const stats = getStats();
    expect(stats.moviesWatched).toBe(0);
    expect(stats.episodesWatched).toBe(0);
    expect(stats.watchLaterCount).toBe(0);
  });

  it('counts movies and episodes', () => {
    markWatched('movie', '1', 'Movie 1');
    markWatched('movie', '2', 'Movie 2');
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 1, 2);
    addWatchLater('movie', '3', 'Later', '2024', '');
    const stats = getStats();
    expect(stats.moviesWatched).toBe(2);
    expect(stats.episodesWatched).toBe(2);
  });
});

describe('video source', () => {
  it('defaults to vidsrc', () => {
    expect(getVideoSource()).toBe('vidsrc');
  });

  it('persists the selected source', () => {
    setVideoSource('2embed');
    expect(getVideoSource()).toBe('2embed');
  });
});
