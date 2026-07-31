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
import CollectionSkeleton from "../components/CollectionSkeleton";
import FilterDropdown from "../components/FilterDropdown";
import { useToast } from "../components/useToast";
import { useAbortController } from "../hooks/useAbortController";
import type {
  WatchLaterItem,
  EpisodeWatchLaterItem,
  CalendarItem,
  TMDBSeason,
  TMDBEpisode,
  MediaType,
} from "../types";
import styles from "./WatchLater.module.css";

function isFuture(dateStr: string) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d >= new Date();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shortTitle(title: string, max = 12) {
  return title.length > max ? title.slice(0, max) + "\u2026" : title;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) grid.push(d);
  return grid;
}

export default function WatchLater() {
  const [items, setItems] = useState<WatchLaterItem[]>([]);
  const [epItems, setEpItems] = useState<EpisodeWatchLaterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [sortBy, setSortBy] = useState("recent");
  const [filterType, setFilterType] = useState("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [page, setPage] = useState(1);
  const calendarInitedRef = useRef(false);
  const ITEMS_PER_PAGE = 12;
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
        const now = new Date();
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
          const seasonStart = season.air_date
            ? new Date(season.air_date)
            : null;
          if (seasonStart && seasonStart > now) {
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
              if (ep.air_date && isFuture(ep.air_date)) {
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
                    poster: (detail as Record<string, unknown>)
                      .poster_path as string | undefined,
                    season: season.season_number,
                    episode: ep.episode_number,
                    episodeTitle: ep.name,
                  });
                }
              }
            }
          } catch {}
        }

        if (nextEp?.air_date && isFuture(nextEp.air_date)) {
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
              poster: (detail as Record<string, unknown>)
                .poster_path as string | undefined,
              season: n.season_number,
              episode: n.episode_number,
              episodeTitle: n.name,
            });
          }
        }
      } catch {}
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
        if (detail?.release_date && isFuture(detail.release_date)) {
          return {
            date: detail.release_date,
            title: detail.title || "",
            type: "movie",
            id: item.id,
            poster: detail.poster_path || undefined,
          };
        }
      } catch {}
      return null;
    },
    [],
  );

  const loadCalendarItems = useCallback(async () => {
    setLoadingCalendar(true);
    const signal = getSignal();
    const wlItems = getWatchLater();
    const epwlItems = getEpisodeWatchLater();
    const results: CalendarItem[] = [];
    const CONCURRENCY = 3;

    const wlPosterMap = new Map<string, string | undefined>();
    for (const wl of wlItems) {
      if (wl.poster) wlPosterMap.set(String(wl.id), wl.poster);
    }

    for (let i = 0; i < wlItems.length; i += CONCURRENCY) {
      const batch = wlItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (item: WatchLaterItem) => {
          if (item.type === "movie") return fetchMovieRelease(item, signal);
          return fetchTVFutureEpisodes(item.id, signal);
        }),
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled") {
          const val = r.value;
          if (val && Array.isArray(val)) results.push(...val);
          else if (val) results.push(val);
        }
      }
    }

    for (let i = 0; i < epwlItems.length; i += CONCURRENCY) {
      const batch = epwlItems.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map(async (epwl: EpisodeWatchLaterItem) => {
          try {
            const seasonDetail = (await getSeasonDetails(
              epwl.showId,
              epwl.season,
              signal,
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
            if (ep?.air_date && isFuture(ep.air_date)) {
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
          } catch {}
          return null;
        }),
      );
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
      }
    }

    const seen = new Set<string>();
    const deduped: CalendarItem[] = [];
    for (const item of results) {
      const key = `${item.type}-${item.id}-${item.date}-S${item.season ?? 0}E${item.episode ?? 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    deduped.sort((a, b) => a.date.localeCompare(b.date));
    setCalendarItems(deduped);
    setLoadingCalendar(false);
  }, [fetchTVFutureEpisodes, fetchMovieRelease, getSignal]);

  useEffect(() => {
    document.title = "Watch Later - StreamFlow";
    setItems(getWatchLater());
    setEpItems(getEpisodeWatchLater());
    setLoading(false);
    loadCalendarItems();
  }, [loadCalendarItems]);

  useEffect(() => {
    if (view === "calendar") {
      if (
        !calendarInitedRef.current &&
        calendarItems.length > 0 &&
        calendarItems[0]?.date
      ) {
        const firstDate = calendarItems[0].date;
        const d = new Date(firstDate);
        setCalYear(d.getFullYear());
        setCalMonth(d.getMonth());
        setSelectedDate(firstDate);
        calendarInitedRef.current = true;
      }
    } else {
      calendarInitedRef.current = false;
    }
  }, [view, calendarItems]);

  function handleRemove(type: string, id: string | number) {
    removeWatchLater(type as MediaType, id);
    setItems(getWatchLater());
    setCalendarItems((prev) =>
      prev.filter((c) => !(String(c.id) === String(id) && c.type === type)),
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

  const sortedItems = useMemo(() => {
    let list = [...items];
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
  }, [items, sortBy, filterType]);

  const daysGrid = useMemo(
    () => getMonthDays(calYear, calMonth),
    [calYear, calMonth],
  );
  const todayStr = new Date().toISOString().slice(0, 10);

  function dateStr(y: number, m: number, d: number | null) {
    if (d === null) return "";
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function prevMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else setCalMonth((m) => m - 1);
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else setCalMonth((m) => m + 1);
  }

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  const groupedUpcomingList = useMemo(() => {
    const sorted = Object.keys(itemsByDate).sort();
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

  useEffect(() => {
    if (upcomingPage >= totalPages)
      setUpcomingPage(Math.max(0, totalPages - 1));
  }, [totalPages, upcomingPage]);

  if (view === "calendar") {
    const maxPosters = 3;

    if (loadingCalendar) {
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
                {Array.from({ length: 35 }).map((_, i) => (
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
              </span>
            </div>

            <div className={styles.calHeaderActions}>
              <button
                className={styles.todayBtn}
                onClick={() => {
                  const now = new Date();

                  setCalYear(now.getFullYear());
                  setCalMonth(now.getMonth());

                  setSelectedDate(now.toISOString().slice(0, 10));
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
              <button className={styles.calNav} onClick={prevMonth} aria-label="Previous month">
                ←
              </button>

              <div className={styles.monthTitle}>
                {MONTHS[calMonth]} {calYear}
              </div>

              <button className={styles.calNav} onClick={nextMonth} aria-label="Next month">
                →
              </button>
            </div>

            <div className={styles.calGrid}>
              {WEEKDAYS.map((day, dayIndex) => (
                <div
                  key={day}
                  className={styles.calWeekday}
                  style={{ animationDelay: `${dayIndex * 30}ms` }}
                >
                  {day}
                </div>
              ))}

              {daysGrid.map((day, index) => {
                const ds = dateStr(calYear, calMonth, day);

                const releases = day ? itemsByDate[ds] || [] : [];

                const heat = Math.min(3, releases.length);

                const today = ds === todayStr;

                const past = day !== null && ds < todayStr;

                const selected = selectedDate === ds;

                return (
                  <button
                    key={index}
                    disabled={day === null}
                    onClick={() => {
                      if (day !== null) setSelectedDate(ds);
                    }}
                    style={{
                      animationDelay: `${Math.min((WEEKDAYS.length + index) * 25, 650)}ms`,
                    }}
                    className={`
                    ${styles.calCell}
                    ${today ? styles.today : ""}
                    ${past ? styles.past : ""}
                    ${selected ? styles.selected : ""}
                    ${day === null ? styles.empty : ""}
                    ${heat > 0 ? styles[`heat-${heat}`] : ""}
                  `}
                  >
                    {day !== null && (
                      <>
                        <div className={styles.dayNumber}>{day}</div>

                        {releases.length > 0 && (
                          <div
                            className={`${styles.posterRow} ${styles[`pcount-${Math.min(releases.length, 3)}`]}`}
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
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

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
                          alt=""
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
            <Link to="/movies" className="empty-state-action">
              Start browsing
            </Link>
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
                </div>
                <div className="media-grid">
                  {sortedItems
                    .slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
                    .map((item) => (
                      <div
                        key={`${(item as WatchLaterItem).type}-${(item as WatchLaterItem).id}`}
                        className="media-card"
                      >
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
                    ))}
                </div>
                {Math.ceil(sortedItems.length / ITEMS_PER_PAGE) > 1 && (
                  <div className="pagination">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Prev
                    </button>
                    <span>
                      Page {page} of{" "}
                      {Math.ceil(sortedItems.length / ITEMS_PER_PAGE)}
                    </span>
                    <button
                      disabled={
                        page >= Math.ceil(sortedItems.length / ITEMS_PER_PAGE)
                      }
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
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

        {!loadingCalendar && calendarItems.length > 0 && (
          <div className={styles.upcomingBanner}>
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
                {calendarItems.length} upcoming
              </span>
              <span className={styles.upcomingToggleArrow}>
                {showUpcoming ? "\u25B2" : "\u25BC"}
              </span>
            </button>
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

        {showUpcoming && !loadingCalendar && calendarItems.length > 0 && (
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
