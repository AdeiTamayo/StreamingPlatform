import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getWatchLater,
  removeWatchLater,
  getEpisodeWatchLater,
  removeEpisodeWatchLater,
} from "../api/storage";
import {
  imageUrl,
  getMovieDetail,
  getTVDetail,
  getSeasonDetails,
} from "../api/tmdb";
import {
  getOmdbRatingByTitle,
  peekOmdbRatingByTmdb,
  type ImdbRating,
} from "../api/omdb";
import CollectionSkeleton from "../components/CollectionSkeleton";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import { useToast } from "../components/useToast";
import { useAbortController } from "../hooks/useAbortController";
import { generateCalendarGrid, getWeekdays, getMonthName, navigateMonth, formatISODate, isValidDate } from "../utils/calendar";
import type {
  WatchLaterItem,
  EpisodeWatchLaterItem,
  CalendarItem,
  TMDBSeason,
  TMDBEpisode,
  MediaType,
} from "../types";
import styles from "./WatchLater.module.css";

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isFuture(dateStr: string) {
  const d = parseLocalDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
}

// The calendar only covers the current month and later months; past days of
// the current month still show their releases, so the collectors accept
// anything from the start of the current month onwards.
function isCalendarRelevant(dateStr: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const d = parseLocalDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d >= monthStart;
}

// Rating badge for Watch Later cards, matching MediaCard (Home/Movies/TV):
// IMDb rating via OMDb when available, falling back to the TMDB vote average.
function WlRatingBadge({
  type,
  id,
  title,
  year,
}: {
  type: MediaType;
  id: string | number;
  title: string;
  year: string;
}) {
  const [tmdbRating, setTmdbRating] = useState<string | null>(null);
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(() => {
    const peek = peekOmdbRatingByTmdb(id);
    return peek.state === "cached" ? peek.rating : null;
  });

  useEffect(() => {
    let cancelled = false;
    const peek = peekOmdbRatingByTmdb(id);
    if (peek.state !== "fresh") {
      setImdbRating(peek.rating);
    } else {
      getOmdbRatingByTitle(
        id,
        title,
        year || "",
        type === "tv" ? "series" : "movie",
      ).then((r) => {
        if (!cancelled) setImdbRating(r);
      });
    }
    (type === "movie" ? getMovieDetail(id) : getTVDetail(id))
      .then((detail) => {
        if (cancelled) return;
        const v = (detail as { vote_average?: number })?.vote_average;
        setTmdbRating(v ? v.toFixed(1) : "?");
      })
      .catch(() => {
        if (!cancelled) setTmdbRating("?");
      });
    return () => {
      cancelled = true;
    };
  }, [type, id, title, year]);

  const display = imdbRating ? imdbRating.rating : tmdbRating;
  if (!display) return null;
  return (
    <span
      className="media-card-rating"
      title={
        imdbRating
          ? `IMDb ${imdbRating.rating}/10${imdbRating.votes ? ` \u00b7 ${imdbRating.votes} votes` : ""}`
          : `TMDB rating ${tmdbRating}/10`
      }
    >
      {display}
    </span>
  );
}

function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  const d = parseLocalDate(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function calendarKey(item: CalendarItem) {
  return `${item.type}-${item.id}-${item.date}-S${item.season ?? 0}E${item.episode ?? 0}`;
}

function wlItemKey(item: Pick<WatchLaterItem, "type" | "id">): string {
  return `${item.type}-${String(item.id)}`;
}

// Persisted release-calendar cache so a return visit paints instantly from
// the previous load while fresh data is fetched in the background.
export const CALENDAR_CACHE_KEY = "streamflow:calendar-cache:v1";
const CALENDAR_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCalendarCache(): CalendarItem[] {
  try {
    const raw = localStorage.getItem(CALENDAR_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { savedAt?: number; items?: CalendarItem[] };
    if (!parsed || !Array.isArray(parsed.items)) return [];
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > CALENDAR_CACHE_MAX_AGE_MS) {
      return [];
    }
    return parsed.items.filter(
      (i) => i && typeof i.date === "string" && typeof i.title === "string" && isValidDate(i.date),
    );
  } catch {
    return [];
  }
}

function writeCalendarCache(items: CalendarItem[]) {
  try {
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), items }),
    );
  } catch {
    // Best-effort: quota or private mode must never break the calendar.
  }
}

// Drop cached entries whose title is no longer in Watch Later, so removed
// titles don't linger after a fresh visit.
function pruneCalendarCache(
  cached: CalendarItem[],
  wlItems: WatchLaterItem[],
  epItems: EpisodeWatchLaterItem[],
): CalendarItem[] {
  const keep = new Set<string>();
  for (const w of wlItems) keep.add(`${w.type}-${String(w.id)}`);
  for (const e of epItems) keep.add(`tv-${String(e.showId)}`);
  return cached.filter((c) =>
    keep.has(c.type === "episode" ? `tv-${String(c.id)}` : `${c.type}-${String(c.id)}`),
  );
}

export default function WatchLater() {
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [epItems, setEpItems] = useState<EpisodeWatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [calendarHasLoaded, setCalendarHasLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(() => todayLocal());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [sortBy, setSortBy] = useState("recent");
  const [filterType, setFilterType] = useState("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [hideUnreleasedPosters, setHideUnreleasedPosters] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const calendarInitedRef = useRef(false);
  const loadingCalendarRef = useRef(false);
  const calendarItemsRef = useRef<CalendarItem[]>([]);
  const ITEMS_PER_PAGE = 20;
  const DAYS_PER_PAGE = 3;
  const toast = useToast();
  const { getSignal } = useAbortController();

  const fetchTVFutureEpisodes = useCallback(
    async (
      showId: string | number,
      signal?: AbortSignal,
    ): Promise<CalendarItem[]> => {
      const results: CalendarItem[] = [];
      try {
        const detail = await getTVDetail(showId, signal);
        if (!detail) return results;
        const nextEp = (detail as Record<string, unknown>)
          .next_episode_to_air as
          | {
              air_date: string;
              season_number: number;
              episode_number: number;
              name: string;
            }
          | undefined;
        const nextSeasonNumber = nextEp?.season_number;
        const seasons = (
          ((detail as Record<string, unknown>).seasons as TMDBSeason[]) || []
        ).filter((s: TMDBSeason) => s.season_number > 0);

        for (const season of seasons) {
          if (nextSeasonNumber && season.season_number !== nextSeasonNumber) {
            continue;
          }
          if (
            !season.air_date &&
            !(nextEp && season.season_number === nextSeasonNumber)
          ) {
            continue;
          }

          try {
            const seasonDetail = await getSeasonDetails(
              showId,
              season.season_number,
              signal,
            );
            const episodes =
              ((seasonDetail as Record<string, unknown>)
                ?.episodes as TMDBEpisode[]) || [];
            for (const ep of episodes) {
              if (ep.air_date && isCalendarRelevant(ep.air_date)) {
                const dup = results.some(
                  (r) =>
                    r.season === season.season_number &&
                    r.episode === ep.episode_number &&
                    r.date === ep.air_date,
                );
                if (!dup) {
                  results.push({
                    date: ep.air_date,
                    title: (detail as Record<string, unknown>).name as string,
                    type: "episode",
                    id: showId,
                    poster: (detail as Record<string, unknown>).poster_path as
                      | string
                      | undefined,
                    season: season.season_number,
                    episode: ep.episode_number,
                    episodeTitle: ep.name,
                  });
                }
              }
            }
          } catch {
            // Per-season failure: skip season, keep other results.
            continue;
          }
        }

        if (nextEp?.air_date && isCalendarRelevant(nextEp.air_date)) {
          const n = nextEp;
          const dup = results.some(
            (r) =>
              r.season === n.season_number &&
              r.episode === n.episode_number &&
              r.date === n.air_date,
          );
          if (!dup) {
            results.push({
              date: n.air_date,
              title: detail.name,
              type: "episode",
              id: showId,
              poster: (detail as Record<string, unknown>).poster_path as
                | string
                | undefined,
              season: n.season_number,
              episode: n.episode_number,
              episodeTitle: n.name,
            });
          }
        }
      } catch (err) {
        // Aborted: swallow. Real failure: propagate so the caller can
        // record a partial/complete failure (successful items are kept).
        if (signal?.aborted) return results;
        throw err;
      }
      return results;
    },
    [],
  );

  const fetchMovieRelease = useCallback(
    async (
      item: WatchLaterItem,
      signal?: AbortSignal,
    ): Promise<CalendarItem | null> => {
      try {
        const detail = (await getMovieDetail(item.id, signal)) as {
          release_date?: string;
          title?: string;
          poster_path?: string | null;
        };
        if (detail?.release_date && isCalendarRelevant(detail.release_date)) {
          return {
            date: detail.release_date,
            title: detail.title || "",
            type: "movie",
            id: item.id,
            poster: detail.poster_path || undefined,
          };
        }
      } catch (err) {
        if (signal?.aborted) return null;
        throw err;
      }
      return null;
    },
    [],
  );

  const loadCalendarItems = useCallback(async () => {
    if (loadingCalendarRef.current) return;
    loadingCalendarRef.current = true;
    setLoadingCalendar(true);
    setCalendarError(null);
    const signal = getSignal();
    const wlItems = getWatchLater();
    const epwlItems = getEpisodeWatchLater();
    const CONCURRENCY = 3;
    let hasErrors = false;
    // Progressive rendering: flush each resolved batch into state so the
    // grid fills in as fetches resolve instead of waiting for everything.
    // Seed with whatever is already on screen (e.g. hydrated cache) so a
    // background refresh never duplicates it.
    const seenKeys = new Set<string>();
    for (const item of calendarItemsRef.current) seenKeys.add(calendarKey(item));
    let freshCount = 0;
    const flushBatch = (incoming: CalendarItem[]) => {
      if (signal.aborted || incoming.length === 0) return;
      const fresh: CalendarItem[] = [];
      for (const item of incoming) {
        const key = calendarKey(item);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        fresh.push(item);
      }
      if (fresh.length === 0) return;
      freshCount += fresh.length;
      setCalendarItems((prev) =>
        [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
      );
    };

    const wlPosterMap = new Map<string, string | undefined>();
    for (const wl of wlItems) {
      if (wl.poster) wlPosterMap.set(String(wl.id), wl.poster);
    }

    // Dedupe: same show/season may appear as both a show-level entry and
    // one or more episode entries. Fetch each unique show/season once.
    const seenShowIds = new Set<string>();
    const uniqueWlItems: WatchLaterItem[] = [];
    for (const item of wlItems) {
      const key = `${item.type}-${String(item.id)}`;
      if (seenShowIds.has(key)) continue;
      seenShowIds.add(key);
      uniqueWlItems.push(item);
    }

    for (let i = 0; i < uniqueWlItems.length; i += CONCURRENCY) {
      if (signal.aborted) break;
      const batch = uniqueWlItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (item: WatchLaterItem) => {
          if (item.type === "movie") return fetchMovieRelease(item, signal);
          return fetchTVFutureEpisodes(item.id, signal);
        }),
      );
      const batchVals: CalendarItem[] = [];
      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          const val = r.value;
          if (val && Array.isArray(val)) batchVals.push(...val);
          else if (val) batchVals.push(val);
        } else {
          hasErrors = true;
        }
      }
      flushBatch(batchVals);
    }

    // Share in-flight season requests so the same (show, season) is only
    // fetched once even if referenced by multiple episode entries.
    const seasonCache = new Map<string, Promise<unknown>>();
    const getSeasonOnce = (showId: string | number, season: number) => {
      const key = `${String(showId)}-S${season}`;
      const cached = seasonCache.get(key);
      if (cached) return cached;
      const p = getSeasonDetails(showId, season, signal);
      seasonCache.set(key, p);
      return p;
    };

    const seenEpKeys = new Set<string>();
    const uniqueEpItems: EpisodeWatchLaterItem[] = [];
    for (const epwl of epwlItems) {
      const key = `${String(epwl.showId)}-S${epwl.season}E${epwl.episode}`;
      if (seenEpKeys.has(key)) continue;
      seenEpKeys.add(key);
      uniqueEpItems.push(epwl);
    }

    for (let i = 0; i < uniqueEpItems.length; i += CONCURRENCY) {
      if (signal.aborted) break;
      const batch = uniqueEpItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (epwl: EpisodeWatchLaterItem) => {
          try {
            const seasonDetail = (await getSeasonOnce(
              epwl.showId,
              epwl.season,
            )) as {
              episodes?: {
                episode_number: number;
                air_date?: string;
                name?: string;
              }[];
            };
            const ep = seasonDetail?.episodes?.find(
              (e) => e.episode_number === epwl.episode,
            );
            if (ep?.air_date && isCalendarRelevant(ep.air_date)) {
              return {
                date: ep.air_date,
                title: epwl.showTitle,
                type: "episode" as const,
                id: epwl.showId,
                poster: wlPosterMap.get(String(epwl.showId)),
                season: epwl.season,
                episode: epwl.episode,
                episodeTitle: ep.name,
              };
            }
          } catch (err) {
            if (signal?.aborted) return null;
            throw err;
          }
          return null;
        }),
      );
      const batchVals: CalendarItem[] = [];
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) batchVals.push(r.value);
        else if (r.status === "rejected") hasErrors = true;
      }
      flushBatch(batchVals);
    }

    if (signal.aborted) {
      loadingCalendarRef.current = false;
      setLoadingCalendar(false);
      return;
    }
    setCalendarHasLoaded(true);
    // seenKeys holds cached + freshly loaded entries, so it reflects what
    // is (or is about to be) on screen even if the last flush hasn't
    // re-rendered yet.
    if (hasErrors && seenKeys.size > 0) {
      setCalendarError("Some releases could not be loaded. Displaying available data.");
    } else if (hasErrors && seenKeys.size === 0) {
      setCalendarError("Failed to load releases. Please try again.");
    }
    loadingCalendarRef.current = false;
    setLoadingCalendar(false);
  }, [fetchTVFutureEpisodes, fetchMovieRelease, getSignal]);

  useEffect(() => {
    document.title = "Watch Later - StreamFlow";
    const wl = getWatchLater();
    const epwl = getEpisodeWatchLater();
    setItems(wl);
    setEpItems(epwl);
    setLoading(false);
    // Paint instantly from the previous visit's cache (pruned to the
    // current library). Fresh data is fetched in the background once the
    // calendar or upcoming list is actually opened.
    const pruned = pruneCalendarCache(readCalendarCache(), wl, epwl);
    if (pruned.length > 0) setCalendarItems(pruned);
    // Defer heavy release fetching until the user actually opens the
    // calendar or the upcoming list, so the list + calendar button render
    // instantly.
  }, []);

  useEffect(() => {
    calendarItemsRef.current = calendarItems;
  }, [calendarItems]);

  // Persist freshly loaded releases so the next visit renders instantly.
  // Only after a real API load, so a bare cache hydrate never overwrites
  // the stored snapshot with itself; removals stay in sync afterwards.
  useEffect(() => {
    if (calendarHasLoaded) writeCalendarCache(calendarItems);
  }, [calendarItems, calendarHasLoaded]);

  // Load releases on demand: first time the calendar view or the upcoming
  // list is requested. The calendar grid itself renders immediately.
  useEffect(() => {
    if ((view === "calendar" || showUpcoming) && !calendarHasLoaded && !loadingCalendar) {
      loadCalendarItems();
    }
  }, [view, showUpcoming, calendarHasLoaded, loadingCalendar, loadCalendarItems]);

  useEffect(() => {
    if (view === "calendar") {
      if (!calendarInitedRef.current) {
        // Default to today when opening the calendar.
        const now = new Date();
        setCalYear(now.getFullYear());
        setCalMonth(now.getMonth());
        setSelectedDate(todayLocal());
        calendarInitedRef.current = true;
      }
    } else {
      calendarInitedRef.current = false;
    }
  }, [view]);

  function handleRemove(type: string, id: string | number) {
    removeWatchLater(type as MediaType, id);
    setItems(getWatchLater());
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.delete(`${type}-${String(id)}`);
      return next;
    });
    // TV calendar entries use type "episode", not "tv" - match by id so a
    // removed show doesn't linger in the calendar/upcoming list.
    setCalendarItems((prev) =>
      prev.filter((c) => {
        if (String(c.id) !== String(id)) return true;
        return type === "movie" ? c.type !== "movie" : c.type !== "episode";
      }),
    );
    toast?.("Removed from Watch Later");
  }

  function handleRemoveEp(
    showId: string | number,
    season: number,
    episode: number,
  ) {
    removeEpisodeWatchLater(showId, season, episode);
    setEpItems(getEpisodeWatchLater());
    setCalendarItems((prev) =>
      prev.filter(
        (c) =>
          !(
            String(c.id) === String(showId) &&
            c.season === season &&
            c.episode === episode
          ),
      ),
    );
    toast?.("Removed from Watch Later");
  }

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of calendarItems) {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    }
    return map;
  }, [calendarItems]);

  const today = useMemo(() => new Date(), []);

  const calendarGrid = useMemo(
    () => generateCalendarGrid(calYear, calMonth, selectedDate ?? undefined, today),
    [calYear, calMonth, selectedDate, today],
  );

  function prevMonth() {
    const { year, month } = navigateMonth(calYear, calMonth, 'prev');
    setCalYear(year);
    setCalMonth(month);
  }

  function nextMonth() {
    const { year, month } = navigateMonth(calYear, calMonth, 'next');
    setCalYear(year);
    setCalMonth(month);
  }

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  const groupedUpcomingList = useMemo(() => {
    const sorted = Object.keys(itemsByDate)
      .filter((date) => isFuture(date))
      .sort();
    return sorted.map((date) => ({ date, items: itemsByDate[date] }));
  }, [itemsByDate]);

  const totalPages = Math.max(
    1,
    Math.ceil(groupedUpcomingList.length / DAYS_PER_PAGE),
  );
  const paginatedGroups = useMemo(() => {
    const start = upcomingPage * DAYS_PER_PAGE;
    return groupedUpcomingList.slice(start, start + DAYS_PER_PAGE);
  }, [groupedUpcomingList, upcomingPage, DAYS_PER_PAGE]);

  const unreleasedKeys = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const c of calendarItems) {
      const key = `${c.type === "episode" ? "tv" : c.type}-${String(c.id)}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(c);
    }

    const keys = new Set<string>();
    for (const [key, items] of grouped.entries()) {
      if (items.every(item => isFuture(item.date))) {
        keys.add(key);
      }
    }
    return keys;
  }, [calendarItems]);

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (hideUnreleasedPosters)
      list = list.filter(
        (i: WatchLaterItem) =>
          !unreleasedKeys.has(`${i.type}-${String(i.id)}`),
      );
    if (filterType === "movies")
      list = list.filter((i: WatchLaterItem) => i.type === "movie");
    else if (filterType === "tv")
      list = list.filter((i: WatchLaterItem) => i.type === "tv");
    if (sortBy === "title")
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "year")
      list.sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }, [items, sortBy, filterType, hideUnreleasedPosters, unreleasedKeys]);

  const pagedItems = useMemo(
    () => sortedItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [sortedItems, page, ITEMS_PER_PAGE],
  );

  const listPages = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE));
  const upcomingCalendarCount = calendarItems.filter((c) => isFuture(c.date)).length;

  useEffect(() => {
    if (upcomingPage >= totalPages)
      setUpcomingPage(Math.max(0, totalPages - 1));
  }, [totalPages, upcomingPage]);

  useEffect(() => {
    if (page > listPages) setPage(listPages);
  }, [listPages, page]);

  useEffect(() => {
    const valid = new Set(sortedItems.map((item) => wlItemKey(item)));
    setSelectedKeys((prev) => {
      const next = new Set<string>();
      for (const key of prev) {
        if (valid.has(key)) next.add(key);
      }
      return next;
    });
  }, [sortedItems]);

  function toggleSelectItem(item: WatchLaterItem) {
    const key = wlItemKey(item);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectCurrentPage() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const item of pagedItems) next.add(wlItemKey(item));
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function removeSelected() {
    if (selectedKeys.size === 0) return;
    if (!window.confirm(`Remove ${selectedKeys.size} selected item${selectedKeys.size === 1 ? "" : "s"} from Watch Later?`)) {
      return;
    }
    const selected = new Set(selectedKeys);
    const selectedItems = items.filter((item) => selected.has(wlItemKey(item)));
    if (selectedItems.length === 0) return;
    for (const item of selectedItems) {
      removeWatchLater(item.type, item.id);
    }
    setItems((prev) => prev.filter((item) => !selected.has(wlItemKey(item))));
    setCalendarItems((prev) =>
      prev.filter((c) => {
        if (c.type === "movie") return !selected.has(`movie-${String(c.id)}`);
        if (c.type === "episode") return !selected.has(`tv-${String(c.id)}`);
        return true;
      }),
    );
    clearSelection();
    toast?.(`${selectedItems.length} item${selectedItems.length === 1 ? "" : "s"} removed from Watch Later`);
  }

  if (view === "calendar") {
    const maxPosters = 1;

    // Show full skeleton only on first load with no data yet. Once we have
    // (or had) data, render the grid immediately and stream releases in.
    if (loadingCalendar && calendarItems.length === 0 && !calendarHasLoaded) {
      return (
        <div className="page">
          <section className="section">
            <div className={styles.calHeader}>
              <div>
                <h2 className="section-title">Release Calendar</h2>

                <span className={styles.calSubtitle}>
                  Upcoming releases from your Watch Later library
                </span>
              </div>

              <div className={styles.calHeaderActions}>
                <div className={styles.calSkeletonBtn} />
                <div className={styles.calSkeletonBtn} />
              </div>
            </div>

            <div className={styles.calendarCard}>
              <div className={styles.calendarTop}>
                <div className={styles.calSkeletonNav} />

                <div className={styles.calSkeletonTitle} />

                <div className={styles.calSkeletonNav} />
              </div>

              <div className={styles.calSkeletonGrid}>
                {Array.from({ length: calendarGrid.cells.length || 35 }).map((_, i) => (
                  <div key={i} className={styles.calSkeletonCell} />
                ))}
              </div>
            </div>

            <div className={styles.dayPanel}>
              <div className={styles.calSkeletonPanelTitle} />

              <div className={styles.calSkeletonRow} />

              <div className={styles.calSkeletonRow} />

              <div className={styles.calSkeletonRow} />
            </div>
          </section>
        </div>
      );
    }

    return (
      <div className="page">
        <section className="section">
          <div className={styles.calHeader}>
            <div>
              <h2 className="section-title">Release Calendar</h2>

              <span className={styles.calSubtitle}>
                Upcoming releases from your Watch Later library
                {loadingCalendar && calendarHasLoaded ? " · Updating…" : loadingCalendar ? " · Loading…" : ""}
              </span>
            </div>

            <div className={styles.calHeaderActions}>
              <button
                className={styles.todayBtn}
                onClick={() => {
                  const now = new Date();

                  setCalYear(now.getFullYear());
                  setCalMonth(now.getMonth());

                  setSelectedDate(formatISODate(now));
                }}
              >
                Today
              </button>

              <button
                className={styles.viewToggle}
                onClick={() => setView("list")}
              >
                Back to List
              </button>
            </div>
          </div>

          <div className={styles.calendarCard}>
            <div className={styles.calendarTop}>
              <button
                className={styles.calNav}
                onClick={prevMonth}
                aria-label={`Previous month, ${getMonthName(calMonth === 0 ? 11 : calMonth - 1)} ${calMonth === 0 ? calYear - 1 : calYear}`}
              >
                ←
              </button>

              <div className={styles.monthTitle}>
                {calendarGrid.monthName} {calendarGrid.year}
              </div>

              <button
                className={styles.calNav}
                onClick={nextMonth}
                aria-label={`Next month, ${getMonthName(calMonth === 11 ? 0 : calMonth + 1)} ${calMonth === 11 ? calYear + 1 : calYear}`}
              >
                →
              </button>
            </div>

            <div className={styles.calGrid}>
              {getWeekdays().map((day) => (
                <div key={day} className={styles.calWeekday}>
                  {day}
                </div>
              ))}

              {calendarGrid.cells.map((cell) => {
                const releases = itemsByDate[cell.isoString] || [];

                const heat = Math.min(3, releases.length);

                const today = cell.isToday;

                const past = cell.isPast;

                const selected = cell.isSelected;

                const cellLabel = `${cell.accessibleLabel}, ${releases.length} release${releases.length === 1 ? "" : "s"}${selected ? ", selected" : ""}`;
                return (
                  <button
                    key={cell.isoString}
                    disabled={false}
                    onClick={() => {
                      // Selecting an adjacent-month day only selects it;
                      // the visible month never changes on its own.
                      setSelectedDate(cell.isoString);
                    }}
                    aria-pressed={selected}
                    aria-label={cellLabel}
                    className={`
                    ${styles.calCell}
                    ${today ? styles.today : ""}
                    ${past ? styles.past : ""}
                    ${selected ? styles.selected : ""}
                    ${heat > 0 ? styles[`heat-${heat}`] : ""}
                  `}
                  >
                    <div className={styles.dayNumber}>{cell.dayNumber}</div>

                    {releases.length > 0 && (
                      <div
                        className={`${styles.posterRow} ${styles[`pcount-${Math.min(releases.length, 2)}`]}`}
                      >
                        {releases.slice(0, maxPosters).map((item, i) => (
                          <img
                            key={i}
                            src={imageUrl(item.poster ?? null, "w92")}
                            alt=""
                            loading="lazy"
                            className={styles.posterThumb}
                          />
                        ))}

                        {releases.length > maxPosters && (
                          <div className={styles.posterMore}>
                            +{releases.length - maxPosters}
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {calendarError && (
            <div className={styles.calendarError} role="alert">
              <span>{calendarError}</span>
              <button
                className={styles.retryBtn}
                onClick={loadCalendarItems}
                disabled={loadingCalendar}
              >
                {loadingCalendar ? "Retrying..." : "Retry"}
              </button>
            </div>
          )}

          <div className={styles.dayPanel}>
            {selectedDate ? (
              <>
                <div className={styles.dayPanelHeader}>
                  <h3>{formatDate(selectedDate)}</h3>

                  <span>
                    {selectedItems.length} release
                    {selectedItems.length !== 1 && "s"}
                  </span>
                </div>

                {selectedItems.length === 0 ? (
                  <div className={styles.emptyDay}>
                    Nothing releases on this day.
                  </div>
                ) : (
<div
                        className={`${styles.releaseGrid} ${styles[`count-${Math.min(selectedItems.length, 3)}`]}`}
                      >
                        {selectedItems.map((item) => (
                          <div
                            key={`${item.id}-${item.date}-${item.season}-${item.episode}`}
                            className={styles.releaseCard}
                          >
                            <img
                              src={imageUrl(item.poster ?? null, "w185")}
                              alt={`${item.title} poster`}
                              loading="lazy"
                              className={styles.releasePoster}
                            />

                            <div className={styles.releaseInfo}>
                              <h4>{item.title}</h4>

                              <span>
                                {item.type === "movie"
                                  ? "Movie"
                                  : `Season ${item.season}
                                   Episode ${item.episode}`}
                              </span>

                              {item.episodeTitle && <p>{item.episodeTitle}</p>}
                            </div>

                            <Link
                              className={styles.openBtn}
                              to={
                                item.type === "movie"
                                  ? `/movie/${item.id}`
                                  : `/tv/${item.id}?season=${item.season}&episode=${item.episode}`
                              }
                            >
                              Open
                            </Link>
                          </div>
                        ))}
                      </div>
                )}
              </>
            ) : (
              <div className={styles.emptyDay}>
                Select a day to see upcoming releases.
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Watch Later</h2>

        {loading ? (
          <CollectionSkeleton variant="grid" count={6} />
        ) : items.length === 0 && epItems.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing saved yet</h3>
            <p>
              Add movies, shows, or individual episodes to watch later and
              they'll show up here.
            </p>
            <div className="empty-state-actions">
              <Link to="/" className="empty-state-action">
                Browse trending
              </Link>
              <Link to="/movies" className="empty-state-action">
                Pick genres
              </Link>
              <Link to="/tv" className="empty-state-action">
                Explore TV
              </Link>
            </div>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <>
                <div className={styles.wlControls}>
                  <FilterDropdown
                    value={filterType}
                    options={[
                      { value: "all", label: "All types" },
                      { value: "movies", label: "Movies" },
                      { value: "tv", label: "TV Shows" },
                    ]}
                    placeholder="All types"
                    onSelect={(v: string) => {
                      setFilterType(v);
                      setPage(1);
                    }}
                  />
                  <FilterDropdown
                    value={sortBy}
                    options={[
                      { value: "recent", label: "Most recent" },
                      { value: "title", label: "Title A-Z" },
                      { value: "year", label: "Year" },
                    ]}
                    placeholder="Sort by"
                    onSelect={(v: string) => {
                      setSortBy(v);
                      setPage(1);
                    }}
                  />
                  {unreleasedKeys.size > 0 && (
                    <button
                      className={`${styles.wlClearBtn} ${hideUnreleasedPosters ? styles.active : ""}`}
                      onClick={() => setHideUnreleasedPosters((v) => !v)}
                      title={
                        hideUnreleasedPosters
                          ? "Show unreleased titles"
                          : "Hide unreleased titles"
                      }
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ verticalAlign: "-2px" }}
                      >
                        {hideUnreleasedPosters ? (
                          <>
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                      {hideUnreleasedPosters
                        ? "Show unreleased"
                        : "Hide unreleased"}
                    </button>
                  )}
                  {(filterType !== "all" || sortBy !== "recent") && (
                    <button
                      className={styles.wlClearBtn}
                      onClick={() => {
                        setFilterType("all");
                        setSortBy("recent");
                        setPage(1);
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                  {pagedItems.length > 0 && (
                    <button
                      className={styles.wlClearBtn}
                      onClick={selectCurrentPage}
                    >
                      Select page
                    </button>
                  )}
                  {selectedKeys.size > 0 && (
                    <button className={styles.wlClearBtn} onClick={clearSelection}>
                      Clear selection ({selectedKeys.size})
                    </button>
                  )}
                  <button
                    className={`${styles.wlClearBtn} ${styles.dangerBtn}`}
                    onClick={removeSelected}
                    disabled={selectedKeys.size === 0}
                    title={selectedKeys.size === 0 ? "Select items to remove" : "Remove selected items"}
                  >
                    Remove selected{selectedKeys.size > 0 ? ` (${selectedKeys.size})` : ""}
                  </button>
                </div>
                <div className="media-grid">
                  {pagedItems.map((item) => {
                    const selected = selectedKeys.has(wlItemKey(item));
                    return (
                      <div
                        key={`${(item as WatchLaterItem).type}-${(item as WatchLaterItem).id}`}
                        className={`media-card ${selected ? styles.selectedCard : ""}`}
                      >
                        <button
                          className={`${styles.selectBtn} ${selected ? styles.selectBtnActive : ""}`}
                          onClick={() => toggleSelectItem(item)}
                          aria-pressed={selected}
                          title={selected ? "Unselect item" : "Select item"}
                        >
                          {selected ? "✓" : "+"}
                        </button>
                        <Link
                          to={`/${(item as WatchLaterItem).type === "tv" ? "tv" : "movie"}/${(item as WatchLaterItem).id}`}
                        >
                          <div className="media-card-poster">
                            <img
                              src={
                                (item as WatchLaterItem).poster ||
                                imageUrl(null)
                              }
                              alt={(item as WatchLaterItem).title}
                              loading="lazy"
                            />
                            <WlRatingBadge
                              type={(item as WatchLaterItem).type}
                              id={(item as WatchLaterItem).id}
                              title={(item as WatchLaterItem).title}
                              year={(item as WatchLaterItem).year || ""}
                            />
                            <span
                              className={`media-card-type ${(item as WatchLaterItem).type}`}
                            >
                              {(item as WatchLaterItem).type === "tv"
                                ? "TV"
                                : "Movie"}
                            </span>
                          </div>
                          <div className="media-card-info">
                            <h3>{(item as WatchLaterItem).title}</h3>
                            {(item as WatchLaterItem).year && (
                              <span className="media-card-year">
                                {(item as WatchLaterItem).year}
                              </span>
                            )}
                          </div>
                        </Link>
                        <button
                          className="wl-remove"
                          onClick={() =>
                            handleRemove(
                              (item as WatchLaterItem).type,
                              (item as WatchLaterItem).id,
                            )
                          }
                          title="Remove"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
                {listPages > 1 && (
                  <Pagination page={page} totalPages={listPages} onChange={setPage} />
                )}
              </>
            )}
            {epItems.length > 0 && (
              <>
                <h3 className="sub-section-title">Episodes</h3>
                <div className="media-grid">
                  {epItems.map((item) => (
                    <div
                      key={`${(item as EpisodeWatchLaterItem).showId}-S${(item as EpisodeWatchLaterItem).season}E${(item as EpisodeWatchLaterItem).episode}`}
                      className={`media-card ${styles.epWlCard}`}
                    >
                      <Link
                        to={`/tv/${(item as EpisodeWatchLaterItem).showId}?season=${(item as EpisodeWatchLaterItem).season}&episode=${(item as EpisodeWatchLaterItem).episode}`}
                      >
                        <div className="media-card-info">
                          <h3>{(item as EpisodeWatchLaterItem).showTitle}</h3>
                          <span className="media-card-year">
                            S{(item as EpisodeWatchLaterItem).season} E
                            {(item as EpisodeWatchLaterItem).episode}
                          </span>
                        </div>
                      </Link>
                      <button
                        className="wl-remove"
                        onClick={() =>
                          handleRemoveEp(
                            (item as EpisodeWatchLaterItem).showId,
                            (item as EpisodeWatchLaterItem).season,
                            (item as EpisodeWatchLaterItem).episode,
                          )
                        }
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {(items.length > 0 || epItems.length > 0) && (
          <div className={styles.upcomingBanner}>
            {loadingCalendar && calendarItems.length === 0 ? (
              <span className={styles.upcomingToggleLabel}>
                Loading releases…
              </span>
            ) : upcomingCalendarCount > 0 ? (
              <button
                className={styles.upcomingToggle}
                onClick={() => setShowUpcoming((v) => !v)}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className={styles.upcomingToggleLabel}>
                  {upcomingCalendarCount} upcoming{loadingCalendar ? " ···" : ""}
                </span>
                <span className={styles.upcomingToggleArrow}>
                  {showUpcoming ? "\u25B2" : "\u25BC"}
                </span>
              </button>
            ) : (
              <span className={styles.upcomingToggleLabel}>
                No upcoming releases
              </span>
            )}
            <button
              className={styles.calIconBtn}
              onClick={() => setView("calendar")}
              aria-label="View full calendar"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>
        )}

        {showUpcoming &&
          loadingCalendar &&
          calendarItems.length === 0 &&
          (items.length > 0 || epItems.length > 0) && (
            <div className={styles.upcomingList}>
              <div
                className={styles.skeletonLine}
                style={{
                  width: "40%",
                  height: "0.8rem",
                  marginBottom: "0.75rem",
                }}
              />
              <div
                className={styles.skeletonLine}
                style={{
                  width: "30%",
                  height: "0.7rem",
                  marginBottom: "0.5rem",
                }}
              />
              <div className={styles.skeletonRow} />
              <div className={styles.skeletonRow} />
              <div className={styles.skeletonRow} />
              <div className={styles.skeletonRow} />
            </div>
          )}

        {showUpcoming && calendarItems.length > 0 && (
          <div className={styles.upcomingList}>
            {paginatedGroups.map((group) => (
              <div key={group.date} className={styles.upcomingDateGroup}>
                <div className={styles.upcomingDateLabel}>
                  {formatDate(group.date)}
                </div>
                {group.items.map((item, idx) => (
                  <div
                    key={`${item.date}-${item.type}-${item.id}-S${item.season}E${item.episode}-${idx}`}
                    className={styles.upcomingItem}
                  >
                    <div className={styles.upcomingItemInfo}>
                      <div className={styles.upcomingItemTitle}>
                        {item.title}
                      </div>
                      <div className={styles.upcomingItemDetail}>
                        {item.type === "movie"
                          ? "Movie"
                          : `S${item.season} E${item.episode ?? "\u2014"}`}
                        {item.episodeTitle && (
                          <span> &middot; {item.episodeTitle}</span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={
                        item.type === "movie"
                          ? `/movie/${item.id}`
                          : `/tv/${item.id}?season=${item.season}&episode=${item.episode}`
                      }
                      className={styles.upcomingItemOpen}
                    >
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            ))}
            {totalPages > 1 && (
              <div className={styles.upcomingPagination}>
                <button
                  className={styles.pageBtn}
                  disabled={upcomingPage <= 0}
                  onClick={() => setUpcomingPage((p) => Math.max(0, p - 1))}
                >
                  &lsaquo; Prev
                </button>
                <span className={styles.pageInfo}>
                  {upcomingPage + 1} / {totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  disabled={upcomingPage >= totalPages - 1}
                  onClick={() =>
                    setUpcomingPage((p) => Math.min(totalPages - 1, p + 1))
                  }
                >
                  Next &rsaquo;
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
