import {
  useState,
  useEffect,
  useRef,
  useMemo,
  memo,
  type ReactNode,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getTVDetail,
  getSeasonDetails,
  getTVExternalIds,
  getEpisodeExternalIds,
  imageUrl,
} from "../api/tmdb";
import { getTVEmbedUrl, getSourceLabel, SOURCE_KEYS } from "../api/vidsrc";
import { getImdbRating, type ImdbRating } from "../api/omdb";
import { isEpisodeReleased } from "../api/tvmaze";
import {
  isWatched,
  markWatched,
  markUnwatched,
  markWatching,
  clearWatching,
  getLastWatchedEpisode,
  isInWatchLater,
  addWatchLater,
  removeWatchLater,
  getWatchedCount,
  isInEpisodeWatchLater,
  addEpisodeWatchLater,
  removeEpisodeWatchLater,
  markSeasonWatched,
  markAllSeasonsWatched,
  unmarkAllSeasonsWatched,
  getVideoSource,
  setVideoSource as persistVideoSource,
  getEpisodeWatchLater,
  isAlreadyNotified,
  addNotification,
  getWatchedEpisodeSet,
  markSeriesWatched,
  unmarkSeriesWatched,
  getSeriesWatchedFlag,
  syncSeriesWatchedFlag,
} from "../api/storage";
import Player from "../components/Player";
import EpisodeDropdown from "../components/EpisodeDropdown";
import SeasonDropdown from "../components/SeasonDropdown";
import FilterDropdown from "../components/FilterDropdown";
import MediaCard from "../components/MediaCard";
import PersonList from "../components/PersonList";
import MediaCarousel from "../components/MediaCarousel";
import Duration from "../components/Duration";
import DetailActions from "../components/DetailActions";
import ViewModeToggle from "../components/ViewModeToggle";
import { useToast } from "../components/useToast";
import { useAbortController } from "../hooks/useAbortController";
import { useAuth } from "../hooks/useAuth";
import { useSourceFallback } from "../hooks/useSourceFallback";
import { formatVotes } from "../utils/format";
import { isTypingTarget } from "../utils/isTypingTarget";
import type {
  TMDBSeries,
  TMDBMovie,
  TMDBSeason,
  TMDBEpisode,
  TMDBVideo,
  EpisodeWatchLaterItem,
} from "../types";
import styles from "./TVDetail.module.css";

// A plain unmodified left-click (no Ctrl/Cmd/Shift/Alt and not the middle
// button) - the only case where we want client-side state to react too.
// Modified clicks let the browser open the link in a new tab instead.
function isPlainLeftClick(e: {
  defaultPrevented?: boolean;
  button?: number;
  metaKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}): boolean {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.shiftKey
  );
}

const EpisodeDot = memo(function EpisodeDot({
  ep,
  name,
  current,
  done,
  onClick,
}: {
  ep: number;
  name?: string;
  current: boolean;
  done: boolean;
  onClick: (ep: number) => void;
}) {
  const { t } = useTranslation();
  const label = name
    ? t("tvDetail.episodeWithName", { episode: ep, name })
    : t("tvDetail.episodeN", { episode: ep });
  return (
    <span className={styles.spDotWrap} role="listitem">
      <button
        type="button"
        className={`${styles.spDot} ${current ? styles.current : ""} ${done ? styles.done : ""}`}
        onClick={() => onClick(ep)}
        title={label}
        aria-label={`${label}${done ? t("tvDetail.watchedSuffix") : ""}${current ? t("tvDetail.currentSuffix") : ""}`}
      />
    </span>
  );
});

export default function TVDetail() {
  const { t } = useTranslation();
  const { id: rawId } = useParams<{ id: string }>();
  // TMDB ids are numeric - reject anything else up front so a crafted URL
  // can never reach API paths, storage keys, or the embed iframe src.
  const id = rawId && /^\d+$/.test(rawId) ? rawId : undefined;
  const toast = useToast();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlSeason = searchParams.get("season");
  const urlEpisode = searchParams.get("episode");
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
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodesError, setEpisodesError] = useState(false);
  const [episodeFetchTick, setEpisodeFetchTick] = useState(0);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(null);
  const [imdbResolved, setImdbResolved] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [epImdbId, setEpImdbId] = useState<string | null>(null);
  const [epImdbRating, setEpImdbRating] = useState<ImdbRating | null>(null);
  const [epImdbRatings, setEpImdbRatings] = useState<
    Record<number, ImdbRating | null>
  >({});
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const [playerOpen, setPlayerOpen] = useState(false);
  // Bumped on every Restart click so the player remounts from 0:00.
  const [restartTick, setRestartTick] = useState(0);
  const watchedRef = useRef(false);
  // Episode key ("season-episode") whose playback already finished/was marked
  // watched, so stray ticks can't re-add it to Continue Watching.
  const finishedKeyRef = useRef<string | null>(null);
  const playerWrapRef = useRef<HTMLDivElement | null>(null);
  // Mirrors playerOpen so the Back effect can tell whether a bare URL is a
  // browser navigation (player was open) instead of the initial load.
  const playerOpenRef = useRef(false);
  const suppressUrlSyncRef = useRef(false);
  // Identifies the latest fetch so a superseded request's handlers (which can
  // settle after the effect for a new :id has started) never touch state -
  // otherwise the previous show is rendered under the new URL and its
  // .finally wrongly clears the new request's loading flag.
  const requestIdRef = useRef(0);
  const { getSignal } = useAbortController();

  const seasons: TMDBSeason[] = useMemo(
    () => show?.seasons?.filter((s) => s.season_number > 0) || [],
    [show],
  );
  const currentSeason = useMemo(
    () => seasons.find((s) => s.season_number === season),
    [seasons, season],
  );
  const episodeCount = currentSeason?.episode_count || 0;
  const episodeNums = useMemo(
    () => Array.from({ length: episodeCount }, (_, i) => i + 1),
    [episodeCount],
  );
  const episodeNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const ep of episodes) {
      if (ep.name) map.set(ep.episode_number, ep.name);
    }
    return map;
  }, [episodes]);
  const currentEpisode = useMemo(
    () => episodes.find((ep) => ep.episode_number === episode),
    [episodes, episode],
  );
  const seasonIdx = seasons.findIndex((s) => s.season_number === season);
  const hasPrev = episode > 1 || seasonIdx > 0;
  const hasNext =
    episodeCount > 0 &&
    (episode < episodeCount || seasonIdx < seasons.length - 1);

  // Memoized because it is read during render (and this component re-renders
  // on every player progress tick), while getWatchedCount re-parses the whole
  // watched index from localStorage on each call.
  const allWatched = useMemo((): boolean => {
    if (!id) return false;
    return (
      seasons.length > 0 &&
      seasons.every(
        (s) =>
          getWatchedCount(id, s.season_number, s.episode_count) >=
          s.episode_count,
      )
    );
  }, [id, seasons, watchedCount]); // eslint-disable-line react-hooks/exhaustive-deps -- watchedCount is the signal that a watched mark changed

  function lastWatchedInSeason(showId: string, seasonNum: number): number {
    const set = getWatchedEpisodeSet(showId, seasonNum);
    if (set.size === 0) return 1;
    return Math.max(...set);
  }

  // Fetch show details (one effect per id - URL params are applied
  // separately below so changing ?season= never refetches the show).
  useEffect(() => {
    if (!id) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    // Never keep the previous show around while the new one loads: its name/
    // metadata would otherwise be paired with the new id by the shortcut,
    // watched and progress handlers.
    setShow(null);
    watchedRef.current = false;
    finishedKeyRef.current = null;
    setTrailerKey(null);
    setShowTrailer(false);
    setEpisodes([]);
    setEpImdbId(null);
    setEpImdbRating(null);
    // One signal for every fetch in this run: calling getSignal() twice
    // would abort the first controller, so capture it once.
    const signal = getSignal();
    getTVDetail(id, signal)
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        const showData = data as TMDBSeries;
        setShow(showData);
        document.title = t("tvDetail.documentTitle", { title: showData.name });
        setInWL(isInWatchLater("tv", id));
        // /tv/{id} does not include imdb_id; it lives in external_ids.
        setImdbId(showData.imdb_id || null);
        if (!showData.imdb_id) {
          getTVExternalIds(id, signal)
            .then((ext) => {
              if (requestId !== requestIdRef.current) return;
              setImdbId((ext as { imdb_id?: string })?.imdb_id || null);
            })
            .catch(() => {});
        }
        const vids = showData.videos?.results || [];
        const yt = vids.find(
          (v: TMDBVideo) =>
            v.site === "YouTube" &&
            (v.type === "Trailer" || v.type === "Teaser"),
        );
        if (yt) setTrailerKey(yt.key);
        const s: TMDBSeason[] =
          showData.seasons?.filter((s: TMDBSeason) => s.season_number > 0) ||
          [];
        if (s.length === 0) return;
        const last = getLastWatchedEpisode(id);
        if (
          last &&
          s.find(
            (seasonItem: TMDBSeason) =>
              seasonItem.season_number === last.season,
          )
        ) {
          setSeason(last.season);
          setEpisode(last.episode);
        } else {
          setSeason(s[0].season_number);
          setEpisode(1);
        }
      })
      .catch((err: Error) => {
        if (err?.name === "AbortError" || requestId !== requestIdRef.current)
          return;
        setError(true);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [id, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep links (?season=&episode=) switch the selected episode without
  // refetching the show.
  useEffect(() => {
    if (!show || !id) return;
    const requestedSeason = Number(urlSeason);
    const requestedEpisode = Number(urlEpisode);
    const targetSeason = seasons.find(
      (s) => s.season_number === requestedSeason,
    );
    const valid =
      Number.isInteger(requestedSeason) &&
      Number.isInteger(requestedEpisode) &&
      requestedSeason > 0 &&
      requestedEpisode > 0 &&
      !!targetSeason;
    if (!valid) return;
    // A deep link past the end of the season would target a nonexistent
    // episode - clamp it to the season's known episode count.
    const maxEpisode = targetSeason?.episode_count || 0;
    setSeason(requestedSeason);
    setEpisode(
      maxEpisode > 0
        ? Math.min(requestedEpisode, maxEpisode)
        : requestedEpisode,
    );
    setPlayerOpen(true);
  }, [urlSeason, urlEpisode, show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the ref mirror in sync so the Back effect reads the latest value.
  useEffect(() => {
    playerOpenRef.current = playerOpen;
  }, [playerOpen]);

  // Browser Back/Forward changes the URL without touching playerOpen, so
  // mirror it: landing on the bare /tv/{id} URL (no episode params) always
  // shows the episode list. This is why Back from an episode used to leave
  // the player UI on screen. While the player was open the sync effect below
  // would immediately re-add the params, so flag that one sync as suppressed.
  useEffect(() => {
    if (!show) return;
    if (Number(urlSeason) > 0 && Number(urlEpisode) > 0) return;
    if (playerOpenRef.current) suppressUrlSyncRef.current = true;
    setPlayerOpen(false);
  }, [urlSeason, urlEpisode, show]);

  // Keep the URL in step with the selected episode so refresh and share
  // restore the same position (state alone was lost on reload). Only while
  // the player is open: closing navigates to the bare URL via the "Back to
  // episodes" link, which the effect above already mirrors into state.
  // `replace` keeps Next/Prev from spamming history entries.
  useEffect(() => {
    if (!show || !playerOpen) return;
    // Back cleared the params this commit - leave the bare URL alone.
    if (suppressUrlSyncRef.current) {
      suppressUrlSyncRef.current = false;
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (
      next.get("season") === String(season) &&
      next.get("episode") === String(episode)
    )
      return;
    next.set("season", String(season));
    next.set("episode", String(episode));
    setSearchParams(next, { replace: true });
  }, [show, playerOpen, season, episode, searchParams, setSearchParams]);

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
    setImdbResolved(false);
    getImdbRating(imdbId, "series")
      .then((r) => {
        if (cancelled) return;
        setImdbRating(r);
        setImdbResolved(true);
      })
      .catch(() => {
        if (cancelled) return;
        setImdbRating(null);
        setImdbResolved(true);
      });
    return () => {
      cancelled = true;
    };
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
        const id = (ext as { imdb_id?: string })?.imdb_id || null;
        setEpImdbId(id);
        if (id) {
          getImdbRating(id, "episode").then((r) => {
            if (!cancelled) setEpImdbRating(r);
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [show, season, episode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return;
    setWatched(isWatched("tv", id, season, episode));
    setInEpWL(isInEpisodeWatchLater(id, season, episode));
    watchedRef.current = isWatched("tv", id, season, episode);
    finishedKeyRef.current = null;
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
    finishedKeyRef.current = null;
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
    const epwlItems: EpisodeWatchLaterItem[] = getEpisodeWatchLater().filter(
      (item: EpisodeWatchLaterItem) => String(item.showId) === String(id),
    );
    const seriesFlag = getSeriesWatchedFlag(id);
    const seriesFlagAt =
      seriesFlag.watched && seriesFlag.watchedAt ? seriesFlag.watchedAt : null;
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
            const data = await getSeasonDetails(
              id,
              latestSeason.season_number,
              controller.signal,
            );
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];

            if (seriesFlagAt != null && !movedToWatchLater) {
              const hasUnwatchedNewEpisodes = eps.some(
                (ep: TMDBEpisode) =>
                  !!ep.air_date &&
                  new Date(ep.air_date).getTime() > seriesFlagAt &&
                  !isWatched(
                    "tv",
                    id,
                    latestSeason.season_number,
                    ep.episode_number,
                  ),
              );
              if (hasUnwatchedNewEpisodes) {
                unmarkSeriesWatched(id);
                if (!inWL)
                  addWatchLater(
                    "tv",
                    id,
                    show.name,
                    (show.first_air_date || "").slice(0, 4),
                    imageUrl(show.poster_path),
                  );
                setInWL(true);
                setSeriesWatched(allWatched);
                toast?.(t("tvDetail.toastNewEpisodes"));
                movedToWatchLater = true;
              }
            }

            if (inWL || movedToWatchLater) {
              for (const ep of eps) {
                if (added >= 5) break;
                if (!ep.air_date) continue;
                // Exact broadcast instant near the day boundary (US evening
                // = next morning in Spain); date logic everywhere else.
                if (
                  !(await isEpisodeReleased(
                    {
                      imdbId,
                      season: latestSeason.season_number,
                      episode: ep.episode_number,
                      airDate: ep.air_date,
                    },
                    now.getTime(),
                    controller.signal,
                  ))
                )
                  continue;
                if (
                  new Date(ep.air_date).getTime() <
                  now.getTime() - 7 * 24 * 60 * 60 * 1000
                )
                  continue;
                if (
                  isWatched(
                    "tv",
                    id,
                    latestSeason.season_number,
                    ep.episode_number,
                  )
                )
                  continue;
                if (
                  isAlreadyNotified(
                    id,
                    latestSeason.season_number,
                    ep.episode_number,
                  )
                )
                  continue;
                addNotification(
                  id,
                  show.name,
                  latestSeason.season_number,
                  ep.episode_number,
                  ep.name,
                  "new_episode",
                  ep.air_date,
                );
                added++;
              }
            }
            // Best-effort notification prefetch: a failed season must not
            // break the page or block the remaining seasons.
          } catch {}
        }
      }

      if (epwlItems.length > 0) {
        const seasonsToCheck = [
          ...new Set(
            epwlItems.map((item: EpisodeWatchLaterItem) => item.season),
          ),
        ];
        for (const seasonNum of seasonsToCheck) {
          if (added >= 5) break;
          try {
            const data = await getSeasonDetails(
              id,
              seasonNum,
              controller.signal,
            );
            if (cancelled) return;
            const eps = (data as { episodes: TMDBEpisode[] }).episodes || [];
            for (const epwl of epwlItems) {
              if (added >= 5) break;
              if (epwl.season !== seasonNum) continue;
              const ep = eps.find(
                (e: TMDBEpisode) => e.episode_number === epwl.episode,
              );
              if (!ep || !ep.air_date) continue;
              if (
                !(await isEpisodeReleased(
                  {
                    imdbId,
                    season: seasonNum,
                    episode: epwl.episode,
                    airDate: ep.air_date,
                  },
                  now.getTime(),
                  controller.signal,
                ))
              )
                continue;
              if (
                new Date(ep.air_date).getTime() <
                now.getTime() - 7 * 24 * 60 * 60 * 1000
              )
                continue;
              if (isWatched("tv", id, seasonNum, epwl.episode)) continue;
              if (isAlreadyNotified(id, seasonNum, epwl.episode)) continue;
              addNotification(
                id,
                show.name,
                seasonNum,
                epwl.episode,
                ep.name || t("tvDetail.episodeN", { episode: epwl.episode }),
                "new_episode",
                ep.air_date,
              );
              added++;
            }
            // Best-effort, same as above: skip the season on failure.
          } catch {}
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [show, inWL]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the implicit series flag in sync with per-episode state and expose
  // the derived "series watched" status (flag OR all episodes watched) to the
  // header toggle.
  useEffect(() => {
    if (!id || !show || seasons.length === 0) return;
    syncSeriesWatchedFlag(id, seasons, show.name, show?.poster_path ?? "");
    setSeriesWatched(getSeriesWatchedFlag(id).watched || allWatched);
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
    // Never keep the previous season's episodes around while the new one
    // loads - names and ratings are derived from them.
    setEpisodes([]);
    setEpImdbRatings({});
    setEpisodesLoading(true);
    const controller = new AbortController();
    getSeasonDetails(id, season, controller.signal)
      .then((data) => {
        setEpisodes((data as { episodes: TMDBEpisode[] }).episodes || []);
      })
      .catch((err: Error) => {
        if (err?.name !== "AbortError") setEpisodesError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEpisodesLoading(false);
      });
    return () => controller.abort();
  }, [id, season, seasons.length, episodeFetchTick]);

  // IMDb ratings for the episode list (whole season view): resolves each
  // episode's imdb_id via TMDB and the rating via OMDb, one at a time so the
  // free OMDb tier isn't bursted. Cached per episode for 7 days.
  // Ratings are accumulated locally and flushed at most every 200ms: writing
  // state once per episode re-rendered the whole page N times in a row.
  useEffect(() => {
    setEpImdbRatings({});
    if (playerOpen || !show || episodes.length === 0) return;
    let cancelled = false;
    const partial: Record<number, ImdbRating | null> = {};
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    function flush() {
      flushTimer = null;
      if (cancelled) return;
      setEpImdbRatings({ ...partial });
    }
    function scheduleFlush() {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flush, 200);
    }
    (async () => {
      for (const ep of episodes) {
        if (cancelled) return;
        let rating: ImdbRating | null = null;
        try {
          const ext = (await getEpisodeExternalIds(
            show.id,
            season,
            ep.episode_number,
          )) as { imdb_id?: string };
          if (cancelled) return;
          if (ext?.imdb_id)
            rating = await getImdbRating(ext.imdb_id, "episode");
          // Best-effort rating enrichment: leave the badge empty on failure.
        } catch {}
        if (cancelled) return;
        partial[ep.episode_number] = rating;
        scheduleFlush();
      }
      // Final synchronous flush so the last entries never wait on the timer.
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flush();
    })();
    return () => {
      cancelled = true;
      if (flushTimer !== null) clearTimeout(flushTimer);
    };
  }, [playerOpen, show, season, episodes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts while the player is open: N = next episode,
  // P = previous episode, W = toggle watched, F = toggle fullscreen.
  // Ignored while typing in a field or with modifier keys held.
  useEffect(() => {
    if (!playerOpen || showTrailer) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "n") {
        if (hasNext) {
          e.preventDefault();
          goNext();
        }
      } else if (k === "p") {
        if (hasPrev) {
          e.preventDefault();
          goPrev();
        }
      } else if (k === "w" && isAuthenticated) {
        toggleWatched();
      } else if (k === "f") {
        e.preventDefault();
        togglePlayerFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    playerOpen,
    showTrailer,
    hasNext,
    hasPrev,
    season,
    episode,
    watched,
    isAuthenticated,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // L = toggle Watch Later. On the episode view (player open) it targets the
  // current episode; on the series view it targets the series itself.
  // Ignored while typing or with modifiers held.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() !== "l") return;
      if (!show || !id || !isAuthenticated) return;
      e.preventDefault();
      if (playerOpen) {
        if (inEpWL) {
          removeEpisodeWatchLater(id, season, episode);
          setInEpWL(false);
          toast?.(t("tvDetail.toastEpisodeRemovedWatchLater"));
        } else {
          addEpisodeWatchLater(id, season, episode, show.name);
          setInEpWL(true);
          toast?.(t("tvDetail.toastEpisodeAddedWatchLater"));
        }
        return;
      }
      if (inWL) {
        removeWatchLater("tv", id);
        setInWL(false);
        toast?.(t("tvDetail.toastRemovedWatchLater"));
      } else {
        addWatchLater(
          "tv",
          id,
          show.name,
          (show.first_air_date || "").slice(0, 4),
          imageUrl(show.poster_path),
        );
        setInWL(true);
        toast?.(t("tvDetail.toastAddedWatchLater"));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    show,
    id,
    inWL,
    inEpWL,
    playerOpen,
    season,
    episode,
    toast,
    isAuthenticated,
    t,
  ]);

  function togglePlayerFullscreen() {
    const el = playerWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().then(
        () => {
          // Hand keyboard focus to the embed once fullscreen engages, so
          // provider shortcuts (e.g. Space = play/pause) work immediately
          // without clicking the video first.
          el.querySelector("iframe")?.focus();
        },
        () => {},
      );
    }
  }

  function autoMarkWatched() {
    const episodeKey = `${season}-${episode}`;
    if (!show || !id || finishedKeyRef.current === episodeKey) return;
    finishedKeyRef.current = episodeKey;
    markWatched("tv", id, show.name, season, episode, {
      title: show.name,
      poster: show?.poster_path,
    });
    watchedRef.current = true;
    setWatched(true);
  }

  function handleWatching() {
    const episodeKey = `${season}-${episode}`;
    if (!show || !id || finishedKeyRef.current === episodeKey) return;
    // markWatching is mutually exclusive with the watched mark, so starting a
    // rewatch would silently drop it and desync the player button from the
    // episode list. Keep an already-watched episode marked as watched.
    if (watchedRef.current) return;
    markWatching("tv", id, season, episode, {
      title: show.name,
      poster: show?.poster_path,
      backdrop: show?.backdrop_path,
      episodeName: currentEpisode?.name,
    });
  }

  function handleEnded() {
    autoMarkWatched();
  }

  function toggleWatched() {
    if (!show || !id) return;
    if (watched) {
      markUnwatched("tv", id, season, episode);
      setWatched(false);
      toast?.(t("tvDetail.toastRemovedWatched"));
    } else {
      finishedKeyRef.current = `${season}-${episode}`;
      markWatched("tv", id, show.name, season, episode, {
        title: show.name,
        poster: show?.poster_path,
      });
      setWatched(true);
      toast?.(t("tvDetail.toastMarkedWatched"));
    }
  }

  function toggleEpisodeWatched(epNum: number) {
    if (!show || !id) return;
    if (watchedMap[epNum]) {
      markUnwatched("tv", id, season, epNum);
      toast?.(t("tvDetail.toastEpisodeUnmarked", { episode: epNum }));
    } else {
      markWatched("tv", id, show.name, season, epNum, {
        title: show.name,
        poster: show?.poster_path,
      });
      toast?.(t("tvDetail.toastEpisodeMarkedWatched", { episode: epNum }));
    }
    setWatchedCount(getWatchedCount(id, season, episodeCount));
    setWatched(isWatched("tv", id, season, episode));
  }

  function toggleEpisodeWatchLater(epNum: number) {
    if (!show || !id) return;
    if (epWlSet.has(epNum)) {
      removeEpisodeWatchLater(id, season, epNum);
      toast?.(
        t("tvDetail.toastEpisodeNumRemovedWatchLater", { episode: epNum }),
      );
    } else {
      addEpisodeWatchLater(id, season, epNum, show.name);
      toast?.(t("tvDetail.toastEpisodeNumAddedWatchLater", { episode: epNum }));
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
      if (flag.watched && flag.source === "explicit") {
        // Dropping only the flag would leave per-episode marks behind and
        // the toggle would flip straight back to Watched with a lying toast.
        // Unmark the episodes too so off really means off.
        unmarkAllSeasonsWatched(id, seasons);
        unmarkSeriesWatched(id);
        setWatchedCount(getWatchedCount(id, season, episodeCount));
        setWatched(isWatched("tv", id, season, episode));
        setSeriesWatched(false);
        toast?.(t("tvDetail.toastSeriesRemovedWatched"));
      } else {
        unmarkAllSeasonsWatched(id, seasons);
        unmarkSeriesWatched(id);
        setWatchedCount(getWatchedCount(id, season, episodeCount));
        setWatched(isWatched("tv", id, season, episode));
        setSeriesWatched(false);
        toast?.(t("tvDetail.toastSeriesRemovedWatched"));
      }
    } else {
      markSeriesWatched(id, show.name, show?.poster_path ?? "", "explicit");
      setSeriesWatched(true);
      toast?.(t("tvDetail.toastSeriesMarkedWatched"));
    }
  }

  function goPrev() {
    markCurrentWatched();
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
    finishedKeyRef.current = `${season}-${episode}`;
    markWatched("tv", id, show.name, season, episode, {
      title: show.name,
      poster: show?.poster_path,
    });
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

  function switchMode(next: "trailer" | "player") {
    setShowTrailer(next === "trailer");
  }

  // Re-run the whole load through the fetch effect (metadata, external ids,
  // trailer, seasons) - a bare re-fetch here used to leave the trailer control
  // and season/episode init missing after a successful retry.
  function retry() {
    setRetryKey((k) => k + 1);
  }

  useSourceFallback({
    active: Boolean(show) && playerOpen && !showTrailer,
    mediaType: "tv",
    id,
    season,
    episode,
    source: videoSource,
    onSwitch: setVideoSource,
    onSwitched: (from, to) =>
      toast?.(
        t("tvDetail.toastSourceSwitched", {
          from: getSourceLabel(from),
          to: getSourceLabel(to),
        }),
      ),
    onNoSource: () => toast?.(t("tvDetail.toastNoSource")),
  });

  if (!id)
    return (
      <div className="page">
        <div className="loading">{t("tvDetail.showNotFound")}</div>
      </div>
    );
  const safeId = id;

  if (loading)
    return (
      <div className="page">
        <div className="loading" role="status">
          {t("app.loading")}
        </div>
      </div>
    );

  if (error)
    return (
      <div className="page" role="alert">
        <div className="loading">{t("tvDetail.loadFailed")}</div>
        <div className="retry-bar">
          <button className="watch-toggle" onClick={retry}>
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  if (!show)
    return (
      <div className="page">
        <div className="loading">{t("tvDetail.showNotFound")}</div>
      </div>
    );

  const embedUrl = getTVEmbedUrl(safeId, season, episode, videoSource);
  const backdrop = imageUrl(show.backdrop_path, "original");
  const year = (show.first_air_date || "").slice(0, 4);
  const ended = show.status === "Ended";
  const endYear =
    ended && show.last_air_date ? show.last_air_date.slice(0, 4) : null;
  const cast = show.credits?.cast?.slice(0, 8) || [];
  const created = show.created_by || [];
  const networks = show.networks || [];
  const genres =
    show.genres
      ?.slice(0, 3)
      .map((g) => g.name)
      .join(", ") || "";
  const recommendations = show.recommendations?.results?.slice(0, 24) || [];

  // OMDb returns votes as a formatted string ("1,234,567"); plurals need a number.
  const votesNum = (v?: string | null) =>
    Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
  const imdbTitle = imdbRating
    ? [
        t("rating.imdb", { rating: imdbRating.rating }),
        imdbRating.votes || show.vote_count
          ? t("rating.votes", {
              count: imdbRating.votes ? votesNum(imdbRating.votes) : show.vote_count,
              value: imdbRating.votes
                ? imdbRating.votes
                : formatVotes(String(show.vote_count)),
            })
          : "",
        imdbRating.tomatoes
          ? t("rating.rottenTomatoes", { value: imdbRating.tomatoes })
          : "",
      ]
        .filter(Boolean)
        .join(" \u00b7 ")
    : "";
  const imdbAria = imdbRating
    ? [
        t("tvDetail.imdbAria", { rating: imdbRating.rating }),
        imdbRating.votes || show.vote_count
          ? t("rating.votes", {
              count: imdbRating.votes ? votesNum(imdbRating.votes) : show.vote_count,
              value: imdbRating.votes
                ? imdbRating.votes
                : formatVotes(String(show.vote_count)),
            })
          : "",
      ]
        .filter(Boolean)
        .join(", ")
    : "";
  const tmdbTitle = [
    t("rating.tmdb", { rating: show.vote_average.toFixed(1) }),
    show.vote_count
      ? t("rating.votes", {
          count: show.vote_count,
          value: formatVotes(String(show.vote_count)),
        })
      : "",
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
  const tmdbAria = [
    t("tvDetail.tmdbAria", { rating: show.vote_average.toFixed(1) }),
    show.vote_count
      ? t("rating.votes", {
          count: show.vote_count,
          value: formatVotes(String(show.vote_count)),
        })
      : "",
  ]
    .filter(Boolean)
    .join(", ");
  const epImdbTitle = epImdbRating
    ? [
        t("rating.imdb", { rating: epImdbRating.rating }),
        epImdbRating.votes
          ? t("rating.votes", {
              count: votesNum(epImdbRating.votes),
              value: epImdbRating.votes,
            })
          : "",
      ]
        .filter(Boolean)
        .join(" \u00b7 ")
    : t("tvDetail.openEpisodeOnImdb");

  // Unwatched episodes of the viewed season that aired in the last 7 days.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const freshCount = episodes.filter(
    (ep) =>
      ep.air_date &&
      new Date(ep.air_date).getTime() >= weekAgo &&
      new Date(ep.air_date).getTime() <= Date.now() &&
      !watchedMap[ep.episode_number],
  ).length;

  // Secondary facts render as a single bullet-separated line (hero style)
  // instead of individual pill badges.
  const metaNodes: ReactNode[] = [];
  const addMeta = (key: string, node: ReactNode, title?: string) => {
    if (metaNodes.length > 0) {
      metaNodes.push(
        <span key={`sep-${key}`} className="detail-meta-sep" aria-hidden="true">
          {"\u00b7"}
        </span>,
      );
    }
    metaNodes.push(
      <span key={key} className="detail-meta-item" title={title}>
        {node}
      </span>,
    );
  };
  if (genres) addMeta("genres", genres);
  if (show.episode_run_time?.[0])
    addMeta("runtime", <Duration minutes={show.episode_run_time[0]} />);
  if (seasons.length > 0)
    addMeta("seasons", t("tvDetail.seasonCount", { count: seasons.length }));
  if (show.number_of_episodes)
    addMeta(
      "episodes",
      t("tvDetail.episodeCount", { count: show.number_of_episodes }),
    );
  if (show.status) {
    addMeta(
      "status",
      ended || show.status === "Canceled"
        ? t("tvDetail.statusEnded")
        : t("tvDetail.statusOngoing"),
      t("tvDetail.statusTitle", { status: show.status }),
    );
  }
  if (freshCount > 0) {
    addMeta(
      "fresh",
      t("tvDetail.freshCount", { count: freshCount }),
      t("tvDetail.freshTitle", { count: freshCount, season }),
    );
  }
  if (watchedCount > 0) {
    addMeta(
      "watched",
      t("tvDetail.watchedProgress", {
        watched: watchedCount,
        total: episodeCount,
      }),
      t("tvDetail.watchedProgressTitle", {
        watched: watchedCount,
        total: episodeCount,
        season,
      }),
    );
  }

  return (
    <div className="page">
      <div
        className="detail-header"
        style={{ backgroundImage: `url(${backdrop})` }}
      >
        <div className="detail-header-overlay">
          <div className="detail-poster">
            <img src={imageUrl(show.poster_path)} alt={show.name} />
          </div>
          <div className="detail-meta">
            <h1>
              {show.name}{" "}
              <span className="year">
                ({endYear ? `${year}-${endYear}` : year})
              </span>
            </h1>
            <div className="detail-badges">
              {imdbId && imdbRating ? (
                <a
                  className={`${styles.detailRating} badge rating rating-imdb`}
                  href={`https://www.imdb.com/title/${imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={imdbTitle}
                  aria-label={imdbAria}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
                  </svg>
                  <span className="rating-source">{imdbRating.rating}</span>
                  {(imdbRating.votes || show.vote_count > 0) && (
                    <span className="rating-votes">
                      (
                      {imdbRating.votes
                        ? formatVotes(imdbRating.votes)
                        : formatVotes(String(show.vote_count))}
                      )
                    </span>
                  )}
                </a>
              ) : (!imdbId || imdbResolved) && show.vote_average > 0 ? (
                <a
                  className={`${styles.detailRating} badge rating rating-tmdb`}
                  href={
                    imdbId
                      ? `https://www.imdb.com/title/${imdbId}/`
                      : `https://www.imdb.com/find/?q=${encodeURIComponent(show.name)}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tmdbTitle}
                  aria-label={tmdbAria}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
                  </svg>
                  <span className="rating-source">
                    {show.vote_average.toFixed(1)}
                  </span>
                  {show.vote_count > 0 && (
                    <span className="rating-votes">
                      ({formatVotes(String(show.vote_count))})
                    </span>
                  )}
                </a>
              ) : null}
              {metaNodes.length > 0 && (
                <span className="detail-meta-line">{metaNodes}</span>
              )}
            </div>
            <div className={styles.headerActions}>
              <DetailActions
                inList={inWL}
                watched={seriesWatched}
                onToggleList={() => {
                  if (inWL) {
                    removeWatchLater("tv", safeId);
                    setInWL(false);
                    toast?.(t("tvDetail.toastRemovedWatchLater"));
                  } else {
                    addWatchLater(
                      "tv",
                      safeId,
                      show.name,
                      year,
                      imageUrl(show.poster_path),
                    );
                    setInWL(true);
                    toast?.(t("tvDetail.toastAddedWatchLater"));
                  }
                }}
                onToggleWatched={toggleSeriesWatched}
                shareTitle={show.name}
                onToggleTrailer={
                  trailerKey && !playerOpen
                    ? () => {
                        setPlayerOpen(true);
                        setShowTrailer(true);
                      }
                    : undefined
                }
                isAuthenticated={isAuthenticated}
              />
            </div>
            <p className="detail-overview">{show.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast">
                <strong>{t("tvDetail.cast")}</strong>{" "}
                <PersonList people={cast} />
              </div>
            )}
            {created.length > 0 && (
              <div className="detail-crew">
                <strong>{t("tvDetail.createdBy")}</strong>{" "}
                <PersonList people={created} />
              </div>
            )}
            {networks.length > 0 && (
              <div className="detail-crew">
                <strong>{t("tvDetail.network")}</strong>{" "}
                {networks.map((n) => n.name).join(", ")}
              </div>
            )}
          </div>
        </div>
      </div>

      {playerOpen && seasons.length > 0 ? (
        <section className="section" aria-labelledby="watch-heading-tv">
          <div className={styles.watchHeader}>
            <h2 id="watch-heading-tv" className="section-title">
              {t("tvDetail.watchNow")}
            </h2>
            <div className={styles.watchHeaderActions}>
              {epImdbId ? (
                <a
                  className="badge rating rating-imdb"
                  href={`https://www.imdb.com/title/${epImdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={epImdbTitle}
                >
                  {epImdbRating
                    ? t("tvDetail.imdbBadgeWithRating", {
                        rating: epImdbRating.rating,
                      })
                    : t("tvDetail.imdbBadge")}
                </a>
              ) : currentEpisode && currentEpisode.vote_average > 0 ? (
                <span className="badge rating rating-tmdb">
                  {t("tvDetail.tmdbBadge", {
                    rating: currentEpisode.vote_average.toFixed(1),
                  })}
                </span>
              ) : null}
              {trailerKey && (
                <ViewModeToggle
                  mode={showTrailer ? "trailer" : "player"}
                  onChange={switchMode}
                />
              )}
            </div>
          </div>
          {showTrailer && trailerKey ? (
            <div className="trailer-wrapper">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}`}
                title={t("tvDetail.trailer")}
                allow="autoplay; fullscreen; encrypted-media"
                allowFullScreen
                className="player-iframe"
              />
            </div>
          ) : (
            <div ref={playerWrapRef} className="player-fs-wrap">
              <Player
                key={`${season}-${episode}-${restartTick}`}
                src={embedUrl}
                title={`${show.name} S${season}E${episode}`}
                onWatching={handleWatching}
                onEnded={handleEnded}
                runtimeMinutes={
                  currentEpisode?.runtime || show.episode_run_time?.[0] || null
                }
              />
            </div>
          )}
          {!showTrailer && (
            <div className={styles.epNav}>
              <div className={styles.epNavStart}>
                <Link
                  className={styles.epActionBtn}
                  to={`/tv/${safeId}`}
                  onClick={(e) => {
                    if (isPlainLeftClick(e)) setPlayerOpen(false);
                  }}
                  title={t("tvDetail.backToEpisodes")}
                  aria-label={t("tvDetail.backToEpisodes")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <line x1="4" y1="7" x2="20" y2="7" />
                    <line x1="4" y1="12" x2="20" y2="12" />
                    <line x1="4" y1="17" x2="20" y2="17" />
                  </svg>
                </Link>
                <SeasonDropdown
                  seasons={seasons}
                  value={season}
                  onSelect={(s: number) => {
                    setSeason(s);
                    setEpisode(lastWatchedInSeason(safeId, s));
                  }}
                />
                <EpisodeDropdown
                  showId={safeId}
                  season={season}
                  episode={episode}
                  episodes={episodes}
                  onSelect={(ep: number) => {
                    setEpisode(ep);
                  }}
                />
                {isAuthenticated && (
                  <>
                    <button
                      type="button"
                      className={`${styles.epActionBtn} ${watched ? styles.activeWatched : ""}`}
                      onClick={toggleWatched}
                      title={
                        watched
                          ? t("tvDetail.unmarkEpisodeWatched")
                          : t("tvDetail.markEpisodeWatched")
                      }
                      aria-label={
                        watched
                          ? t("tvDetail.unmarkEpisodeWatched")
                          : t("tvDetail.markEpisodeWatched")
                      }
                      aria-pressed={watched}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className={styles.epActionBtn}
                  onClick={() => {
                    finishedKeyRef.current = null;
                    clearWatching("tv", safeId, season, episode);
                    setRestartTick((n) => n + 1);
                  }}
                  title={t("tvDetail.restartEpisode")}
                  aria-label={t("tvDetail.restartEpisode")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                </button>
              </div>
              <div className={styles.epNavCenter}>
                <button
                  className={styles.epNavBtn}
                  disabled={!hasPrev}
                  onClick={goPrev}
                >
                  &#9664; {t("pagination.prev")}
                </button>
                <span className={styles.epNavLabel}>
                  {t("tvDetail.epNavLabel", { season, episode })}
                </span>
                <button
                  className={styles.epNavBtn}
                  disabled={!hasNext}
                  onClick={goNext}
                >
                  {t("pagination.next")} &#9654;
                </button>
              </div>
              <div className={styles.epNavEnd}>
                <FilterDropdown
                  value={videoSource}
                  options={SOURCE_KEYS.map((key) => ({
                    value: key,
                    label: getSourceLabel(key),
                  }))}
                  placeholder={t("tvDetail.source")}
                  onSelect={(val: string) => {
                    setVideoSource(val);
                    persistVideoSource(val);
                  }}
                  className="source-dropdown"
                />
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="section" aria-labelledby="episodes-heading">
          <div className={styles.browseHeader}>
            <h2 id="episodes-heading" className="section-title">
              {t("tvDetail.episodes")}
            </h2>
            {seasons.length > 0 && (
              <SeasonDropdown
                seasons={seasons}
                value={season}
                onSelect={(s: number) => {
                  setSeason(s);
                  setEpisode(lastWatchedInSeason(safeId, s));
                }}
              />
            )}
            {seasons.length > 0 && isAuthenticated && (
              <button
                className={styles.markSeasonBtn}
                onClick={() => {
                  if (allWatched) {
                    unmarkAllSeasonsWatched(safeId, seasons);
                    toast?.(t("tvDetail.toastAllEpisodesUnmarked"));
                  } else {
                    markAllSeasonsWatched(
                      safeId,
                      seasons,
                      show.name,
                      show?.poster_path ?? "",
                    );
                    toast?.(t("tvDetail.toastAllEpisodesMarked"));
                  }
                  setWatchedCount(
                    getWatchedCount(safeId, season, episodeCount),
                  );
                  setWatched(isWatched("tv", safeId, season, episode));
                }}
              >
                {allWatched
                  ? t("tvDetail.unmarkAllWatched")
                  : t("tvDetail.markAllWatched")}
              </button>
            )}
          </div>
          {seasons.length === 0 ? (
            <div className="loading">{t("tvDetail.noSeasons")}</div>
          ) : (
            <>
              <div className={styles.seasonProgress}>
                <div className={styles.spHeader}>
                  <span className={styles.spLabel}>
                    {t("tvDetail.seasonLabel", { season })}
                  </span>
                  <span className={styles.spCount}>
                    {t("tvDetail.watchedProgress", {
                      watched: watchedCount,
                      total: episodeCount,
                    })}
                  </span>
                  {watchedCount < episodeCount && isAuthenticated && (
                    <button
                      className={styles.markSeasonBtn}
                      onClick={() => {
                        markSeasonWatched(
                          safeId,
                          season,
                          episodeCount,
                          show.name,
                          show?.poster_path ?? "",
                        );
                        setWatchedCount(
                          getWatchedCount(safeId, season, episodeCount),
                        );
                        setWatched(isWatched("tv", safeId, season, episode));
                        toast?.(t("tvDetail.toastSeasonMarkedWatched"));
                      }}
                    >
                      {t("tvDetail.markSeasonWatched")}
                    </button>
                  )}
                </div>
                <div
                  className={styles.spBar}
                  role="list"
                  aria-label={t("tvDetail.episodeProgress")}
                >
                  {episodeNums.map((ep) => (
                    <EpisodeDot
                      key={ep}
                      ep={ep}
                      name={episodeNames.get(ep)}
                      current={false}
                      done={watchedMap[ep]}
                      onClick={(e: number) => {
                        setEpisode(e);
                        setPlayerOpen(true);
                      }}
                    />
                  ))}
                </div>
              </div>
              {episodesError ? (
                <div className="loading" role="alert">
                  {t("tvDetail.failedEpisodes")}
                  <div className="retry-bar">
                    <button
                      className="watch-toggle"
                      onClick={() => setEpisodeFetchTick((n) => n + 1)}
                    >
                      {t("common.retry")}
                    </button>
                  </div>
                </div>
              ) : episodes.length > 0 ? (
                <div className={styles.episodeList}>
                  {episodes.map((ep) => {
                    const isW = !!watchedMap[ep.episode_number];
                    const isWL = epWlSet.has(ep.episode_number);
                    return (
                      <div
                        key={ep.episode_number}
                        className={`${styles.episodeCard} ${ep.episode_number === episode ? styles.current : ""} ${isW ? styles.watched : ""} ${isWL ? styles.watchLater : ""}`}
                      >
                        <Link
                          to={`/tv/${safeId}?season=${season}&episode=${ep.episode_number}`}
                          className={styles.episodeCardLink}
                          aria-label={t("tvDetail.episodeHeading", {
                            episode: ep.episode_number,
                            name: ep.name,
                          })}
                          onClick={(e) => {
                            if (isPlainLeftClick(e)) {
                              setEpisode(ep.episode_number);
                              setPlayerOpen(true);
                            }
                          }}
                        >
                          {ep.still_path && (
                            <div className={styles.episodeCardThumb}>
                              <img
                                src={imageUrl(ep.still_path, "w300")}
                                alt=""
                                loading="lazy"
                              />
                            </div>
                          )}
                          <div className={styles.episodeCardInfo}>
                            <h3 className={styles.epTitle}>
                              {t("tvDetail.episodeHeading", {
                                episode: ep.episode_number,
                                name: ep.name,
                              })}
                            </h3>
                            <div className={styles.epMeta}>
                              {ep.air_date && <span>{ep.air_date}</span>}
                              {ep.runtime && (
                                <span>
                                  {" "}
                                  &middot;{" "}
                                  {t("tvDetail.runtimeMinutes", {
                                    minutes: ep.runtime,
                                  })}
                                </span>
                              )}
                              {epImdbRatings[ep.episode_number] != null ? (
                                <>
                                  {" \u00b7 "}
                                  <span className="badge rating rating-imdb">
                                    {t("tvDetail.imdbBadgeWithRating", {
                                      rating:
                                        epImdbRatings[ep.episode_number]
                                          ?.rating,
                                    })}
                                  </span>
                                </>
                              ) : ep.vote_average > 0 ? (
                                <>
                                  {" \u00b7 "}
                                  <span
                                    className="badge rating rating-tmdb"
                                    title={t("rating.tmdb", {
                                      rating: ep.vote_average.toFixed(1),
                                    })}
                                  >
                                    {t("tvDetail.tmdbBadge", {
                                      rating: ep.vote_average.toFixed(1),
                                    })}
                                  </span>
                                </>
                              ) : null}
                            </div>
                            {ep.overview && (
                              <div className={styles.epOverview}>
                                {ep.overview}
                              </div>
                            )}
                          </div>
                        </Link>
                        <span className={styles.epCardActions}>
                          {isAuthenticated && (
                            <>
                              <button
                                type="button"
                                className={`${styles.epActionBtn} ${isW ? styles.activeWatched : ""}`}
                                onClick={() =>
                                  toggleEpisodeWatched(ep.episode_number)
                                }
                                title={
                                  isW
                                    ? t("tvDetail.unmarkEpisodeNum", {
                                        episode: ep.episode_number,
                                      })
                                    : t("tvDetail.markEpisodeNum", {
                                        episode: ep.episode_number,
                                      })
                                }
                                aria-label={
                                  isW
                                    ? t("tvDetail.unmarkEpisodeNum", {
                                        episode: ep.episode_number,
                                      })
                                    : t("tvDetail.markEpisodeNum", {
                                        episode: ep.episode_number,
                                      })
                                }
                                aria-pressed={isW}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className={`${styles.epActionBtn} ${isWL ? styles.activeWatchLater : ""}`}
                                onClick={() =>
                                  toggleEpisodeWatchLater(ep.episode_number)
                                }
                                title={
                                  isWL
                                    ? t("tvDetail.removeEpisodeNumWatchLater", {
                                        episode: ep.episode_number,
                                      })
                                    : t("tvDetail.saveEpisodeNumWatchLater", {
                                        episode: ep.episode_number,
                                      })
                                }
                                aria-label={
                                  isWL
                                    ? t("tvDetail.removeEpisodeNumWatchLater", {
                                        episode: ep.episode_number,
                                      })
                                    : t("tvDetail.saveEpisodeNumWatchLater", {
                                        episode: ep.episode_number,
                                      })
                                }
                                aria-pressed={isWL}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <circle cx="12" cy="12" r="9" />
                                  <polyline points="12 7 12 12 15.5 14" />
                                </svg>
                              </button>
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : episodesLoading ? (
                <div className="loading" role="status">
                  {t("tvDetail.loadingEpisodes")}
                </div>
              ) : (
                <div className="loading">{t("tvDetail.noEpisodes")}</div>
              )}
            </>
          )}
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="section" aria-labelledby="recs-heading-tv">
          <h2 id="recs-heading-tv" className="section-title">
            {t("tvDetail.recommendations")}
          </h2>
          <MediaCarousel>
            {recommendations.map((item) => (
              <MediaCard
                key={`${(item as { media_type?: string }).media_type || "tv"}-${(item as { id: number }).id}`}
                item={item as TMDBMovie | TMDBSeries}
                mediaType={
                  (item as { media_type?: string }).media_type === "movie"
                    ? "movie"
                    : "tv"
                }
              />
            ))}
          </MediaCarousel>
        </section>
      )}
    </div>
  );
}
