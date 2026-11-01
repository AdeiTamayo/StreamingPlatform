import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../i18n/usePageTitle";
import i18n, { toBcp47 } from "../i18n";
import {
  getWatchLater,
  removeWatchLater,
  getEpisodeWatchLater,
  removeEpisodeWatchLater,
  getEffectiveTimezone,
  getUpcomingOpen,
  setUpcomingOpen,
} from "../api/storage";
import {
  imageUrl,
  safeImageUrl,
  getMovieDetail,
  getTVDetail,
  getSeasonDetails,
  getTVExternalIds,
} from "../api/tmdb";
import { getEpisodeAirInstant } from "../api/tvmaze";
import CollectionSkeleton from "../components/CollectionSkeleton";
import RatingBadge from "../components/RatingBadge";
import FilterDropdown from "../components/FilterDropdown";
import TypeToggle from "../components/TypeToggle";
import SelectIcon from "../components/SelectIcon";
import Pagination from "../components/Pagination";
import CloseIcon from "../components/CloseIcon";
import BulkSelectBar from "../components/BulkSelectBar";
import useBulkSelect from "../components/useBulkSelect";
import bulkStyles from "../components/BulkSelectBar.module.css";
import { useToast } from "../components/useToast";
import { useAbortController } from "../hooks/useAbortController";
import {
  generateCalendarGrid,
  getWeekdays,
  getMonthName,
  navigateMonth,
  isValidDate,
  toZonedDateString,
} from "../utils/calendar";
import type {
  WatchLaterItem,
  EpisodeWatchLaterItem,
  CalendarItem,
  TMDBSeason,
  TMDBEpisode,
  MediaType,
} from "../types";
import styles from "./WatchLater.module.css";

const ITEMS_PER_PAGE = 20;
const DAYS_PER_PAGE = 3;

function wlKey(type: string, id: string | number) {
  return `${type}-${String(id)}`;
}

// Episode entries live in their own Watch Later store, so they get their
// own key space ("episode-<showId>-S<season>E<episode>") that can never
// collide with a movie/tv key.
function epKey(showId: string | number, season: number, episode: number) {
  return `episode-${String(showId)}-S${season}E${episode}`;
}

function parseEpKey(key: string) {
  const m = /^episode-(.+)-S(\d+)E(\d+)$/.exec(key);
  if (!m) return null;
  return { showId: m[1], season: Number(m[2]), episode: Number(m[3]) };
}

function parseLocalDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isFuture(dateStr: string) {
  const d = parseLocalDate(dateStr);
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
}

// A release counts as upcoming by its exact broadcast instant when known
// (US evening = next morning in Spain), falling back to day granularity.
function isUpcomingRelease(item: CalendarItem, now: number = Date.now()) {
  if (item.airTimestamp != null) return item.airTimestamp > now;
  return isFuture(item.date);
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



function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  // The string is already the calendar date in the release timezone (see
  // toZonedDateString), so render exactly that date. Interpreting it as a
  // device-local noon and re-formatting in another zone (the old code) shifts
  // the label by a day whenever the two zones are 12h+ apart.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(
    toBcp47(i18n.resolvedLanguage || i18n.language),
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    },
  );
}

function calendarKey(item: CalendarItem) {
  return `${item.type}-${item.id}-${item.date}-S${item.season ?? 0}E${item.episode ?? 0}`;
}

// Structural guarantee: the UI can never render the same release twice,
// no matter how duplicates entered state (stale hydrate racing a load,
// an old poisoned cache, StrictMode double-mounts in dev). Prefers the
// copy carrying the exact broadcast instant so timezone bucketing survives.
//
// Identity is the release itself (type, id, season, episode), not its date: an
// episode airs once, and the stored TMDB date can disagree between two copies
// (a stale cache entry and a fresh one). Keying on the raw date let both
// survive, and then the display step moved them onto the same day, which
// rendered the episode twice and made React warn about duplicate keys.
function releaseIdentity(item: CalendarItem) {
  return `${item.type}-${item.id}-S${item.season ?? 0}E${item.episode ?? 0}`;
}

function dedupeCalendarItems(items: CalendarItem[]): CalendarItem[] {
  const seen = new Set<string>();
  const out: CalendarItem[] = [];
  const ranked = [...items].sort(
    (a, b) => Number(b.airTimestamp != null) - Number(a.airTimestamp != null),
  );
  for (const item of ranked) {
    const key = releaseIdentity(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Persisted release-calendar cache so a return visit paints instantly from
// the previous load while fresh data is fetched in the background.
export const CALENDAR_CACHE_KEY = "streamflow:calendar-cache:v1";
const CALENDAR_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readCalendarCache(): CalendarItem[] {
  try {
    const raw = localStorage.getItem(CALENDAR_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      savedAt?: number;
      items?: CalendarItem[];
    };
    if (!parsed || !Array.isArray(parsed.items)) return [];
    if (
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > CALENDAR_CACHE_MAX_AGE_MS
    ) {
      return [];
    }
    return parsed.items.filter(
      (i) =>
        i &&
        typeof i.date === "string" &&
        typeof i.title === "string" &&
        isValidDate(i.date),
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
    keep.has(
      c.type === "episode" ? `tv-${String(c.id)}` : `${c.type}-${String(c.id)}`,
    ),
  );
}

export default function WatchLater() {
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [epItems, setEpItems] = useState<EpisodeWatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState<"partial" | "failed" | null>(null);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [calendarHasLoaded, setCalendarHasLoaded] = useState(false);
  const [timeZone] = useState(getEffectiveTimezone);
  const todayStr = useMemo(
    () => toZonedDateString(Date.now(), timeZone),
    [timeZone],
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    toZonedDateString(Date.now(), getEffectiveTimezone()),
  );
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [sortBy, setSortBy] = useState("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState<"list" | "calendar">("list");
  // Expanded by default; the toggle persists locally.
  const [showUpcoming, setShowUpcoming] = useState(() => getUpcomingOpen());

  function toggleUpcoming() {
    const next = !showUpcoming;
    setShowUpcoming(next);
    setUpcomingOpen(next);
  }
  const [hideUnreleasedPosters, setHideUnreleasedPosters] = useState(false);
  // Both paginators are 1-indexed, matching the shared Pagination component.
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [page, setPage] = useState(1);
  const [epPage, setEpPage] = useState(1);
  const calendarInitedRef = useRef(false);
  const loadingCalendarRef = useRef(false);
  const toast = useToast();
  const { t } = useTranslation();
  const { getSignal } = useAbortController();

  usePageTitle(t("watchLater.title"));

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
    // Seed from the same pruned cache the mount hydrate uses (read fresh
    // from storage, not from the ref: on first open the load can start in
    // the same commit as hydration, before the ref has caught up - seeding
    // from a stale ref duplicates every cached entry).
    const hydratedSeed = pruneCalendarCache(readCalendarCache(), wlItems, epwlItems);
    const seenKeys = new Set<string>();
    for (const item of hydratedSeed) seenKeys.add(calendarKey(item));
    let freshCount = 0;
    // Mirror of everything known (cached + flushed) for the airtime pass.
    const allItems: CalendarItem[] = [...hydratedSeed];
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
      allItems.push(...fresh);
      setCalendarItems((prev) =>
        [...prev, ...fresh].sort((a, b) => a.date.localeCompare(b.date)),
      );
    };

    // Second pass: exact broadcast instants for every episode in the
    // calendar, so each lands on the day it airs in the viewer's timezone.
    // Cached afterwards, so repeat visits resolve (almost) everything
    // without network.
    const enrichAirTimes = async () => {
      const candidates = allItems.filter(
        (c) =>
          c.type === "episode" &&
          c.airTimestamp == null &&
          c.season != null &&
          c.episode != null,
      );
      if (candidates.length === 0 || signal.aborted) return;
      const showIds = [...new Set(candidates.map((c) => String(c.id)))];
      const imdbByShow = new Map<string, string | null>();
      await Promise.all(
        showIds.map(async (sid) => {
          const sample = candidates.find((c) => String(c.id) === sid);
          if (!sample) return;
          try {
            const ext = (await getTVExternalIds(sample.id, signal)) as {
              imdb_id?: string | null;
            };
            imdbByShow.set(sid, ext?.imdb_id || null);
          } catch {
            imdbByShow.set(sid, null);
          }
        }),
      );
      if (signal.aborted) return;
      const updates = new Map<string, number>();
      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        if (signal.aborted) return;
        await Promise.all(
          candidates.slice(i, i + CONCURRENCY).map(async (c) => {
            const imdb = imdbByShow.get(String(c.id));
            if (!imdb || c.season == null || c.episode == null) return;
            try {
              const ts = await getEpisodeAirInstant(
                imdb,
                c.season,
                c.episode,
                signal,
              );
              if (ts != null) updates.set(calendarKey(c), ts);
            } catch {
              // Keep date logic for this episode.
            }
          }),
        );
      }
      if (signal.aborted || updates.size === 0) return;
      setCalendarItems((prev) =>
        prev.map((c) => {
          const ts = updates.get(calendarKey(c));
          return ts != null ? { ...c, airTimestamp: ts } : c;
        }),
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
    // Resolve exact air times while the loading indicator is still up; the
    // grid already streams progressively, so this only refines it.
    await enrichAirTimes();
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
      setCalendarError("partial");
    } else if (hasErrors && seenKeys.size === 0) {
      setCalendarError("failed");
    }
    loadingCalendarRef.current = false;
    setLoadingCalendar(false);
  }, [fetchTVFutureEpisodes, fetchMovieRelease, getSignal]);

  useEffect(() => {
    const wl = getWatchLater();
    const epwl = getEpisodeWatchLater();
    setItems(wl);
    setEpItems(epwl);
    setLoading(false);
    // Paint instantly from the previous visit's cache (pruned to the
    // current library). Fresh data is fetched in the background once the
    // calendar or upcoming list is actually opened.
    const pruned = pruneCalendarCache(readCalendarCache(), wl, epwl);
    // Dedupe on read: a cache written while duplicates were on screen
    // would otherwise repaint them on every visit from now on.
    if (pruned.length > 0) setCalendarItems(dedupeCalendarItems(pruned));
    // Defer heavy release fetching until the user actually opens the
    // calendar or the upcoming list, so the list + calendar button render
    // instantly.
  }, []);

  // Persist freshly loaded releases so the next visit renders instantly.
  // Only after a real API load, so a bare cache hydrate never overwrites
  // the stored snapshot with itself; removals stay in sync afterwards.
  // Stored deduped (raw TMDB dates, never display buckets) so the snapshot
  // self-heals instead of preserving duplicates.
  useEffect(() => {
    if (calendarHasLoaded && !calendarError) {
      writeCalendarCache(dedupeCalendarItems(calendarItems));
    }
  }, [calendarItems, calendarHasLoaded, calendarError]);

  // Load releases on demand: first time the calendar view or the upcoming
  // list is requested, and once on mount when the library is non-empty so the
  // collapsed "Upcoming releases" panel reflects real data instead of a stale
  // cache (which could wrongly render "No upcoming releases").
  useEffect(() => {
    const hasLibrary = items.length > 0 || epItems.length > 0;
    if (
      (view === "calendar" || showUpcoming || hasLibrary) &&
      !calendarHasLoaded &&
      !loadingCalendar
    ) {
      loadCalendarItems();
    }
  }, [
    view,
    showUpcoming,
    items.length,
    epItems.length,
    calendarHasLoaded,
    loadingCalendar,
    loadCalendarItems,
  ]);

  useEffect(() => {
    if (view === "calendar") {
      if (!calendarInitedRef.current) {
        // Default to today (in the calendar timezone) when opening.
        const d = parseLocalDate(todayStr);
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
        setSelectedDate(todayStr);
        calendarInitedRef.current = true;
      }
    } else {
      calendarInitedRef.current = false;
    }
  }, [view, todayStr]);

  function handleRemove(type: string, id: string | number) {
    removeWatchLater(type as MediaType, id);
    setItems(getWatchLater());
    // TV calendar entries use type "episode", not "tv" - match by id so a
    // removed show doesn't linger in the calendar/upcoming list.
    setCalendarItems((prev) =>
      prev.filter((c) => {
        if (String(c.id) !== String(id)) return true;
        return type === "movie" ? c.type !== "movie" : c.type !== "episode";
      }),
    );
    toast?.(t("watchLater.toastRemoved"));
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
    toast?.(t("watchLater.toastRemoved"));
  }

  const handleRemoveSelected = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return;
      const removedEpKeys = new Set<string>();
      for (const key of keys) {
        const ep = parseEpKey(key);
        if (ep) {
          removedEpKeys.add(key);
          removeEpisodeWatchLater(ep.showId, ep.season, ep.episode);
          continue;
        }
        const sep = key.indexOf("-");
        const type = key.slice(0, sep) as MediaType;
        const id = key.slice(sep + 1);
        removeWatchLater(type, id);
      }
      setItems(getWatchLater());
      if (removedEpKeys.size > 0) setEpItems(getEpisodeWatchLater());
      const removed = new Set(keys);
      // Same type mapping as handleRemove: calendar rows use "episode" for TV.
      setCalendarItems((prev) =>
        prev.filter((c) => {
          const k =
            c.type === "movie" ? `movie-${String(c.id)}` : `tv-${String(c.id)}`;
          if (removed.has(k)) return false;
          // Drop the calendar row of a removed episode entry too.
          if (
            c.type === "episode" &&
            c.season != null &&
            c.episode != null &&
            removedEpKeys.has(epKey(c.id, c.season, c.episode))
          ) {
            return false;
          }
          return true;
        }),
      );
      toast?.(
        keys.length === 1
          ? t("watchLater.toastRemoved")
          : t("watchLater.toastRemovedMany", { count: keys.length }),
      );
    },
    [toast, t],
  );

  // Single choke point for everything rendered: state is deduped here so
  // a duplicate can never reach the grid, the upcoming list, or the counts.
  const visibleItems = useMemo(() => dedupeCalendarItems(calendarItems), [calendarItems]);

  // Display view of the releases: episodes with a known broadcast instant
  // are bucketed on the day they land on in the calendar timezone (US
  // Sunday primetime = Monday in Spain). Raw state keeps the TMDB date so
  // the stored cache stays zone-independent and switching zones recomputes
  // without refetching.
  const displayItems = useMemo(
    () =>
      visibleItems.map((c) =>
        c.airTimestamp != null ? { ...c, date: toZonedDateString(c.airTimestamp, timeZone) } : c,
      ),
    [visibleItems, timeZone],
  );

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of displayItems) {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    }
    return map;
  }, [displayItems]);

  const calendarGrid = useMemo(
    // User-timezone midnight: "today" highlighting and past/future shading
    // follow the selected zone, not necessarily the device zone.
    () =>
      generateCalendarGrid(
        calYear,
        calMonth,
        selectedDate ?? undefined,
        parseLocalDate(todayStr),
      ),
    [calYear, calMonth, selectedDate, todayStr],
  );

  function prevMonth() {
    const { year, month } = navigateMonth(calYear, calMonth, "prev");
    setCalYear(year);
    setCalMonth(month);
  }

  function nextMonth() {
    const { year, month } = navigateMonth(calYear, calMonth, "next");
    setCalYear(year);
    setCalMonth(month);
  }

  const selectedItems = useMemo(
    () => (selectedDate ? itemsByDate[selectedDate] || [] : []),
    [itemsByDate, selectedDate],
  );

  const groupedUpcomingList = useMemo(() => {
    const byDate: Record<string, CalendarItem[]> = {};
    for (const item of displayItems) {
      if (!isUpcomingRelease(item)) continue;
      if (!byDate[item.date]) byDate[item.date] = [];
      byDate[item.date].push(item);
    }
    return Object.keys(byDate)
      .sort()
      .map((date) => ({ date, items: byDate[date] }));
  }, [displayItems]);

  const totalPages = Math.max(
    1,
    Math.ceil(groupedUpcomingList.length / DAYS_PER_PAGE),
  );
  const paginatedGroups = useMemo(() => {
    const start = (upcomingPage - 1) * DAYS_PER_PAGE;
    return groupedUpcomingList.slice(start, start + DAYS_PER_PAGE);
  }, [groupedUpcomingList, upcomingPage]);

  const unreleasedKeys = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const c of displayItems) {
      const key = `${c.type === "episode" ? "tv" : c.type}-${String(c.id)}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(c);
    }

    const keys = new Set<string>();
    for (const [key, items] of grouped.entries()) {
      if (items.every((item) => isUpcomingRelease(item))) {
        keys.add(key);
      }
    }
    return keys;
  }, [displayItems]);

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (hideUnreleasedPosters)
      list = list.filter(
        (i: WatchLaterItem) => !unreleasedKeys.has(`${i.type}-${String(i.id)}`),
      );
    if (filterType === "movies")
      list = list.filter((i: WatchLaterItem) => i.type === "movie");
    else if (filterType === "tv")
      list = list.filter((i: WatchLaterItem) => i.type === "tv");
    const q = searchQuery.trim().toLowerCase();
    if (q)
      list = list.filter((i: WatchLaterItem) =>
        (i.title || "").toLowerCase().includes(q),
      );
    // Every field sorts both ways: descending is newest-first / Z-A /
    // newest-year, ascending reverses it.
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "title")
      list.sort((a, b) => dir * (a.title || "").localeCompare(b.title || ""));
    else if (sortBy === "year")
      list.sort((a, b) => dir * (a.year || "0").localeCompare(b.year || "0"));
    else list.sort((a, b) => dir * ((a.addedAt || 0) - (b.addedAt || 0)));
    return list;
  }, [
    items,
    sortBy,
    sortDir,
    filterType,
    searchQuery,
    hideUnreleasedPosters,
    unreleasedKeys,
  ]);

  // Episode entries are TV, so the "Movies" filter hides them entirely and
  // the search query narrows them by show title.
  const visibleEpItems = useMemo(() => {
    if (filterType === "movies") return [];
    let list = epItems;
    if (hideUnreleasedPosters) {
      list = list.filter(
        (i: EpisodeWatchLaterItem) =>
          !unreleasedKeys.has(`tv-${String(i.showId)}`),
      );
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i: EpisodeWatchLaterItem) =>
      (i.showTitle || "").toLowerCase().includes(q),
    );
  }, [epItems, filterType, searchQuery, hideUnreleasedPosters, unreleasedKeys]);

  const listPages = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE));
  const epListPages = Math.max(
    1,
    Math.ceil(visibleEpItems.length / ITEMS_PER_PAGE),
  );

  const pageSlice = useMemo(
    () => sortedItems.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE),
    [sortedItems, page],
  );
  const epPageSlice = useMemo(
    () =>
      visibleEpItems.slice(
        (epPage - 1) * ITEMS_PER_PAGE,
        epPage * ITEMS_PER_PAGE,
      ),
    [visibleEpItems, epPage],
  );

  const upcomingCalendarCount = useMemo(
    () => displayItems.filter((c) => isUpcomingRelease(c)).length,
    [displayItems],
  );

  // Keys of everything currently on screen, so "Select page" stays within the
  // visible slices (movies + episodes) exactly like Last Seen.
  const visiblePageKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of pageSlice) keys.push(wlKey(item.type, item.id));
    for (const ep of epPageSlice) {
      keys.push(epKey(ep.showId, ep.season, ep.episode));
    }
    return keys;
  }, [pageSlice, epPageSlice]);

  // Library present but the active filter/search matches nothing.
  const hasNoMatches =
    sortedItems.length === 0 && visibleEpItems.length === 0;
  const totalTitleCount = items.length + epItems.length;
  const visibleTitleCount = sortedItems.length + visibleEpItems.length;

  const {
    selectMode,
    selectedKeys,
    confirmingBulkRemove,
    selectedCount,
    toggleSelectMode,
    toggleKey,
    selectPage,
    clearSelection,
    requestRemove,
    keepSelection,
    removeSelected,
  } = useBulkSelect({
    visibleKeys: visiblePageKeys,
    onRemove: handleRemoveSelected,
  });

  useEffect(() => {
    if (upcomingPage > totalPages) setUpcomingPage(totalPages);
  }, [totalPages, upcomingPage]);

  useEffect(() => {
    if (page > listPages) setPage(listPages);
  }, [listPages, page]);

  useEffect(() => {
    if (epPage > epListPages) setEpPage(epListPages);
  }, [epListPages, epPage]);

  if (view === "calendar") {
    // Show full skeleton only on first load with no data yet. Once we have
    // (or had) data, render the grid immediately and stream releases in.
    if (loadingCalendar && calendarItems.length === 0 && !calendarHasLoaded) {
      return (
        <div className="page">
          <section className="section">
            <div className={styles.calHeader}>
              <div>
                <h2 className="section-title">
                  {t("watchLater.calendar.title")}
                </h2>
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
                {Array.from({ length: calendarGrid.cells.length || 35 }).map(
                  (_, i) => (
                    <div key={i} className={styles.calSkeletonCell} />
                  ),
                )}
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
              <h2 className="section-title">{t("watchLater.calendar.title")}</h2>

              <span className={styles.calSubtitle}>
                {loadingCalendar && calendarHasLoaded
                  ? ` · ${t("watchLater.calendar.updating")}`
                  : loadingCalendar
                    ? ` · ${t("watchLater.calendar.loading")}`
                    : ""}
              </span>
            </div>

            <div className={styles.calHeaderActions}>
              <button
                className={styles.todayBtn}
                onClick={() => {
                  const d = parseLocalDate(todayStr);

                  setCalYear(d.getFullYear());
                  setCalMonth(d.getMonth());

                  setSelectedDate(todayStr);
                }}
                >
                  {t("watchLater.calendar.today")}
                </button>

              <button
                className={styles.viewToggle}
                onClick={() => setView("list")}
              >
                {t("watchLater.calendar.backToList")}
              </button>
            </div>
          </div>

          <div className={styles.calendarCard}>
            <div className={styles.calendarTop}>
              <button
                className={styles.calNav}
                onClick={prevMonth}
                aria-label={t("watchLater.calendar.previousMonth", {
                  month:
                    getMonthName(calMonth === 0 ? 11 : calMonth - 1),
                  year: calMonth === 0 ? calYear - 1 : calYear,
                })}
              >
                ←
              </button>

              <div className={styles.monthTitle}>
                {calendarGrid.monthName} {calendarGrid.year}
              </div>

              <button
                className={styles.calNav}
                onClick={nextMonth}
                aria-label={t("watchLater.calendar.nextMonth", {
                  month: getMonthName(calMonth === 11 ? 0 : calMonth + 1),
                  year: calMonth === 11 ? calYear + 1 : calYear,
                })}
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

                // Two releases fit side by side; otherwise one poster plus a
                // "+N" badge that counts every title after the first.
                const maxPosters = releases.length === 2 ? 2 : 1;

                const heat = Math.min(3, releases.length);

                const today = cell.isToday;

                const past = cell.isPast;

                const selected = cell.isSelected;

                const cellLabel = `${t("watchLater.calendar.dayLabel", {
                  date: cell.accessibleLabel,
                  count: releases.length,
                })}${selected ? t("watchLater.calendar.selectedSuffix") : ""}`;
                return (
                  <button
                    key={cell.isoString}
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
              <span>
                {calendarError === "partial"
                  ? t("watchLater.calendar.errorsPartial")
                  : t("watchLater.calendar.errorsFailed")}
              </span>
              <button
                className={styles.retryBtn}
                onClick={loadCalendarItems}
                disabled={loadingCalendar}
              >
                {loadingCalendar
                  ? t("watchLater.calendar.retrying")
                  : t("common.retry")}
              </button>
            </div>
          )}

          <div className={styles.dayPanel}>
            {selectedDate ? (
              <>
                <div className={styles.dayPanelHeader}>
                  <h3>{formatDate(selectedDate)}</h3>

                  <span>{t("watchLater.calendar.releaseCount", { count: selectedItems.length })}</span>
                </div>

                {selectedItems.length === 0 ? (
                  <div className={styles.emptyDay}>
                    {t("watchLater.calendar.nothingOnDay")}
                  </div>
                ) : (
                  <div
                    className={`${styles.releaseGrid} ${styles[`count-${Math.min(selectedItems.length, 3)}`]}`}
                  >
                    {selectedItems.map((item) => (
                      <div
                        key={calendarKey(item)}
                        className={styles.releaseCard}
                      >
                          <img
                            src={imageUrl(item.poster ?? null, "w185")}
                            alt={t("watchLater.calendar.posterAlt", {
                              title: item.title,
                            })}
                            loading="lazy"
                            className={styles.releasePoster}
                          />

                        <div className={styles.releaseInfo}>
                          <h4>{item.title}</h4>

                          <span>
                            {item.type === "movie"
                              ? t("watchLater.movie")
                              : t("watchLater.calendar.seasonEpisode", {
                                  season: item.season,
                                  episode: item.episode,
                                })}
                            {item.airTimestamp != null && (
                              <>
                                {" · "}
                                {new Date(item.airTimestamp).toLocaleTimeString(
                                  undefined,
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    timeZone,
                                  },
                                )}
                              </>
                            )}
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
                            {t("watchLater.open")}
                          </Link>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.emptyDay}>
                {t("watchLater.calendar.selectDay")}
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("watchLater.eyebrow")}</p>
          <h1>{t("watchLater.title")}</h1>
        </div>
      </div>

      <section className="section">
        {loading ? (
          <CollectionSkeleton variant="grid" count={6} />
        ) : items.length === 0 && epItems.length === 0 ? (
          <div className="empty-state">
            <h3>{t("watchLater.emptyTitle")}</h3>
            <p>{t("watchLater.emptyDescription")}</p>
            <div className="empty-state-actions">
              <Link to="/movies" className="empty-state-action">
                {t("watchLater.browseMovies")}
              </Link>
              <Link to="/tv" className="empty-state-action">
                {t("watchLater.exploreTvShows")}
              </Link>
              <Link to="/" className="empty-state-action">
                {t("watchLater.browseTrending")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            {(items.length > 0 || epItems.length > 0) && (
              <>
                <div className={styles.wlControls}>
                  <input
                    type="text"
                    className={styles.wlSearch}
                    placeholder={t("watchLater.filterPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                      setEpPage(1);
                    }}
                    aria-label={t("watchLater.filterLabel")}
                  />
                  <TypeToggle
                    value={filterType}
                    options={[
                      { value: "all", label: t("watchLater.all") },
                      { value: "movies", label: t("watchLater.movies") },
                      { value: "tv", label: t("watchLater.tvShows") },
                    ]}
                    onChange={(v) => {
                      setFilterType(v);
                      setPage(1);
                      setEpPage(1);
                    }}
                  />
                  <FilterDropdown
                    className={styles.wlSortSelect}
                    icon={
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="14" y2="12" />
                        <line x1="4" y1="18" x2="8" y2="18" />
                      </svg>
                    }
                    value={`${sortBy}-${sortDir}`}
                    options={[
                      { value: "added-desc", label: t("watchLater.sortRecentlyAdded") },
                      { value: "added-asc", label: t("watchLater.sortOldestAdded") },
                      { value: "title-asc", label: t("watchLater.sortTitleAsc") },
                      { value: "title-desc", label: t("watchLater.sortTitleDesc") },
                      { value: "year-desc", label: t("watchLater.sortYearNewest") },
                      { value: "year-asc", label: t("watchLater.sortYearOldest") },
                    ]}
                    placeholder={t("watchLater.sortRecentlyAdded")}
                    onSelect={(v: string) => {
                      const [field, dir] = v.split("-");
                      setSortBy(field);
                      setSortDir(dir === "asc" ? "asc" : "desc");
                      setPage(1);
                      setEpPage(1);
                    }}
                  />
                </div>
                <div className={styles.wlMeta}>
                  <span className={styles.wlCount}>
                    {t("watchLater.count", {
                      visible: visibleTitleCount,
                      total: totalTitleCount,
                    })}
                  </span>
                  <div className={styles.wlMetaActions}>
                    {unreleasedKeys.size > 0 && (
                      <button
                        className={`${styles.wlMetaBtn} ${hideUnreleasedPosters ? styles.active : ""}`}
                        onClick={() => setHideUnreleasedPosters((v) => !v)}
                        title={
                          hideUnreleasedPosters
                            ? t("watchLater.showUnreleasedTitle")
                            : t("watchLater.hideUnreleasedTitle")
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
                          aria-hidden="true"
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
                          ? t("watchLater.showUnreleased")
                          : t("watchLater.hideUnreleased")}
                      </button>
                    )}
                    {(filterType !== "all" ||
                      sortBy !== "added" ||
                      sortDir !== "desc" ||
                      searchQuery.trim()) && (
                      <button
                        className={`${styles.wlMetaBtn} ${styles.accent}`}
                        onClick={() => {
                          setFilterType("all");
                          setSortBy("added");
                          setSortDir("desc");
                          setSearchQuery("");
                          setPage(1);
                          setEpPage(1);
                        }}
                      >
                        {t("watchLater.clearFilters")}
                      </button>
                    )}
                    <button
                      className={`${styles.wlMetaBtn} ${selectMode ? styles.active : ""}`}
                      onClick={toggleSelectMode}
                      aria-pressed={selectMode}
                      aria-label={
                        selectMode ? t("common.done") : t("common.select")
                      }
                      title={
                        selectMode
                          ? t("watchLater.exitSelection")
                          : t("watchLater.selectTitle")
                      }
                    >
                      <SelectIcon />
                      {selectMode ? t("common.done") : t("common.select")}
                    </button>
                  </div>
                </div>
                {selectMode && (
                  <BulkSelectBar
                    selectedCount={selectedCount}
                    confirming={confirmingBulkRemove}
                    onSelectPage={
                      visiblePageKeys.length > 0 ? selectPage : undefined
                    }
                    onClear={clearSelection}
                    onRequestRemove={requestRemove}
                    onKeep={keepSelection}
                    onConfirmRemove={removeSelected}
                  />
                )}
                {hasNoMatches && (
                  <div className="empty-state">
                    <h3>{t("watchLater.noMatchesTitle")}</h3>
                    <p>{t("watchLater.noMatchesDescription")}</p>
                  </div>
                )}
                {sortedItems.length > 0 && (
                  <>
                    <div className="media-grid">
                      {pageSlice.map((item) => (
                        <div
                          key={wlKey(item.type, item.id)}
                          className="media-card"
                        >
                          {selectMode && (
                            <input
                              type="checkbox"
                              className={bulkStyles.selectBox}
                              checked={selectedKeys.has(
                                wlKey(item.type, item.id),
                              )}
                              onChange={() => toggleKey(wlKey(item.type, item.id))}
                              aria-label={t("watchLater.selectItem", {
                                title: item.title,
                              })}
                            />
                          )}
                          <Link
                            to={`/${item.type === "tv" ? "tv" : "movie"}/${item.id}`}
                          >
                            <div className="media-card-poster">
                              <img
                                src={safeImageUrl(item.poster)}
                                alt={item.title}
                                loading="lazy"
                              />
                              <RatingBadge
                                type={item.type}
                                id={item.id}
                                title={item.title}
                                year={item.year || ""}
                                className="media-card-rating"
                              />
                              <span className={`media-card-type ${item.type}`}>
                                {item.type === "tv" ? t("watchLater.tv") : t("watchLater.movie")}
                              </span>
                            </div>
                            <div className="media-card-info">
                              <h3>{item.title}</h3>
                              {item.year && (
                                <span className="media-card-year">
                                  {item.year}
                                </span>
                              )}
                            </div>
                          </Link>
                          {!selectMode && (
                            <button
                              className="wl-remove"
                              onClick={() => handleRemove(item.type, item.id)}
                              title={t("common.remove")}
                            >
                              <CloseIcon />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {listPages > 1 && (
                      <Pagination
                        page={page}
                        totalPages={listPages}
                        onChange={setPage}
                      />
                    )}
                  </>
                )}
              </>
            )}
            {visibleEpItems.length > 0 && (
              <>
                <h3 className="sub-section-title">
                  {t("watchLater.episodes")}
                </h3>
                <div className="media-grid">
                  {epPageSlice.map((item) => {
                    const key = epKey(item.showId, item.season, item.episode);
                    return (
                      <div
                        key={`${item.showId}-S${item.season}E${item.episode}`}
                        className={`media-card ${styles.epWlCard}`}
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            className={bulkStyles.selectBox}
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleKey(key)}
                            aria-label={t("watchLater.selectEpisode", {
                              title: item.showTitle,
                              season: item.season,
                              episode: item.episode,
                            })}
                          />
                        )}
                        <Link
                          to={`/tv/${item.showId}?season=${item.season}&episode=${item.episode}`}
                        >
                          <div className="media-card-info">
                            <h3>{item.showTitle}</h3>
                            <span className="media-card-year">
                              S{item.season} E{item.episode}
                            </span>
                          </div>
                        </Link>
                        {!selectMode && (
                          <button
                            className="wl-remove"
                            onClick={() =>
                              handleRemoveEp(
                                item.showId,
                                item.season,
                                item.episode,
                              )
                            }
                            title={t("common.remove")}
                          >
                            <CloseIcon />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {epListPages > 1 && (
                  <Pagination
                    page={epPage}
                    totalPages={epListPages}
                    onChange={setEpPage}
                  />
                )}
              </>
            )}
          </>
        )}

        {(items.length > 0 || epItems.length > 0) && (
          <div className={styles.upcomingBanner}>
            {loadingCalendar && calendarItems.length === 0 ? (
                <span className={styles.upcomingToggleLabel}>
                  {t("watchLater.upcoming.loading")}
                </span>
            ) : upcomingCalendarCount > 0 ? (
              <button
                className={styles.upcomingToggle}
                onClick={toggleUpcoming}
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
                  {t("watchLater.upcoming.count", {
                    count: upcomingCalendarCount,
                  })}
                  {loadingCalendar ? " ···" : ""}
                </span>
                <span className={styles.upcomingToggleArrow}>
                  {showUpcoming ? "\u25B2" : "\u25BC"}
                </span>
              </button>
            ) : (
              <span className={styles.upcomingToggleLabel}>
                {t("watchLater.upcoming.none")}
              </span>
            )}
            <button
              className={styles.calIconBtn}
              onClick={() => setView("calendar")}
              aria-label={t("watchLater.upcoming.viewCalendar")}
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
                          ? t("watchLater.movie")
                          : `S${item.season} E${item.episode ?? "\u2014"}`}
                        {item.episodeTitle && (
                          <span> &middot; {item.episodeTitle}</span>
                        )}
                        {item.airTimestamp != null && (
                          <span>
                            {" "}
                            &middot;{" "}
                            {new Date(item.airTimestamp).toLocaleTimeString(undefined, {
                              hour: "numeric",
                              minute: "2-digit",
                              timeZone,
                            })}
                          </span>
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
                      {t("watchLater.open")}
                    </Link>
                  </div>
                ))}
              </div>
            ))}
            {totalPages > 1 && (
              <Pagination
                page={upcomingPage}
                totalPages={totalPages}
                onChange={setUpcomingPage}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}
