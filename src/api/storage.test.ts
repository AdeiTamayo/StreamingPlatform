import { describe, it, expect, beforeEach } from 'vitest';
import {
  isWatched, markWatched, markUnwatched,
  getWatchLater, addWatchLater, removeWatchLater, isInWatchLater,
  getLastWatchedEpisode, getStats, getWatchedCount, getWatchedEpisodeSet,
  clearShowHistory, markSeasonWatched,
  getVideoSource, setVideoSource,
  getTimezone, setTimezone, getEffectiveTimezone,
  getSearchHistory, addSearchHistory, removeSearchHistory,
  getEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, isInEpisodeWatchLater,
  markWatching, getWatching, clearWatching,
  getLastSeen, getContinueWatching,
  getNotifications, addNotification, removeNotification, markAllNotificationsRead, clearAllNotifications, isAlreadyNotified, pruneOldNotifications, NOTIFICATIONS_KEY,
  clearAllData, exportData, importData,
  isSeriesWatched, markSeriesWatched, unmarkSeriesWatched, getSeriesWatchedFlag, getSeriesWatchedShows, syncSeriesWatchedFlag,
} from './storage';

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

  it('stores metadata with watched entry', () => {
    markWatched('tv', '1', 'Show', 1, 1, { title: 'Show', poster: 'p.jpg' });
    const seen = getLastSeen();
    expect(seen).toHaveLength(1);
    expect(seen[0].meta).toEqual({ title: 'Show', poster: 'p.jpg' });
  });
});

describe('getWatchedEpisodeSet', () => {
  it('returns empty set when nothing watched', () => {
    expect(getWatchedEpisodeSet(1, 1)).toEqual(new Set());
  });

  it('returns set of watched episode numbers', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 1, 3);
    markWatched('tv', '1', 'Show', 1, 5);
    const set = getWatchedEpisodeSet(1, 1);
    expect(set).toEqual(new Set([1, 3, 5]));
  });

  it('does not include episodes from other seasons', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 2, 1);
    markWatched('tv', '1', 'Show', 2, 2);
    const set = getWatchedEpisodeSet(1, 1);
    expect(set).toEqual(new Set([1]));
  });

  it('caps by episodeCount when provided', () => {
    markWatched('tv', '1', 'Show', 1, 5);
    markWatched('tv', '1', 'Show', 1, 10);
    const set = getWatchedEpisodeSet(1, 1, 8);
    expect(set).toEqual(new Set([5]));
  });

  it('does not include movie entries', () => {
    markWatched('movie', '1', 'Movie');
    markWatched('tv', '1', 'Show', 1, 1);
    const set = getWatchedEpisodeSet(1, 1);
    expect(set).toEqual(new Set([1]));
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

  it('caps count by episodeCount', () => {
    markWatched('tv', '1', 'Show', 1, 5);
    markWatched('tv', '1', 'Show', 1, 8);
    markWatched('tv', '1', 'Show', 1, 12);
    expect(getWatchedCount('1', 1, 10)).toBe(2);
  });

  it('ignores episodes from other seasons', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 2, 1);
    markWatched('tv', '1', 'Show', 2, 2);
    expect(getWatchedCount('1', 1, 10)).toBe(1);
  });
});

describe('markSeasonWatched', () => {
  it('marks all episodes in a season', () => {
    markSeasonWatched('1', 1, 5, 'Show', 'p.jpg');
    expect(isWatched('tv', '1', 1, 1)).toBe(true);
    expect(isWatched('tv', '1', 1, 2)).toBe(true);
    expect(isWatched('tv', '1', 1, 5)).toBe(true);
    expect(isWatched('tv', '1', 2, 1)).toBe(false);
  });

  it('does not double-mark already watched episodes', () => {
    markWatched('tv', '1', 'Show', 1, 1, { poster: 'old.jpg' });
    markSeasonWatched('1', 1, 3, 'Show', 'p.jpg');
    const seen = getLastSeen();
    const eps1 = seen.filter((s) => s.episode === 1);
    expect(eps1).toHaveLength(1);
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

  it('ignores movie entries', () => {
    markWatched('movie', '1', 'Movie');
    expect(getLastWatchedEpisode('1')).toBeNull();
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

  it('also clears watching entries for the show', () => {
    markWatching('tv', '1', 1, 1);
    markWatching('tv', '1', 1, 2);
    markWatching('tv', '2', 1, 1);
    clearShowHistory('1');
    expect(getWatching('tv', '1', 1, 1)).toBeNull();
    expect(getWatching('tv', '1', 1, 2)).toBeNull();
    expect(getWatching('tv', '2', 1, 1)).not.toBeNull();
  });

  it('removes the series flag with the history', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    clearShowHistory('1');
    expect(isSeriesWatched('1')).toBe(false);
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

  it('deduplicates on add', () => {
    addWatchLater('movie', '1', 'Test', '2024', 'poster.jpg');
    addWatchLater('movie', '1', 'Test', '2024', 'poster.jpg');
    expect(getWatchLater()).toHaveLength(1);
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

describe('watching', () => {
  it('marks and retrieves a title being watched', () => {
    markWatching('movie', '1');
    const w = getWatching('movie', '1');
    expect(w).not.toBeNull();
    expect(w!.type).toBe('movie');
    expect(w!.savedAt).toBeGreaterThan(0);
  });

  it('returns null for non-existent entries', () => {
    expect(getWatching('movie', '999')).toBeNull();
  });

  it('clears the watching flag', () => {
    markWatching('movie', '1');
    clearWatching('movie', '1');
    expect(getWatching('movie', '1')).toBeNull();
  });

  it('persists metadata', () => {
    markWatching('tv', '1', 1, 1, { title: 'Show', poster: 'p.jpg' });
    const w = getWatching('tv', '1', 1, 1);
    expect(w!.meta).toEqual({ title: 'Show', poster: 'p.jpg' });
  });

  it('drops the watched mark when playback starts (rewatch)', () => {
    markWatched('movie', '1', 'Movie');
    markWatching('movie', '1', null, null, { title: 'Movie' });
    expect(isWatched('movie', '1')).toBe(false);
    expect(getContinueWatching()).toHaveLength(1);
  });

  it('drops the series flag when playback starts (rewatch)', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    markWatching('tv', '1', 1, 1, { title: 'Show' });
    expect(isSeriesWatched('1')).toBe(false);
  });

  it('drops the watching flag when marked watched', () => {
    markWatching('movie', '1');
    markWatched('movie', '1', 'Movie');
    expect(getWatching('movie', '1')).toBeNull();
    expect(getContinueWatching()).toHaveLength(0);
  });
});

describe('getLastSeen', () => {
  it('returns watched items sorted by recency', async () => {
    markWatched('tv', '1', 'Show A', 1, 1);
    await new Promise((r) => setTimeout(r, 5));
    markWatched('tv', '2', 'Show B', 1, 1);
    const seen = getLastSeen();
    expect(seen).toHaveLength(2);
    expect(seen[0].title).toBe('Show B');
    expect(seen[1].title).toBe('Show A');
  });

  it('does not list titles that are only being watched', () => {
    markWatching('tv', '1', 1, 1, { title: 'Show C' });
    expect(getLastSeen()).toEqual([]);
  });
});

describe('getContinueWatching', () => {
  it('lists every title marked as being watched', () => {
    markWatching('tv', '1', 1, 1);
    markWatching('tv', '1', 1, 2);
    const cw = getContinueWatching();
    expect(cw).toHaveLength(2);
  });

  it('excludes items that are fully watched', () => {
    markWatching('tv', '1', 1, 1);
    markWatched('tv', '1', 'Show', 1, 1);
    const cw = getContinueWatching();
    expect(cw).toHaveLength(0);
  });

  it('sorts by savedAt descending', async () => {
    markWatching('tv', '1', 1, 1, { title: 'First' });
    await new Promise((r) => setTimeout(r, 5));
    markWatching('tv', '2', 1, 1, { title: 'Second' });
    const cw = getContinueWatching();
    expect(cw).toHaveLength(2);
    expect(cw[0].meta?.title).toBe('Second');
  });
});

describe('notifications', () => {
  it('starts empty', () => {
    expect(getNotifications()).toEqual([]);
  });

  it('adds and retrieves notifications', () => {
    addNotification('1', 'Show', 1, 1, 'Ep 1', 'new_episode', '2025-01-01');
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].showTitle).toBe('Show');
    expect(notifs[0].episodeTitle).toBe('Ep 1');
  });

  it('returns a unique ID on add', () => {
    const id1 = addNotification('1', 'Show', 1, 1, 'Ep 1', 'new_episode', null);
    const id2 = addNotification('1', 'Show', 1, 2, 'Ep 2', 'new_episode', null);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('removes a notification by ID', () => {
    const id = addNotification('1', 'Show', 1, 1, 'Ep', 'new_episode', null);
    addNotification('1', 'Show', 1, 2, 'Ep 2', 'new_episode', null);
    removeNotification(id);
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].episode).toBe(2);
  });

  it('marks all notifications as read', () => {
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    addNotification('1', 'Show', 1, 2, null, 'new_episode', null);
    markAllNotificationsRead();
    const notifs = getNotifications();
    expect(notifs.every((n) => n.read)).toBe(true);
  });

  it('clears all notifications', () => {
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    clearAllNotifications();
    expect(getNotifications()).toEqual([]);
  });

  it('detects already notified entries', () => {
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    expect(isAlreadyNotified('1', 1, 1)).toBe(true);
    expect(isAlreadyNotified('1', 1, 2)).toBe(false);
    expect(isAlreadyNotified('2', 1, 1)).toBe(false);
  });

  it('does not re-add a notification after it was removed', () => {
    const id = addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    removeNotification(id);
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    expect(getNotifications()).toHaveLength(0);
  });

  it('does not re-add cleared notifications, but notifies new episodes', () => {
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    addNotification('2', 'Other', 2, 5, null, 'new_episode', null);
    clearAllNotifications();
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    addNotification('1', 'Show', 1, 2, null, 'new_episode', null);
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].episode).toBe(2);
  });

  it('forgets a dismissal once the episode is watched', () => {
    const id = addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    removeNotification(id);
    markWatched('tv', '1', 'Show', 1, 1);
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    const notifs = getNotifications();
    expect(notifs.some((n) => n.season === 1 && n.episode === 1)).toBe(false);
  });

  it('caps at NOTIFICATIONS_MAX (50)', () => {
    for (let i = 0; i < 60; i++) {
      addNotification('1', 'Show', 1, i, null, 'new_episode', null);
    }
    const notifs = getNotifications();
    expect(notifs).toHaveLength(50);
  });

  it('prunes notifications whose episode aired more than a week ago', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
    addNotification('1', 'Old', 1, 1, 'Ep 1', 'new_episode', daysAgo(20));
    addNotification('1', 'New', 1, 2, 'Ep 2', 'new_episode', daysAgo(2));
    pruneOldNotifications();
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].showTitle).toBe('New');
  });

  it('prunes notifications without an air date when created more than a week ago', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const old = [{
      id: 'old', showId: '1', showTitle: 'Old', season: 1, episode: 1,
      episodeTitle: null, type: 'new_episode', airDate: null,
      createdAt: Date.now() - 20 * DAY, read: false,
    }];
    const fresh = [{
      id: 'fresh', showId: '1', showTitle: 'New', season: 1, episode: 2,
      episodeTitle: null, type: 'new_episode', airDate: null,
      createdAt: Date.now(), read: false,
    }];
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify([...old, ...fresh]));
    pruneOldNotifications();
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].showTitle).toBe('New');
  });

  it('leaves recent notifications untouched', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
    addNotification('1', 'A', 1, 1, null, 'new_episode', daysAgo(1));
    addNotification('1', 'B', 1, 2, null, 'new_episode', daysAgo(6));
    pruneOldNotifications();
    expect(getNotifications()).toHaveLength(2);
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

  it('caps at SEARCH_HISTORY_MAX (15)', () => {
    for (let i = 0; i < 20; i++) {
      addSearchHistory(`term-${i}`);
    }
    expect(getSearchHistory()).toHaveLength(15);
  });
});

describe('series watched flag', () => {
  it('marks and unmarks a series', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    expect(isSeriesWatched('1')).toBe(true);
    expect(isWatched('tv', '1')).toBe(true);
    unmarkSeriesWatched('1');
    expect(isSeriesWatched('1')).toBe(false);
    expect(isWatched('tv', '1')).toBe(false);
  });

  it('keeps episodes isolated from the series flag', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markSeriesWatched('1', 'Show', 'p.jpg');
    expect(isSeriesWatched('1')).toBe(true);
    expect(getWatchedCount('1', 1, 10)).toBe(1);
    expect(getWatchedEpisodeSet('1', 1)).toEqual(new Set([1]));
    expect(isWatched('tv', '1', 1, 1)).toBe(true);
    expect(isWatched('tv', '1', 2, 1)).toBe(false);
  });

  it('records the source and time of the mark', () => {
    markSeriesWatched('1', 'Show', 'p.jpg', 'auto');
    const autoFlag = getSeriesWatchedFlag('1');
    expect(autoFlag.watched).toBe(true);
    expect(autoFlag.source).toBe('auto');
    expect(typeof autoFlag.watchedAt).toBe('number');
    markSeriesWatched('2', 'Show 2', 'p.jpg', 'explicit');
    const explicitFlag = getSeriesWatchedFlag('2');
    expect(explicitFlag.watched).toBe(true);
    expect(explicitFlag.source).toBe('explicit');
  });

  it('appears in last seen with null season/episode', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    const seen = getLastSeen();
    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('tv');
    expect(seen[0].season).toBeNull();
    expect(seen[0].episode).toBeNull();
    expect(seen[0].title).toBe('Show');
  });

  it('is ignored by getLastWatchedEpisode', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    expect(getLastWatchedEpisode('1')).toBeNull();
  });

  it('unmarking via markUnwatched(tv, id) removes only the flag', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    markWatched('tv', '1', 'Show', 1, 1);
    markUnwatched('tv', '1');
    expect(isSeriesWatched('1')).toBe(false);
    expect(isWatched('tv', '1', 1, 1)).toBe(true);
  });

  it('sync sets an auto flag when every episode is watched', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    markWatched('tv', '1', 'Show', 1, 2);
    markWatched('tv', '1', 'Show', 2, 1);
    syncSeriesWatchedFlag('1', [
      { season_number: 1, episode_count: 2 },
      { season_number: 2, episode_count: 1 },
    ], 'Show', 'p.jpg');
    const flag = getSeriesWatchedFlag('1');
    expect(flag.watched).toBe(true);
    expect(flag.source).toBe('auto');
  });

  it('sync clears an auto flag when episodes are missing', () => {
    markSeriesWatched('1', 'Show', 'p.jpg', 'auto');
    markWatched('tv', '1', 'Show', 1, 1);
    syncSeriesWatchedFlag('1', [{ season_number: 1, episode_count: 2 }], 'Show', 'p.jpg');
    expect(isSeriesWatched('1')).toBe(false);
  });

  it('sync never clears an explicit flag', () => {
    markSeriesWatched('1', 'Show', 'p.jpg', 'explicit');
    markWatched('tv', '1', 'Show', 1, 1);
    syncSeriesWatchedFlag('1', [{ season_number: 1, episode_count: 2 }], 'Show', 'p.jpg');
    expect(isSeriesWatched('1')).toBe(true);
  });

  it('sync does nothing when there are no seasons', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    syncSeriesWatchedFlag('1', [], 'Show', 'p.jpg');
    expect(isSeriesWatched('1')).toBe(false);
  });

  it('markSeriesWatched is idempotent', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    markSeriesWatched('1', 'Show', 'p.jpg');
    expect(getLastSeen()).toHaveLength(1);
  });

  it('lists all series flags with their metadata', () => {
    markSeriesWatched('1', 'Show A', 'a.jpg', 'explicit');
    markSeriesWatched('2', 'Show B', 'b.jpg', 'auto');
    const shows = getSeriesWatchedShows();
    expect(shows).toHaveLength(2);
    const a = shows.find((s) => s.id === '1');
    expect(a?.title).toBe('Show A');
    expect(a?.poster).toBe('a.jpg');
    expect(a?.source).toBe('explicit');
    expect(typeof a?.watchedAt).toBe('number');
    const b = shows.find((s) => s.id === '2');
    expect(b?.source).toBe('auto');
  });
});

describe('getStats', () => {
  it('returns zero counts when nothing exists', () => {
    const stats = getStats();
    expect(stats.moviesWatched).toBe(0);
    expect(stats.episodesWatched).toBe(0);
    expect(stats.seriesWatched).toBe(0);
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
    expect(stats.seriesWatched).toBe(0);
  });

  it('counts series watched flags separately from episodes', () => {
    markSeriesWatched('1', 'Show', '');
    markWatched('tv', '1', 'Show', 1, 1);
    const stats = getStats();
    expect(stats.seriesWatched).toBe(1);
    expect(stats.episodesWatched).toBe(1);
  });

  it('counts episode watch later items', () => {
    addEpisodeWatchLater('1', 1, 1, 'Show');
    const stats = getStats();
    expect(stats.watchLaterCount).toBe(1);
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

describe('calendar timezone', () => {
  it('defaults to the system zone', () => {
    expect(getTimezone()).toBe('');
    expect(getEffectiveTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('persists the selected zone', () => {
    setTimezone('Pacific/Auckland');
    expect(getTimezone()).toBe('Pacific/Auckland');
    expect(getEffectiveTimezone()).toBe('Pacific/Auckland');
  });

  it('falls back to the system zone for unknown values', () => {
    localStorage.setItem('display_timezone', 'Not/AZone');
    expect(getEffectiveTimezone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('clearAllData', () => {
  it('clears watched entries', () => {
    markWatched('movie', '1', 'Movie');
    markWatched('tv', '1', 'Show', 1, 1);
    markSeriesWatched('1', 'Show', 'p.jpg');
    clearAllData();
    expect(isWatched('movie', '1')).toBe(false);
    expect(isWatched('tv', '1', 1, 1)).toBe(false);
    expect(isSeriesWatched('1')).toBe(false);
  });

  it('clears watching entries', () => {
    markWatching('movie', '1');
    clearAllData();
    expect(getWatching('movie', '1')).toBeNull();
  });

  it('clears watch later', () => {
    addWatchLater('movie', '1', 'Test', '2024', '');
    clearAllData();
    expect(getWatchLater()).toEqual([]);
  });

  it('clears episode watch later', () => {
    addEpisodeWatchLater('1', 1, 1, 'Show');
    clearAllData();
    expect(getEpisodeWatchLater()).toEqual([]);
  });

  it('clears search history', () => {
    addSearchHistory('hello');
    clearAllData();
    expect(getSearchHistory()).toEqual([]);
  });

  it('clears notifications', () => {
    addNotification('1', 'Show', 1, 1, null, 'new_episode', null);
    clearAllData();
    expect(getNotifications()).toEqual([]);
  });

  it('clears the watched_index key (ghost fix)', () => {
    markWatched('tv', '1', 'Show', 1, 1);
    clearAllData();
    const watchedIndexRaw = localStorage.getItem('watched_index');
    expect(watchedIndexRaw).toBeNull();
  });

  it('clears the progress_index key (ghost fix)', () => {
    markWatching('tv', '1', 1, 1);
    clearAllData();
    const progressIndexRaw = localStorage.getItem('progress_index');
    expect(progressIndexRaw).toBeNull();
  });

  it('preserves video_source setting', () => {
    setVideoSource('2embed');
    clearAllData();
    expect(getVideoSource()).toBe('2embed');
  });

  it('leaves unrelated localStorage keys intact', () => {
    localStorage.setItem('unrelated_key', 'should remain');
    clearAllData();
    expect(localStorage.getItem('unrelated_key')).toBe('should remain');
  });
});

describe('export / import', () => {
  it('exports watched, watching, and other app keys', () => {
    markWatched('movie', '1', 'Movie');
    markWatching('tv', '1', 1, 1);
    addSearchHistory('test');
    const data = exportData();
    expect(data[`watched:movie-1`]).toBeTruthy();
    expect(data[`progress:tv-1-S1E1`]).toBeTruthy();
    expect(data['search_history']).toBeTruthy();
  });

  it('does not export video_source', () => {
    setVideoSource('2embed');
    const data = exportData();
    expect(data['video_source']).toBeUndefined();
  });

  it('exports and imports series flags', () => {
    markSeriesWatched('1', 'Show', 'p.jpg');
    const data = exportData();
    expect(data['watched:tv-1']).toBeTruthy();
    localStorage.clear();
    const imported = importData(data, 'merge');
    expect(imported).toBeGreaterThan(0);
    expect(isSeriesWatched('1')).toBe(true);
  });

  it('import merges data on top of existing', () => {
    markWatched('movie', '1', 'Existing');
    importData({ 'watched:movie-2': JSON.stringify({ type: 'movie', id: '2', title: 'Imported', watchedAt: 100 }) }, 'merge');
    expect(isWatched('movie', '1')).toBe(true);
    expect(isWatched('movie', '2')).toBe(true);
  });

  it('import replace clears existing before loading', () => {
    markWatched('movie', '1', 'Existing');
    importData({ 'watched:movie-2': JSON.stringify({ type: 'movie', id: '2', title: 'Replaced', watchedAt: 100 }) }, 'replace');
    expect(isWatched('movie', '1')).toBe(false);
    expect(isWatched('movie', '2')).toBe(true);
  });

  it('import merge unions watch later lists instead of replacing', () => {
    addWatchLater('movie', '1', 'Local', '2024', '');
    const incoming = JSON.stringify([
      { type: 'movie', id: '1', title: 'Local', year: '2024', poster: '', addedAt: 1 },
      { type: 'movie', id: '2', title: 'Imported', year: '2023', poster: '', addedAt: 2 },
    ]);
    importData({ watchlater: incoming }, 'merge');
    const list = getWatchLater();
    expect(list).toHaveLength(2);
    expect(list.some((i) => String(i.id) === '1')).toBe(true);
    expect(list.some((i) => String(i.id) === '2')).toBe(true);
  });

  it('import merge unions search history case-insensitively', () => {
    addSearchHistory('Hello');
    importData({ search_history: JSON.stringify(['hello', 'world']) }, 'merge');
    expect(getSearchHistory()).toEqual(['Hello', 'world']);
  });

  it('import treats null values as removals, not "null" strings', () => {
    addWatchLater('movie', '1', 'Test', '2024', '');
    importData({ watchlater: null }, 'merge');
    expect(getWatchLater()).toEqual([]);
  });
});

describe('removeSearchHistory', () => {
  it('removes a query case-insensitively and keeps the rest', () => {
    addSearchHistory('Hello');
    addSearchHistory('world');
    removeSearchHistory('HELLO');
    expect(getSearchHistory()).toEqual(['world']);
  });

  it('ignores blank queries', () => {
    addSearchHistory('hello');
    removeSearchHistory('   ');
    expect(getSearchHistory()).toEqual(['hello']);
  });
});

// An index entry whose value was removed out-of-band (partial wipe, manual
// edit, failed migration) must be skipped and healed - not rendered as a
// ghost entry fabricated from the key alone.
describe('dangling watched-index keys', () => {
  it('getStats does not count keys whose value is missing', () => {
    markWatched('movie', '550', 'Fight Club');
    expect(getStats().moviesWatched).toBe(1);
    localStorage.removeItem('watched:movie-550');
    expect(getStats().moviesWatched).toBe(0);
  });

  it('getLastSeen skips rows whose watched value is missing', () => {
    markWatched('tv', '1399', 'Game of Thrones', 1, 1);
    expect(getLastSeen()).toHaveLength(1);
    localStorage.removeItem('watched:tv-1399-S1E1');
    expect(getLastSeen()).toEqual([]);
  });

  it('getSeriesWatchedShows skips shows whose flag is missing', () => {
    markSeriesWatched('1399', 'Game of Thrones', '/p.jpg');
    expect(getSeriesWatchedShows()).toHaveLength(1);
    localStorage.removeItem('watched:tv-1399');
    expect(getSeriesWatchedShows()).toEqual([]);
  });

  it('heals the index so later reads stay clean', () => {
    markWatched('movie', '550', 'Fight Club');
    localStorage.removeItem('watched:movie-550');
    getStats();
    const index = JSON.parse(localStorage.getItem('watched_index') || '[]') as string[];
    expect(index).not.toContain('watched:movie-550');
  });
});
