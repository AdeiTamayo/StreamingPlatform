import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getTVDetail, getSeasonDetails, getTVExternalIds, getEpisodeExternalIds, imageUrl } from '../api/tmdb';
import { getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { getImdbRating, type ImdbRating } from '../api/omdb';
import { isWatched, markWatched, markUnwatched, getLastWatchedEpisode, isInWatchLater, addWatchLater, removeWatchLater, getWatchedCount, isInEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, markSeasonWatched, markAllSeasonsWatched, unmarkAllSeasonsWatched, getVideoSource, setVideoSource as persistVideoSource, getEpisodeWatchLater, isAlreadyNotified, addNotification, getWatchedEpisodeSet, markSeriesWatched, unmarkSeriesWatched, getSeriesWatchedFlag, syncSeriesWatchedFlag } from '../api/storage';
import Player from '../components/Player';
import EpisodeDropdown from '../components/EpisodeDropdown';
import SeasonDropdown from '../components/SeasonDropdown';
import FilterDropdown from '../components/FilterDropdown';
import MediaCard from '../components/MediaCard';
import PersonList from '../components/PersonList';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { logDebug } from '../utils/logger';
import type { TMDBSeries, TMDBMovie, TMDBSeason, TMDBEpisode, TMDBVideo, EpisodeWatchLaterItem } from '../types';
import styles from './TVDetail.module.css';

const AUTO_WATCH_REMAINING_SECONDS = 5 * 60;

// A plain unmodified left-click (no Ctrl/Cmd/Shift/Alt and not the middle
// button) - the only case where we want client-side state to react too.
// Modified clicks let the browser open the link in a new tab instead.
function isPlainLeftClick(e: { defaultPrevented?: boolean; button?: number; metaKey?: boolean; altKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey;
}

const EpisodeDot = memo(function EpisodeDot({ ep, name, current, done, onClick }: { ep: number; name?: string; current: boolean; done: boolean; onClick: (ep: number) => void }) {
  const label = name ? `E${ep} \u00b7 ${name}` : `Episode ${ep}`;
  return (
    <span className={styles.spDotWrap} role="listitem">
      <button
        type="button"
        className={`${styles.spDot} ${current ? styles.current : ''} ${done ? styles.done : ''}`}
        onClick={() => onClick(ep)}
        title={label}
        aria-label={`${label}${done ? ', watched' : ''}${current ? ', current' : ''}`}
      />
    </span>
  );
});

export default function TVDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const urlSeason = searchParams.get('season');
  const urlEpisode = searchParams.get('episode');
  const [show, setShow] = useState<TMDBSeries | null>(null);
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [seriesWatched, setSeriesWatched] = useState(false);
  const [inWL, setInWL] = useState(false);
  const [inEpWL, setInEpWL] = useState(false);
  const [watchedCount, setWatchedCount] = useState(0);
  const [watchedMap, setWatchedMap] = useState<Record<number, boolean>>({});
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [episodesError, setEpisodesError] = useState(false);
  const [episodeFetchTick, setEpisodeFetchTick] = useState(0);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(null);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [epImdbId, setEpImdbId] = useState<string | null>(null);
  const [epImdbRating, setEpImdbRating] = useState<ImdbRating | null>(null);
  const [epImdbRatings, setEpImdbRatings] = useState<Record<number, ImdbRating | null>>({});
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const [playerOpen, setPlayerOpen] = useState(false);
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef<string | null>(null);
  const playerWrapRef = useRef<HTMLDivElement | null>(null);
  const { getSignal } = useAbortController();

  const seasons: TMDBSeason[] = useMemo(() => show?.seasons?.filter((s) => s.season_number > 0) || [], [show]);
  const currentSeason = useMemo(() => seasons.find((s) => s.season_number === season), [seasons, season]);
  const episodeCount = currentSeason?.episode_count || 0;
  const episodeNums = useMemo(() => Array.from({ length: episodeCount }, (_, i) => i + 1), [episodeCount]);
  const episodeNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const ep of episodes) {
      if (ep.name) map.set(ep.episode_number, ep.name);
    }
    return map;
  }, [episodes]);
  const seasonIdx = seasons.findIndex((s) => s.season_number === season);
  const hasPrev = episode > 1 || seasonIdx > 0;
  const hasNext = episodeCount > 0 && (episode < episodeCount || seasonIdx < seasons.length - 1);

  function allWatched(): boolean {
    if (!id) return false;
    return seasons.length > 0 && seasons.every(s => getWatchedCount(id, s.season_number, s.episode_count) >= s.episode_count);
  }

  function lastWatchedInSeason(showId: string, seasonNum: number): number {
    const set = getWatchedEpisodeSet(showId, seasonNum);
    if (set.size === 0) return 1;
    return Math.max(...set);
  }

  // Fetch show details (one effect per id - URL params are applied
  // separately below so changing ?season= never refetches the show).
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    watchedRef.current = false;
    autoWatchedRef.current = null;
    setTrailerKey(null);
    setShowTrailer(false);
    setEpisodes([]);
    setEpImdbId(null);
    setEpImdbRating(null);
    getTVDetail(id, getSignal())
      .then((data) => {
        const showData = data as TMDBSeries;
        setShow(showData);
        document.title = `${showData.name} - StreamFlow`;
        setInWL(isInWatchLater('tv', id));
        // /tv/{id} does not include imdb_id; it lives in external_ids.
        setImdbId(showData.imdb_id || null);
        if (!showData.imdb_id) {
          getTVExternalIds(id, getSignal())
            .then((ext) => {
              setImdbId(((ext as { imdb_id?: string })?.imdb_id) || null);
            })
            .catch(() => {});
        }
        const vids = showData.videos?.results || [];
        const yt = vids.find((v: TMDBVideo) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
        const s: TMDBSeason[] = showData.seasons?.filter((s: TMDBSeason) => s.season_number > 0) || [];
        if (s.length === 0) return;
        const last = getLastWatchedEpisode(id);
        if (last && s.find((seasonItem: TMDBSeason) => seasonItem.season_number === last.season)) {
          setSeason(last.season);
          setEpisode(last.episode);
        } else {
          setSeason(s[0].season_number);
          setEpisode(1);
        }
      })
      .catch((err: Error) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep links (?season=&episode=) switch the selected episode without
  // refetching the show.
  useEffect(() => {
    if (!show || !id) return;
    const requestedSeason = Number(urlSeason);
    const requestedEpisode = Number(urlEpisode);
    const valid =
      Number.isInteger(requestedSeason) &&
      Number.isInteger(requestedEpisode) &&
      requestedSeason > 0 &&
      requestedEpisode > 0 &&
      seasons.some((s) => s.season_number === requestedSeason);
    if (!valid) return;
    setSeason(requestedSeason);
    setEpisode(requestedEpisode);
    setPlayerOpen(true);
  }, [urlSeason, urlEpisode, show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser Back/Forward changes the URL without touching playerOpen, so
  // mirror it: landing on the bare /tv/{id} URL (no episode params) always
  // shows the episode list. This is why Back from an episode used to leave
  // the player UI on screen.
  useEffect(() => {
    if (!show) return;
    if (Number(urlSeason) > 0 && Number(urlEpisode) > 0) return;
    setPlayerOpen(false);
  }, [urlSeason, urlEpisode, show]);

  // A deep link past the end of the season would target a nonexistent
  // episode - clamp it to the season's known episode count.
  useEffect(() => {
    if (!playerOpen || episodeCount <= 0) return;
    if (episode > episodeCount) setEpisode(episodeCount);
  }, [playerOpen, episodeCount, episode]);

  useEffect(() => {
    if (!imdbId) {
      setImdbRating(null);
      return;
    }
    let cancelled = false;
    getImdbRating(imdbId, 'series').then((r) => {
      if (!cancelled) setImdbRating(r);
    });
    return () => { cancelled = true; };
  }, [imdbId]);

  // Episode-level IMDb rating for the currently selected episode.
  useEffect(() => {
    setEpImdbId(null);
    setEpImdbRating(null);
    if (!show || !season || !episode) return;
    let cancelled = false;
    getEpisodeExternalIds(show.id, season, episode)
      .then((ext) => {
        if (cancelled) return;
        const id = ((ext as { imdb_id?: string })?.imdb_id) || null;
        setEpImdbId(id);
        if (id) {
          getImdbRating(id, 'episode', undefined, season, episode).then((r) => {
            if (!cancelled) setEpImdbRating(r);
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [show, season, episode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    setWatched(isWatched('tv', id, season, episode));
    setInEpWL(isInEpisodeWatchLater(id, season, episode));
    watchedRef.current = isWatched('tv', id, season, episode);
    autoWatchedRef.current = null;
  }, [id, season, episode]);

  // Per-episode Watch Later set for the current season - drives the
  // episode-list action buttons and card colors.
  const [epWlSet, setEpWlSet] = useState<Set<number>>(new Set());

  function refreshEpWlSet(showId: string, seasonNum: number) {
    const set = new Set<number>();
    for (const item of getEpisodeWatchLater()) {
      if (String(item.showId) === String(showId) && item.season === seasonNum) {
        set.add(item.episode);
      }
    }
    setEpWlSet(set);
  }

  useEffect(() => {
    if (!id) return;
    refreshEpWlSet(id, season);
  }, [id, season]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    watchedRef.current = watched;
  }, [watched]);

  useEffect(() => {
    autoWatchedRef.current = null;
  }, [season, episode]);

  useEffect(() => {
    if (!id) return;
    setWatchedCount(getWatchedCount(id, season, episodeCount));
  }, [id, season, episodeCount, watched]);

  // Check for new episodes of watch-later shows and of series marked as
  // watched (own controller; the scan must not be aborted by unrelated fetch
  // effects). When a new episode airs after a series was marked as watched,
  // the series is moved from watched to Watch Later. Runs before the flag
  // sync below so the auto flag (set when every episode was watched) is still
  // readable before it gets cleared for incomplete series.
  useEffect(() => {
    if (!show || !id) return;
    const epwlItems: EpisodeWatchLaterItem[] = getEpisodeWatchLater().filter((item: EpisodeWatchLaterItem) => String(item.showId) === String(id));
    const seriesFlag = getSeriesWatchedFlag(id);
    const seriesFlagAt = seriesFlag.watched && seriesFlag.watchedAt ? seriesFlag.watchedAt : null;
    if (!inWL && epwlItems.length === 0 && seriesFlagAt == null) return;
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const now = new Date();
      let added = 0;
      let movedToWatchLater = false;

      if (inWL || seriesFlagAt != null) {
        const latestSeason = seasons[seasons.length - 1];
        if (latestSeason) {
          try {
            const data = await getSeasonDetails(id, latestSeason.season_number, controller.signal);
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];

            if (seriesFlagAt != null && !movedToWatchLater) {
              const hasUnwatchedNewEpisodes = eps.some(
                (ep: TMDBEpisode) =>
                  !!ep.air_date &&
                  new Date(ep.air_date).getTime() > seriesFlagAt &&
                  !isWatched('tv', id, latestSeason.season_number, ep.episode_number),
              );
              if (hasUnwatchedNewEpisodes) {
                unmarkSeriesWatched(id);
                if (!inWL) addWatchLater('tv', id, show.name, (show.first_air_date || '').slice(0, 4), imageUrl(show.poster_path));
                setInWL(true);
                setSeriesWatched(allWatched());
                toast?.('New episodes released - moved to Watch Later');
                movedToWatchLater = true;
              }
            }

            if (inWL || movedToWatchLater) {
              for (const ep of eps) {
                if (added >= 5) break;
                if (!ep.air_date) continue;
                if (new Date(ep.air_date) > now) continue;
                if (new Date(ep.air_date).getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) continue;
                if (isWatched('tv', id, latestSeason.season_number, ep.episode_number)) continue;
                if (isAlreadyNotified(id, latestSeason.season_number, ep.episode_number)) continue;
                addNotification(id, show.name, latestSeason.season_number, ep.episode_number, ep.name, 'new_episode', ep.air_date);
                added++;
              }
            }
          } catch {}
        }
      }

      if (epwlItems.length > 0) {
        const seasonsToCheck = [...new Set(epwlItems.map((item: EpisodeWatchLaterItem) => item.season))];
        for (const seasonNum of seasonsToCheck) {
          if (added >= 5) break;
          try {
            const data = await getSeasonDetails(id, seasonNum, controller.signal);
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];
            for (const epwl of epwlItems) {
              if (added >= 5) break;
              if (epwl.season !== seasonNum) continue;
              const ep = eps.find((e: TMDBEpisode) => e.episode_number === epwl.episode);
              if (!ep || !ep.air_date) continue;
              if (new Date(ep.air_date) > now) continue;
              if (new Date(ep.air_date).getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000) continue;
              if (isWatched('tv', id, seasonNum, epwl.episode)) continue;
              if (isAlreadyNotified(id, seasonNum, epwl.episode)) continue;
              addNotification(id, show.name, seasonNum, epwl.episode, ep.name || `Episode ${epwl.episode}`, 'new_episode', ep.air_date);
              added++;
            }
          } catch {}
        }
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [show, inWL]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the implicit series flag in sync with per-episode state and expose
  // the derived "series watched" status (flag OR all episodes watched) to the
  // header toggle.
  useEffect(() => {
    if (!id || !show || seasons.length === 0) return;
    syncSeriesWatchedFlag(id, seasons, show.name, show?.poster_path ?? '');
    setSeriesWatched(getSeriesWatchedFlag(id).watched || allWatched());
  }, [id, seasons, show, watched, watchedCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watched dots for the current season - recomputed whenever any bulk
  // operation updates the count for it.
  useEffect(() => {
    if (!id) return;
    const set = getWatchedEpisodeSet(id, season, episodeCount);
    const map: Record<number, boolean> = {};
    for (let ep = 1; ep <= episodeCount; ep++) map[ep] = set.has(ep);
    setWatchedMap(map);
  }, [id, season, episodeCount, watchedCount]);

  // Episode list per season - its own controller so it never aborts the
  // show detail fetch (or vice versa).
  useEffect(() => {
    if (!id || seasons.length === 0) return;
    setEpisodesError(false);
    const controller = new AbortController();
    getSeasonDetails(id, season, controller.signal)
      .then((data) => {
        setEpisodes((data as { episodes: TMDBEpisode[] }).episodes || []);
      })
      .catch((err: Error) => {
        if (err?.name !== 'AbortError') setEpisodesError(true);
      });
    return () => controller.abort();
  }, [id, season, seasons.length, episodeFetchTick]);

  // IMDb ratings for the episode list (whole season view): resolves each
  // episode's imdb_id via TMDB and the rating via OMDb, one at a time so the
  // free OMDb tier isn't bursted. Cached per episode for 7 days.
  useEffect(() => {
    setEpImdbRatings({});
    if (playerOpen || !show || episodes.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const ep of episodes) {
        if (cancelled) return;
        let rating: ImdbRating | null = null;
        try {
          const ext = (await getEpisodeExternalIds(show.id, season, ep.episode_number)) as { imdb_id?: string };
          if (cancelled) return;
          if (ext?.imdb_id) rating = await getImdbRating(ext.imdb_id, 'episode', undefined, season, ep.episode_number);
        } catch {}
        if (cancelled) return;
        setEpImdbRatings((prev) => ({ ...prev, [ep.episode_number]: rating }));
      }
    })();
    return () => { cancelled = true; };
  }, [playerOpen, show, season, episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts while the player is open: N = next episode,
  // P = previous episode, W = toggle watched, F = toggle fullscreen.
  // Ignored while typing in a field or with modifier keys held.
  useEffect(() => {
    if (!playerOpen || showTrailer) return;
    function isTypingTarget(t: EventTarget | null): boolean {
      return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'n') {
        if (hasNext) { e.preventDefault(); goNext(); }
      } else if (k === 'p') {
        if (hasPrev) { e.preventDefault(); goPrev(); }
      } else if (k === 'w') {
        toggleWatched();
      } else if (k === 'f') {
        e.preventDefault();
        togglePlayerFullscreen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playerOpen, showTrailer, hasNext, hasPrev, season, episode, watched]); // eslint-disable-line react-hooks/exhaustive-deps

  // L = toggle Watch Later. On the episode view (player open) it targets the
  // current episode; on the series view it targets the series itself.
  // Ignored while typing or with modifiers held.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() !== 'l') return;
      if (!show || !id) return;
      e.preventDefault();
      if (playerOpen) {
        if (inEpWL) {
          removeEpisodeWatchLater(id, season, episode);
          setInEpWL(false);
          toast?.('Episode removed from Watch Later');
        } else {
          addEpisodeWatchLater(id, season, episode, show.name);
          setInEpWL(true);
          toast?.('Episode added to Watch Later');
        }
        return;
      }
      if (inWL) {
        removeWatchLater('tv', id);
        setInWL(false);
        toast?.('Removed from Watch Later');
      } else {
        addWatchLater('tv', id, show.name, (show.first_air_date || '').slice(0, 4), imageUrl(show.poster_path));
        setInWL(true);
        toast?.('Added to Watch Later');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, id, inWL, inEpWL, playerOpen, season, episode, toast]);

  function togglePlayerFullscreen() {
    const el = playerWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen().then(
        () => {
          // Hand keyboard focus to the embed once fullscreen engages, so
          // provider shortcuts (e.g. Space = play/pause) work immediately
          // without clicking the video first.
          el.querySelector('iframe')?.focus();
        },
        () => {},
      );
    }
  }

  function autoMarkWatched() {
    const episodeKey = `${season}-${episode}`;
    if (!show || !id || watchedRef.current || autoWatchedRef.current === episodeKey) return;
    autoWatchedRef.current = episodeKey;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    watchedRef.current = true;
    setWatched(true);
  }

  function handleProgress(currentTime: number, duration: number) {
    if (watchedRef.current || !show || !id) return;

    // Runtime estimate: real duration when the embed reports one, else TMDB
    // metadata for the current episode/series.
    const currentEpisode = episodes.find((item) => item.episode_number === episode);
    const tmdbRuntime = currentEpisode?.runtime || show?.episode_run_time?.[0] || null;
    const runtimeSeconds = duration || (tmdbRuntime ? tmdbRuntime * 60 : null);

    logDebug(`autoWatch check: currentTime=${currentTime} duration=${duration} tmdbRuntime=${tmdbRuntime} runtimeSeconds=${runtimeSeconds} episodesLoaded=${episodes.length}`);

    if (!runtimeSeconds) return;

    const autoWatchThreshold = Math.min(runtimeSeconds * 0.9, runtimeSeconds - AUTO_WATCH_REMAINING_SECONDS);

    if (autoWatchThreshold > 0 && currentTime >= autoWatchThreshold) {
      autoMarkWatched();
    }
  }

  function handleEnded() {
    autoMarkWatched();
  }

  function toggleWatched() {
    if (!show || !id) return;
    if (watched) {
      markUnwatched('tv', id, season, episode);
      setWatched(false);
      toast?.('Removed from watched');
    } else {
      markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
      setWatched(true);
      toast?.('Marked as watched');
    }
  }

  function toggleEpisodeWatched(epNum: number) {
    if (!show || !id) return;
    if (watchedMap[epNum]) {
      markUnwatched('tv', id, season, epNum);
      toast?.(`Episode ${epNum} unmarked`);
    } else {
      markWatched('tv', id, show.name, season, epNum, { title: show.name, poster: show?.poster_path });
      toast?.(`Episode ${epNum} marked as watched`);
    }
    setWatchedCount(getWatchedCount(id, season, episodeCount));
    setWatched(isWatched('tv', id, season, episode));
  }

  function toggleEpisodeWatchLater(epNum: number) {
    if (!show || !id) return;
    if (epWlSet.has(epNum)) {
      removeEpisodeWatchLater(id, season, epNum);
      toast?.(`Episode ${epNum} removed from Watch Later`);
    } else {
      addEpisodeWatchLater(id, season, epNum, show.name);
      toast?.(`Episode ${epNum} added to Watch Later`);
    }
    refreshEpWlSet(id, season);
    if (epNum === episode) {
      setInEpWL(isInEpisodeWatchLater(id, season, epNum));
    }
  }

  function toggleSeriesWatched() {
    if (!show || !id) return;
    if (seriesWatched) {
      const flag = getSeriesWatchedFlag(id);
      if (flag.watched && flag.source === 'explicit') {
        // Dropping only the flag would leave per-episode marks behind and
        // the toggle would flip straight back to Watched with a lying toast.
        // Unmark the episodes too so off really means off.
        unmarkAllSeasonsWatched(id, seasons);
        unmarkSeriesWatched(id);
        setWatchedCount(getWatchedCount(id, season, episodeCount));
        setWatched(isWatched('tv', id, season, episode));
        setSeriesWatched(false);
        toast?.('Series removed from watched');
      } else {
        unmarkAllSeasonsWatched(id, seasons);
        unmarkSeriesWatched(id);
        setWatchedCount(getWatchedCount(id, season, episodeCount));
        setWatched(isWatched('tv', id, season, episode));
        setSeriesWatched(false);
        toast?.('Series removed from watched');
      }
    } else {
      markSeriesWatched(id, show.name, show?.poster_path ?? '', 'explicit');
      setSeriesWatched(true);
      toast?.('Series marked as watched');
    }
  }

  function goPrev() {
    if (episode > 1) {
      setEpisode(episode - 1);
    } else if (seasonIdx > 0) {
      const prevSeason = seasons[seasonIdx - 1];
      setSeason(prevSeason.season_number);
      setEpisode(prevSeason.episode_count || 1);
    }
  }

  function markCurrentWatched() {
    if (watchedRef.current || !show || !id) return;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    watchedRef.current = true;
    setWatched(true);
  }

  function goNext() {
    markCurrentWatched();
    if (episode < episodeCount) {
      setEpisode(episode + 1);
    } else if (seasonIdx < seasons.length - 1) {
      setSeason(seasons[seasonIdx + 1].season_number);
      setEpisode(1);
    }
  }

  function retry() {
    if (!id) return;
    setLoading(true);
    setError(false);
    getTVDetail(id, getSignal()).then((data) => { setShow(data as TMDBSeries); }).catch((err: Error) => { if (err?.name !== 'AbortError') setError(true); }).finally(() => setLoading(false));
  }

  if (!id) return <div className="page"><div className="loading">Show not found</div></div>;
  const safeId = id;

  if (loading) return <div className="page"><div className="loading" role="status">Loading...</div></div>;

  if (error) return (
    <div className="page" role="alert">
      <div className="loading">Failed to load. Check your connection.</div>
      <div className="retry-bar"><button className="watch-toggle" onClick={retry}>Retry</button></div>
    </div>
  );
  if (!show) return <div className="page"><div className="loading">Show not found</div></div>;

  const embedUrl = getTVEmbedUrl(safeId, season, episode, videoSource);
  const backdrop = imageUrl(show.backdrop_path, 'original');
  const year = (show.first_air_date || '').slice(0, 4);
  const ended = show.status === 'Ended';
  const endYear = ended && show.last_air_date ? show.last_air_date.slice(0, 4) : null;
  const cast = show.credits?.cast?.slice(0, 8) || [];
  const created = show.created_by || [];
  const networks = show.networks || [];
  const genres = show.genres?.map((g) => g.name).join(', ') || '';
  const recommendations = show.recommendations?.results?.slice(0, 10) || [];

  return (
    <div className="page">
      <div className="detail-header" style={{ backgroundImage: `url(${backdrop})` }}>
        <div className="detail-header-overlay">
          <div className="detail-poster">
            <img src={imageUrl(show.poster_path)} alt={show.name} />
          </div>
          <div className="detail-meta">
            <h1>{show.name} <span className="year">({endYear ? `${year}-${endYear}` : year})</span></h1>
            <div className="detail-badges">
              {imdbId ? (
                <a
                  className="badge rating"
                  href={`https://www.imdb.com/title/${imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={imdbRating ? `IMDb ${imdbRating.rating}/10${imdbRating.votes ? ` \u00b7 ${imdbRating.votes} votes` : ''}` : 'Open on IMDb'}
                >
                  IMDb{imdbRating ? ` ${imdbRating.rating}` : ''}
                </a>
              ) : show.vote_average != null ? (
                <span className="badge rating">TMDB {show.vote_average.toFixed(1)}</span>
              ) : null}
              {genres && <span className="badge">{genres}</span>}
              <span className="badge">{seasons.length} Seasons</span>
              <button className={`badge-btn ${inWL ? 'in-wl' : ''}`} onClick={() => {
                if (inWL) { removeWatchLater('tv', safeId); setInWL(false); toast?.('Removed from Watch Later'); }
                else { addWatchLater('tv', safeId, show.name, year, imageUrl(show.poster_path)); setInWL(true); toast?.('Added to Watch Later'); }
              }} title={inWL ? 'Remove from Watch Later' : 'Add to Watch Later'}>{inWL ? 'Saved' : 'Watch Later'}</button>
              <button className={`badge-btn ${seriesWatched ? 'in-watched' : ''}`} onClick={toggleSeriesWatched} title={seriesWatched ? 'Unmark series as watched' : 'Mark series as watched'}>{seriesWatched ? '\u2713 Watched' : 'Watched'}</button>
              {trailerKey && (
                <button className="badge-btn" onClick={() => { setShowTrailer((s: boolean) => !s); }} title={showTrailer ? 'Hide trailer' : 'Play trailer'}>
                  {showTrailer ? 'Hide Trailer' : 'Trailer'}
                </button>
              )}
            </div>
            <p className="detail-overview">{show.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast"><strong>Cast:</strong> <PersonList people={cast} /></div>
            )}
            {created.length > 0 && (
              <div className="detail-crew"><strong>Created by:</strong> <PersonList people={created} /></div>
            )}
            {networks.length > 0 && (
              <div className="detail-crew"><strong>Network:</strong> {networks.map((n) => n.name).join(', ')}</div>
            )}
          </div>
        </div>
      </div>

      {playerOpen && seasons.length > 0 ? (
        <section className="section" aria-labelledby="watch-heading-tv">
          <div className={styles.watchHeader}>
            <h2 id="watch-heading-tv" className="section-title">Watch Now</h2>
            <Link className="watch-toggle" to={`/tv/${safeId}`} onClick={(e) => { if (isPlainLeftClick(e)) setPlayerOpen(false); }} style={{ textDecoration: 'none', display: 'inline-block' }}>
              Back to episodes
            </Link>
          </div>
          <div className="episode-selector">
            <label>
              Season:
              <SeasonDropdown
                seasons={seasons}
                value={season}
                onSelect={(s: number) => { setSeason(s); setEpisode(lastWatchedInSeason(safeId, s)); }}
              />
            </label>
            <label>
              <EpisodeDropdown
                showId={safeId}
                season={season}
                episode={episode}
                episodes={episodes}
                onSelect={(ep: number) => { setEpisode(ep); }}
              />
            </label>
            <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
              Watched
            </button>
            <button className={`watch-toggle ${inEpWL ? 'in-wl' : ''}`} onClick={() => {
              if (inEpWL) { removeEpisodeWatchLater(safeId, season, episode); setInEpWL(false); toast?.('Removed from Watch Later'); }
              else { addEpisodeWatchLater(safeId, season, episode, show.name); setInEpWL(true); toast?.('Added to Watch Later'); }
            }}>{inEpWL ? 'Saved' : 'Watch Later'}</button>
            {epImdbId ? (
              <a
                className="badge rating"
                href={`https://www.imdb.com/title/${epImdbId}/`}
                target="_blank"
                rel="noopener noreferrer"
                title={epImdbRating ? `IMDb ${epImdbRating.rating}/10${epImdbRating.votes ? ` \u00b7 ${epImdbRating.votes} votes` : ''}` : 'Open this episode on IMDb'}
              >
                IMDb{epImdbRating ? ` ${epImdbRating.rating}` : ''}
              </a>
            ) : (episodes.find((ep) => ep.episode_number === episode)?.vote_average ?? 0) > 0 ? (
              <span className="badge rating">TMDB {episodes.find((ep) => ep.episode_number === episode)!.vote_average.toFixed(1)}</span>
            ) : null}
          </div>
          {showTrailer && trailerKey ? (
            <div className="trailer-wrapper">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}`}
                title="Trailer"
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                className="player-iframe"
              />
            </div>
          ) : (
            <div ref={playerWrapRef} className="player-fs-wrap">
              <Player
                key={`${season}-${episode}`}
                src={embedUrl}
                title={`${show.name} S${season}E${episode}`}
                onProgress={handleProgress}
                onEnded={handleEnded}
                runtimeMinutes={episodes.find((item) => item.episode_number === episode)?.runtime || show.episode_run_time?.[0] || null}
              />
            </div>
          )}
          <div className={styles.epNav}>
            <div className={styles.epNavCenter}>
              <button className={styles.epNavBtn} disabled={!hasPrev} onClick={goPrev}>&#9664; Prev</button>
              <span className={styles.epNavLabel}>S{season} E{episode}</span>
              <button className={styles.epNavBtn} disabled={!hasNext} onClick={goNext}>Next &#9654;</button>
              <button className={`${styles.epNavWatch} ${watched ? styles.watched : ''}`} onClick={toggleWatched} title={watched ? 'Unmark watched' : 'Mark as watched'}>&#10003;</button>
            </div>
            <FilterDropdown
              value={videoSource}
              options={SOURCE_KEYS.map((key) => ({ value: key, label: getSourceLabel(key) }))}
              placeholder="Source"
              onSelect={(val: string) => { setVideoSource(val); persistVideoSource(val); }}
              className="source-dropdown"
            />
          </div>
          <div className={`${styles.seasonProgress} ${styles.hidden}`}>
            <div className={styles.spBar} role="list" aria-label="Episode progress">
              {episodeNums.map((ep) => (
                <EpisodeDot key={ep} ep={ep} name={episodeNames.get(ep)} current={ep === episode} done={watchedMap[ep]} onClick={setEpisode} />
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="section" aria-labelledby="episodes-heading">
          <div className={styles.browseHeader}>
            <h2 id="episodes-heading" className="section-title">Episodes</h2>
            {seasons.length > 0 && (
              <SeasonDropdown
                seasons={seasons}
                value={season}
                onSelect={(s: number) => { setSeason(s); setEpisode(lastWatchedInSeason(safeId, s)); }}
              />
            )}
            {seasons.length > 0 && (
              <button className={styles.markSeasonBtn} onClick={() => {
                if (allWatched()) {
                  unmarkAllSeasonsWatched(safeId, seasons);
                  toast?.('All episodes unmarked');
                } else {
                  markAllSeasonsWatched(safeId, seasons, show.name, show?.poster_path ?? '');
                  toast?.('All episodes marked as watched');
                }
                setWatchedCount(getWatchedCount(safeId, season, episodeCount));
                setWatched(isWatched('tv', safeId, season, episode));
              }}>{allWatched() ? 'Unmark all watched' : 'Mark all watched'}</button>
            )}
          </div>
          {seasons.length === 0 ? (
            <div className="loading">No seasons available yet.</div>
          ) : (
            <>
              <div className={styles.seasonProgress}>
                <div className={styles.spHeader}>
                  <span className={styles.spLabel}>Season {season}</span>
                  <span className={styles.spCount}>{watchedCount}/{episodeCount} watched</span>
                  {watchedCount < episodeCount && (
                    <button className={styles.markSeasonBtn} onClick={() => {
                      markSeasonWatched(safeId, season, episodeCount, show.name, show?.poster_path ?? '');
                      setWatchedCount(getWatchedCount(safeId, season, episodeCount));
                      setWatched(isWatched('tv', safeId, season, episode));
                      toast?.('Season marked as watched');
                    }}>Mark season watched</button>
                  )}
                </div>
                <div className={styles.spBar} role="list" aria-label="Episode progress">
                  {episodeNums.map((ep) => (
                    <EpisodeDot key={ep} ep={ep} name={episodeNames.get(ep)} current={false} done={watchedMap[ep]} onClick={(e: number) => { setEpisode(e); setPlayerOpen(true); }} />
                  ))}
                </div>
              </div>
              {episodesError ? (
                <div className="loading" role="alert">
                  Failed to load episodes.
                  <div className="retry-bar"><button className="watch-toggle" onClick={() => setEpisodeFetchTick(t => t + 1)}>Retry</button></div>
                </div>
              ) : episodes.length > 0 ? (
                <div className={styles.episodeList}>
                  {episodes.map((ep) => {
                    const isW = !!watchedMap[ep.episode_number];
                    const isWL = epWlSet.has(ep.episode_number);
                    return (
                    <div key={ep.episode_number} className={`${styles.episodeCard} ${ep.episode_number === episode ? styles.current : ''} ${isW ? styles.watched : ''} ${isWL ? styles.watchLater : ''}`}>
                      <Link to={`/tv/${safeId}?season=${season}&episode=${ep.episode_number}`} className={styles.episodeCardLink} aria-label={`E${ep.episode_number}. ${ep.name}`} onClick={(e) => { if (isPlainLeftClick(e)) { setEpisode(ep.episode_number); setPlayerOpen(true); } }}>
                      {ep.still_path && (
                        <div className={styles.episodeCardThumb}>
                          <img src={imageUrl(ep.still_path, 'w300')} alt="" loading="lazy" />
                        </div>
                      )}
                      <div className={styles.episodeCardInfo}>
                        <h3 className={styles.epTitle}>E{ep.episode_number}. {ep.name}</h3>
                        <div className={styles.epMeta}>
                          {ep.air_date && <span>{ep.air_date}</span>}
                          {ep.runtime && <span> &middot; {ep.runtime}m</span>}
                          {epImdbRatings[ep.episode_number] != null ? (
                            <span> &middot; IMDb {epImdbRatings[ep.episode_number]?.rating}</span>
                          ) : ep.vote_average > 0 ? (
                            <span title={`TMDB rating ${ep.vote_average.toFixed(1)}/10`}> &middot; TMDB {ep.vote_average.toFixed(1)}</span>
                          ) : null}
                        </div>
                        {ep.overview && <div className={styles.epOverview}>{ep.overview}</div>}
                      </div>
                      </Link>
                      <span className={styles.epCardActions}>
                        <button
                          type="button"
                          className={`${styles.epActionBtn} ${isW ? styles.activeWatched : ''}`}
                          onClick={() => toggleEpisodeWatched(ep.episode_number)}
                          title={isW ? `Unmark episode ${ep.episode_number} as watched` : `Mark episode ${ep.episode_number} as watched`}
                          aria-label={isW ? `Unmark episode ${ep.episode_number} as watched` : `Mark episode ${ep.episode_number} as watched`}
                          aria-pressed={isW}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4.5 12.5 9.5 17.5 19.5 6.5"/></svg>
                        </button>
                        <button
                          type="button"
                          className={`${styles.epActionBtn} ${isWL ? styles.activeWatchLater : ''}`}
                          onClick={() => toggleEpisodeWatchLater(ep.episode_number)}
                          title={isWL ? `Remove episode ${ep.episode_number} from Watch Later` : `Save episode ${ep.episode_number} to Watch Later`}
                          aria-label={isWL ? `Remove episode ${ep.episode_number} from Watch Later` : `Save episode ${ep.episode_number} to Watch Later`}
                          aria-pressed={isWL}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
                        </button>
                      </span>
                    </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="section" aria-labelledby="recs-heading-tv">
          <h2 id="recs-heading-tv" className="section-title">You might also like</h2>
          <div className="media-grid">
            {recommendations.map((item) => (
              <MediaCard
                key={`${(item as { media_type?: string }).media_type || "tv"}-${(item as { id: number }).id}`}
                item={item as TMDBMovie | TMDBSeries}
                mediaType={(item as { media_type?: string }).media_type === "movie" ? "movie" : "tv"}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
