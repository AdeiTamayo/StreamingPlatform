import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api/tmdb', () => ({
  getTVDetail: vi.fn(),
  getSeasonDetails: vi.fn(),
}));

import { scanForNewEpisodes, isNewEpisodeScanThrottled } from './newEpisodeScan';
import { getTVDetail, getSeasonDetails } from './tmdb';
import {
  markWatched,
  addWatchLater,
  getWatchLater,
  getNotifications,
  isSeriesWatched,
  isInWatchLater,
} from './storage';

const mockedGetTVDetail = vi.mocked(getTVDetail);
const mockedGetSeasonDetails = vi.mocked(getSeasonDetails);

const DAY = 24 * 60 * 60 * 1000;
const DAYS_AGO = (days: number) => new Date(Date.now() - days * DAY).toISOString().slice(0, 10);

function setOldSeriesFlag(showId: string, title: string, daysAgo: number): void {
  localStorage.setItem(`watched:tv-${showId}`, JSON.stringify({
    type: 'tv',
    id: showId,
    title,
    watchedAt: Date.now() - daysAgo * DAY,
    meta: { title, poster: 'p.jpg', source: 'explicit' },
  }));
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('scanForNewEpisodes', () => {
  it('moves a watched series to watch later when a new episode aired after the mark', async () => {
    setOldSeriesFlag('1', 'Show', 10);
    markWatched('tv', '1', 'Show', 1, 1);
    mockedGetTVDetail.mockResolvedValue({ name: 'Show', seasons: [{ season_number: 1, episode_count: 2 }] });
    mockedGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: DAYS_AGO(20) },
        { episode_number: 2, air_date: DAYS_AGO(1) },
      ],
    });

    const added = await scanForNewEpisodes(true);

    expect(added).toBe(1);
    expect(isSeriesWatched('1')).toBe(false);
    expect(isInWatchLater('tv', '1')).toBe(true);
    const notifs = getNotifications();
    expect(notifs).toHaveLength(1);
    expect(notifs[0].episode).toBe(2);
    expect(notifs[0].showTitle).toBe('Show');
  });

  it('does not move the series when the new episode is already watched', async () => {
    setOldSeriesFlag('1', 'Show', 10);
    markWatched('tv', '1', 'Show', 1, 2);
    mockedGetTVDetail.mockResolvedValue({ name: 'Show', seasons: [{ season_number: 1, episode_count: 2 }] });
    mockedGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: DAYS_AGO(20) },
        { episode_number: 2, air_date: DAYS_AGO(1) },
      ],
    });

    await scanForNewEpisodes(true);

    expect(isSeriesWatched('1')).toBe(true);
    expect(isInWatchLater('tv', '1')).toBe(false);
  });

  it('adds notifications for watch-later shows without moving them', async () => {
    addWatchLater('tv', '2', 'Show 2', '2024', 'p.jpg');
    mockedGetTVDetail.mockResolvedValue({ name: 'Show 2', seasons: [{ season_number: 1, episode_count: 1 }] });
    mockedGetSeasonDetails.mockResolvedValue({
      episodes: [{ episode_number: 1, air_date: DAYS_AGO(1) }],
    });

    const added = await scanForNewEpisodes(true);

    expect(added).toBe(1);
    expect(getNotifications()).toHaveLength(1);
    expect(isInWatchLater('tv', '2')).toBe(true);
    expect(isSeriesWatched('2')).toBe(false);
  });

  it('skips future episodes and episodes without air dates', async () => {
    addWatchLater('tv', '2', 'Show 2', '2024', 'p.jpg');
    mockedGetTVDetail.mockResolvedValue({ name: 'Show 2', seasons: [{ season_number: 1, episode_count: 2 }] });
    mockedGetSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: DAYS_AGO(-1) },
        { episode_number: 2, air_date: null },
      ],
    });

    const added = await scanForNewEpisodes(true);

    expect(added).toBe(0);
    expect(getNotifications()).toHaveLength(0);
  });

  it('deduplicates candidates between watch later and series flags', async () => {
    addWatchLater('tv', '1', 'Show', '2024', 'wl.jpg');
    setOldSeriesFlag('1', 'Show', 10);
    mockedGetTVDetail.mockResolvedValue({ name: 'Show', seasons: [{ season_number: 1, episode_count: 1 }] });
    mockedGetSeasonDetails.mockResolvedValue({ episodes: [] });

    await scanForNewEpisodes(true);

    expect(mockedGetTVDetail).toHaveBeenCalledTimes(1);
  });

  it('throttles background scans to one per hour', async () => {
    addWatchLater('tv', '2', 'Show 2', '2024', 'p.jpg');
    mockedGetTVDetail.mockResolvedValue({ name: 'Show 2', seasons: [] });
    mockedGetSeasonDetails.mockResolvedValue({ episodes: [] });

    await scanForNewEpisodes(true);
    expect(isNewEpisodeScanThrottled()).toBe(true);

    mockedGetTVDetail.mockClear();
    const added = await scanForNewEpisodes(false);

    expect(added).toBe(0);
    expect(mockedGetTVDetail).not.toHaveBeenCalled();
  });

  it('ignores watch-later movies', async () => {
    addWatchLater('movie', '9', 'Film', '2024', 'p.jpg');
    await scanForNewEpisodes(true);
    expect(mockedGetTVDetail).not.toHaveBeenCalled();
    expect(getWatchLater()).toHaveLength(1);
  });
});
