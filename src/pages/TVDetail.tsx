import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getTVDetail, getSeasonDetails, getTVExternalIds, getEpisodeExternalIds, imageUrl } from '../api/tmdb';
import { getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { getImdbRating, type ImdbRating } from '../api/omdb';
import { isWatched, markWatched, markUnwatched, getLastWatchedEpisode, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater, getWatchedCount, isInEpisodeWatchLater, addEpisodeWatchLater, removeEpisodeWatchLater, markSeasonWatched, markAllSeasonsWatched, unmarkAllSeasonsWatched, getVideoSource, setVideoSource as persistVideoSource, getEpisodeWatchLater, isAlreadyNotified, addNotification, getWatchedEpisodeSet, markSeriesWatched, unmarkSeriesWatched, getSeriesWatchedFlag, syncSeriesWatchedFlag } from '../api/storage';
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
const NEXT_EPISODE_COUNTDOWN_SECONDS = 8;

const EpisodeDot = memo(function EpisodeDot({ ep, current, done, onClick }: { ep: number; current: boolean; done: boolean; onClick: (ep: number) => void }) {
  return (
    <span className={styles.spDotWrap} role="listitem">
      <button
        type="button"
        className={`${styles.spDot} ${current ? styles.current : ''} ${done ? styles.done : ''}`}
        onClick={() => onClick(ep)}
        aria-label={`Episode ${ep}${done ? ', watched' : ''}${current ? ', current' : ''}`}
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
  const [startAt, setStartAt] = useState<number | null>(null);
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
  const [nextUpIn, setNextUpIn] = useState<number | null>(null);
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const { getSignal } = useAbortController();

  const seasons: TMDBSeason[] = useMemo(() => show?.seasons?.filter((s) => s.season_number > 0) || [], [show]);
  const currentSeason = useMemo(() => seasons.find((s) => s.season_number === season), [seasons, season]);
  const episodeCount = currentSeason?.episode_count || 0;
  const episodeNums = useMemo(() => Array.from({ length: episodeCount }, (_, i) => i + 1), [episodeCount]);
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
    const valid = requestedSeason > 0 && requestedEpisode > 0 && seasons.some((s) => s.season_number === requestedSeason);
    if (!valid) return;
    setSeason(requestedSeason);
    setEpisode(requestedEpisode);
    setPlayerOpen(true);
  }, [urlSeason, urlEpisode, show]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const prog = getProgress('tv', id, season, episode);
    setStartAt(prog?.currentTime || null);
    watchedRef.current = isWatched('tv', id, season, episode);
    autoWatchedRef.current = null;
    lastTimeRef.current = null;
    setNextUpIn(null);
  }, [id, season, episode]);

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

  // Leaving the player cancels a running countdown so it can't advance the
  // episode invisibly after "Back to episodes".
  useEffect(() => {
    if (!playerOpen) setNextUpIn(null);
  }, [playerOpen]);

  // Next-episode autoplay countdown started by handleEnded. Ticks down once
  // per second; at zero it advances via goNext() unless the user cancelled.
  useEffect(() => {
    if (nextUpIn === null) return;
    if (nextUpIn <= 0) {
      setNextUpIn(null);
      goNext();
      return;
    }
    const t = setTimeout(() => setNextUpIn((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [nextUpIn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts while the player is open: N = next episode,
  // P = previous episode, W = toggle watched. Ignored while typing in a
  // field or with modifier keys held.
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
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playerOpen, showTrailer, hasNext, hasPrev, season, episode, watched]); // eslint-disable-line react-hooks/exhaustive-deps

  function autoMarkWatched() {
    const episodeKey = `${season}-${episode}`;
    if (!show || !id || watchedRef.current || autoWatchedRef.current === episodeKey) return;
    autoWatchedRef.current = episodeKey;
    markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
    clearProgress('tv', id, season, episode);
    watchedRef.current = true;
    setWatched(true);
    setStartAt(null);
  }

  function handleProgress(currentTime: number, duration: number) {
    lastTimeRef.current = currentTime;

    // Runtime estimate: real duration when the embed reports one, else TMDB
    // metadata for the current episode/series.
    const currentEpisode = episodes.find((item) => item.episode_number === episode);
    const tmdbRuntime = currentEpisode?.runtime || show?.episode_run_time?.[0] || null;
    const runtimeSeconds = duration || (tmdbRuntime ? tmdbRuntime * 60 : null);

    // Arm the up-next countdown BEFORE any early returns. Replays of
    // already-watched episodes bail out at the guard below, and without
    // this block they would never reach it - which is exactly the main
    // scenario where the countdown must still fire.
    if (runtimeSeconds) {
      const nextUpThreshold = Math.min(runtimeSeconds * 0.9, runtimeSeconds - AUTO_WATCH_REMAINING_SECONDS);
      if (nextUpThreshold > 0 && currentTime >= nextUpThreshold) armNextUp();
    }

    if (watchedRef.current || !show || !id) return;

    saveProgress('tv', id, currentTime, season, episode, { title: show?.name, poster: show?.poster_path }, duration || undefined);

    logDebug(`autoWatch check: currentTime=${currentTime} duration=${duration} tmdbRuntime=${tmdbRuntime} runtimeSeconds=${runtimeSeconds} episodesLoaded=${episodes.length}`);

    if (!runtimeSeconds) return;

    const autoWatchThreshold = Math.min(runtimeSeconds * 0.9, runtimeSeconds - AUTO_WATCH_REMAINING_SECONDS);

    if (autoWatchThreshold > 0 && currentTime >= autoWatchThreshold) {
      autoMarkWatched();
    }
  }

  // Arms the up-next countdown once per episode. The ?? form ignores repeat
  // calls from later progress ticks or the ended event, so a running
  // countdown never restarts.
  function armNextUp() {
    if (!hasNext || showTrailer) return;
    setNextUpIn((s) => s ?? NEXT_EPISODE_COUNTDOWN_SECONDS);
  }

  function handleEnded() {
    autoMarkWatched();
    armNextUp();
  }

  function toggleWatched() {
    if (!show || !id) return;
    if (watched) {
      markUnwatched('tv', id, season, episode);
      clearProgress('tv', id, season, episode);
      setWatched(false);
      toast?.('Removed from watched');
    } else {
      markWatched('tv', id, show.name, season, episode, { title: show.name, poster: show?.poster_path });
      clearProgress('tv', id, season, episode);
      setWatched(true);
      toast?.('Marked as watched');
    }
  }

  function toggleSeriesWatched() {
    if (!show || !id) return;
    if (seriesWatched) {
      const flag = getSeriesWatchedFlag(id);
      if (flag.watched && flag.source === 'explicit') {
        unmarkSeriesWatched(id);
        setSeriesWatched(false);
        toast?.('Series removed from watched');
      } else {
        if (!window.confirm('Unmark all episodes of this series? This cannot be undone.')) return;
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
    clearProgress('tv', id, season, episode);
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

  const embedUrl = getTVEmbedUrl(safeId, season, episode, videoSource, startAt ?? undefined);
  const backdrop = imageUrl(show.backdrop_path, 'original');
  const year = (show.first_air_date || '').slice(0, 4);
  const ended = show.status === 'Ended';
  const endYear = ended && show.last_air_date ? show.last_air_date.slice(0, 4) : null;
  const cast = show.credits?.cast?.slice(0, 8) || [];
  const created = show.created_by || [];
  const networks = show.networks || [];
  const genres = show.genres?.map((g) => g.name).join(', ') || '';
  const recommendations = show.recommendations?.results?.slice(0, 10) || [];

  // What the autoplay countdown will advance to (mirrors goNext logic).
  const nextUp = hasNext
    ? (episode < episodeCount
        ? { season, episode: episode + 1 }
        : { season: seasons[seasonIdx + 1].season_number, episode: 1 })
    : null;

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
              <button className={`badge-btn ${seriesWatched ? 'in-wl' : ''}`} onClick={toggleSeriesWatched} title={seriesWatched ? 'Unmark series as watched' : 'Mark series as watched'}>{seriesWatched ? '\u2713 Watched' : 'Watched'}</button>
              {trailerKey && (
                <button className="badge-btn" onClick={() => { setNextUpIn(null); setShowTrailer((s: boolean) => !s); }} title={showTrailer ? 'Hide trailer' : 'Play trailer'}>
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
          <h2 id="watch-heading-tv" className="section-title">Watch Now</h2>
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
                <EpisodeDot key={ep} ep={ep} current={ep === episode} done={watchedMap[ep]} onClick={setEpisode} />
              ))}
            </div>
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
            <Player
              key={`${season}-${episode}-${startAt !== null ? 'resume' : 'fresh'}`}
              src={embedUrl}
              title={`${show.name} S${season}E${episode}`}
              onProgress={handleProgress}
              onEnded={handleEnded}
              runtimeMinutes={episodes.find((item) => item.episode_number === episode)?.runtime || show.episode_run_time?.[0] || null}
              startAt={showTrailer && lastTimeRef.current ? lastTimeRef.current : (startAt ?? undefined)}
            />
          )}
          {nextUpIn !== null && nextUp && (
            <div className={styles.nextUp} role="status">
              <span className={styles.nextUpLabel}>Up next &middot; S{nextUp.season}E{nextUp.episode}</span>
              <span className={styles.nextUpCount}>in {nextUpIn}s</span>
              <button type="button" className={styles.nextUpPlay} onClick={() => { setNextUpIn(null); goNext(); }}>Play now</button>
              <button type="button" className={styles.nextUpCancel} onClick={() => setNextUpIn(null)}>Cancel</button>
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
          <div className={styles.epNavHints}>Shortcuts: N next &middot; P previous &middot; W watched</div>

          <div className={styles.episodeListToggle}>
            <button className="watch-toggle" onClick={() => { setNextUpIn(null); setPlayerOpen(false); }}>
              Back to episodes
            </button>
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
                  if (!window.confirm('Unmark all episodes? This cannot be undone.')) return;
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
                    <EpisodeDot key={ep} ep={ep} current={false} done={watchedMap[ep]} onClick={(e: number) => { setEpisode(e); setPlayerOpen(true); }} />
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
                  {episodes.map((ep) => (
                    <div key={ep.episode_number} className={`${styles.episodeCard} ${ep.episode_number === episode ? styles.current : ''} ${watchedMap[ep.episode_number] ? styles.watched : ''}`} onClick={() => { setEpisode(ep.episode_number); setPlayerOpen(true); }}>
                      {ep.still_path && (
                        <div className={styles.episodeCardThumb}>
                          <img src={imageUrl(ep.still_path, 'w300')} alt={ep.name} loading="lazy" />
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
                      {watchedMap[ep.episode_number] && <span className={styles.epWatchedBadge}>&#10003;</span>}
                    </div>
                  ))}
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
              <MediaCard key={(item as { id: number }).id} item={item as TMDBMovie | TMDBSeries} mediaType="tv" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
