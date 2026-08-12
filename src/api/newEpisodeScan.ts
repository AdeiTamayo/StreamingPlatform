import { getTVDetail, getSeasonDetails } from './tmdb';
import {
  getWatchLater,
  getEpisodeWatchLater,
  getSeriesWatchedShows,
  isWatched,
  isAlreadyNotified,
  addNotification,
  unmarkSeriesWatched,
  isInWatchLater,
  addWatchLater,
  NEW_EPISODE_SCAN_KEY,
} from './storage';
import type { TMDBSeries, TMDBEpisode } from '../types';

const SCAN_MIN_INTERVAL_MS = 60 * 60 * 1000;
const MAX_NOTIFICATIONS = 10;
const MAX_SHOWS = 15;

let scanInProgress = false;

export function isNewEpisodeScanThrottled(): boolean {
  try {
    const last = Number(localStorage.getItem(NEW_EPISODE_SCAN_KEY) || 0);
    return last > 0 && Date.now() - last < SCAN_MIN_INTERVAL_MS;
  } catch {
    return false;
  }
}

interface ScanCandidate {
  id: string;
  title: string;
  year: string;
  poster: string;
  watchedAt: number;
}

function collectCandidates(): ScanCandidate[] {
  const seen = new Set<string>();
  const candidates: ScanCandidate[] = [];

  function push(c: ScanCandidate) {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    candidates.push(c);
  }

  for (const wl of getWatchLater()) {
    if (wl.type !== 'tv') continue;
    push({ id: String(wl.id), title: wl.title, year: wl.year, poster: wl.poster, watchedAt: 0 });
  }
  for (const flag of getSeriesWatchedShows()) {
    push({ id: flag.id, title: flag.title, year: '', poster: flag.poster, watchedAt: flag.watchedAt });
  }

  return candidates.slice(0, MAX_SHOWS);
}

function addEpisodeNotification(showId: string | number, showTitle: string, season: number, episode: TMDBEpisode): boolean {
  if (!episode.air_date) return false;
  if (new Date(episode.air_date).getTime() > Date.now()) return false;
  if (isWatched('tv', showId, season, episode.episode_number)) return false;
  if (isAlreadyNotified(showId, season, episode.episode_number)) return false;
  addNotification(showId, showTitle, season, episode.episode_number, episode.name || null, 'new_episode', episode.air_date);
  return true;
}

// Detects new episodes for watch-later shows and series marked as watched
// without requiring a visit to the series page. Adds new-episode
// notifications and moves watched series with unwatched new episodes to
// Watch Later. Throttled to one full run per hour unless forced.
export async function scanForNewEpisodes(force = false): Promise<number> {
  if (scanInProgress) return 0;
  if (!force && isNewEpisodeScanThrottled()) return 0;

  scanInProgress = true;
  try {
    const candidates = collectCandidates();
    let added = 0;

    for (const show of candidates) {
      if (added >= MAX_NOTIFICATIONS) break;
      try {
        const detail = (await getTVDetail(show.id)) as TMDBSeries;
        const seasons = (detail.seasons || []).filter((s) => s.season_number > 0);
        const latest = seasons[seasons.length - 1];
        if (!latest) continue;
        const eps = ((await getSeasonDetails(show.id, latest.season_number)) as { episodes: TMDBEpisode[] }).episodes || [];

        for (const ep of eps) {
          if (added >= MAX_NOTIFICATIONS) break;
          if (addEpisodeNotification(show.id, detail.name || show.title, latest.season_number, ep)) added++;
        }

        if (show.watchedAt > 0) {
          const hasUnwatchedNewEpisodes = eps.some(
            (ep: TMDBEpisode) =>
              !!ep.air_date &&
              new Date(ep.air_date).getTime() > show.watchedAt &&
              !isWatched('tv', show.id, latest.season_number, ep.episode_number),
          );
          if (hasUnwatchedNewEpisodes) {
            unmarkSeriesWatched(show.id);
            if (!isInWatchLater('tv', show.id)) {
              addWatchLater('tv', show.id, show.title, show.year, show.poster);
            }
          }
        }
      } catch {
        // Offline, aborted or TMDB error - skip this show
      }
    }

    // Episode watch-later items are tracked per episode - check those too.
    const epwlItems = getEpisodeWatchLater();
    if (epwlItems.length > 0 && added < MAX_NOTIFICATIONS) {
      const byShow = new Map<string, typeof epwlItems>();
      for (const item of epwlItems) {
        const key = String(item.showId);
        if (!byShow.has(key)) byShow.set(key, []);
        byShow.get(key)!.push(item);
      }
      for (const [showId, items] of byShow) {
        if (added >= MAX_NOTIFICATIONS) break;
        const seasonsToCheck = [...new Set(items.map((i) => i.season))];
        for (const seasonNum of seasonsToCheck) {
          if (added >= MAX_NOTIFICATIONS) break;
          try {
            const eps = ((await getSeasonDetails(showId, seasonNum)) as { episodes: TMDBEpisode[] }).episodes || [];
            for (const item of items) {
              if (added >= MAX_NOTIFICATIONS) break;
              if (item.season !== seasonNum) continue;
              const ep = eps.find((e) => e.episode_number === item.episode);
              if (!ep) continue;
              if (addEpisodeNotification(showId, item.showTitle, seasonNum, ep)) added++;
            }
          } catch {
            // Skip on fetch errors
          }
        }
      }
    }

    localStorage.setItem(NEW_EPISODE_SCAN_KEY, String(Date.now()));
    return added;
  } finally {
    scanInProgress = false;
  }
}
