import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getLastSeen,
  markUnwatched,
  clearWatching,
  clearShowHistory,
  clearAllMoviesWatched,
  getSeriesWatchedFlag,
  unmarkSeriesWatched,
} from "../api/storage";
import { safeImageUrl } from "../api/tmdb";
import CollectionSkeleton from "../components/CollectionSkeleton";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import CloseIcon from "../components/CloseIcon";
import TypeToggle from "../components/TypeToggle";
import SelectIcon from "../components/SelectIcon";
import BulkSelectBar from "../components/BulkSelectBar";
import useBulkSelect from "../components/useBulkSelect";
import bulkStyles from "../components/BulkSelectBar.module.css";
import { useToast } from "../components/useToast";
import { useTranslation } from "react-i18next";
import { usePageTitle } from "../i18n/usePageTitle";
import type { LastSeenItem } from "../types";
import styles from "./LastSeen.module.css";

const ITEMS_PER_PAGE = 21;

interface SeriesGroup {
  id: number | string;
  title: string;
  poster: string | null;
  latestTs: number;
  episodes: LastSeenItem[];
}

type LastSeenEntry =
  | {
      kind: "series";
      key: string;
      group: SeriesGroup;
      title: string;
      ts: number;
      episodes: number;
    }
  | {
      kind: "movie";
      key: string;
      item: LastSeenItem;
      title: string;
      ts: number;
      episodes: number;
    };

function watchedEpisodeCount(group: SeriesGroup): number {
  return group.episodes.filter((e: LastSeenItem) => e.season && e.episode).length;
}

function seriesKey(id: number | string): string {
  return `tv-${String(id)}`;
}

function movieKey(storageKey: string): string {
  return `movie-${storageKey}`;
}

export default function LastSeen() {
  const { t } = useTranslation();
  const [items, setItems] = useState<LastSeenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toast = useToast();

  useEffect(() => {
    setItems(getLastSeen());
    setLoading(false);
  }, []);
  usePageTitle(t("lastSeen.title"));
  const typeTabs = [
    { value: "all", label: t("lastSeen.all") },
    { value: "movies", label: t("lastSeen.movies") },
    { value: "tv", label: t("lastSeen.tvShows") },
  ];

  const { series, movies, combined, total } = useMemo(() => {
    const seriesMap = new Map<string, SeriesGroup>();
    const movieItems: LastSeenItem[] = [];

    items.forEach((item: LastSeenItem) => {
      if (item.type === "tv") {
        const key = String(item.id);
        const rawTitle =
          (item.meta?.title as string) || item.title || `Show ${item.id}`;
        const title = rawTitle.replace(/\sS\d+E\d+$/, "") || `Show ${item.id}`;
        const existing =
          seriesMap.get(key) ||
          ({
            id: item.id,
            title,
            poster: (item.meta?.poster as string) || null,
            latestTs: item.ts || 0,
            episodes: [] as LastSeenItem[],
          } as SeriesGroup);
        existing.title = existing.title || title;
        existing.poster =
          existing.poster || (item.meta?.poster as string) || null;
        existing.latestTs = Math.max(existing.latestTs, item.ts || 0);
        existing.episodes.push(item);
        seriesMap.set(key, existing);
      } else {
        movieItems.push(item);
      }
    });

    // Every field has an ascending base comparator; the direction toggle
    // flips it so each field can be read newest-first or reversed.
    const dir = sortDir === "asc" ? 1 : -1;

    const groupedSeries: SeriesGroup[] = Array.from(seriesMap.values())
      .sort((a, b) => dir * ((a.latestTs || 0) - (b.latestTs || 0)))
      .map((group: SeriesGroup) => ({
        ...group,
        episodes: group.episodes.sort((a, b) => (b.ts || 0) - (a.ts || 0)),
      }));

    let sortedMovies = [...movieItems].sort(
      (a, b) => dir * ((a.ts || 0) - (b.ts || 0)),
    );

    let filteredSeries = groupedSeries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredSeries = filteredSeries.filter((s: SeriesGroup) =>
        s.title.toLowerCase().includes(q),
      );
      sortedMovies = sortedMovies.filter((m: LastSeenItem) =>
        (m.title || "").toLowerCase().includes(q),
      );
    }

    const seriesEntries: LastSeenEntry[] = filteredSeries.map(
      (group): LastSeenEntry => ({
        kind: "series",
        key: seriesKey(group.id),
        group,
        title: group.title,
        ts: group.latestTs,
        episodes: group.episodes.length,
      }),
    );
    const movieEntries: LastSeenEntry[] = sortedMovies.map(
      (item): LastSeenEntry => ({
        kind: "movie",
        key: movieKey(item.storageKey),
        item,
        title: item.title || `Movie ${item.id}`,
        ts: item.ts || 0,
        episodes: 0,
      }),
    );

    let combined = [...seriesEntries, ...movieEntries].sort((a, b) => {
      if (sortBy === "title") return dir * a.title.localeCompare(b.title);
      if (sortBy === "episodes") return dir * (a.episodes - b.episodes);
      return dir * ((a.ts || 0) - (b.ts || 0));
    });

    if (filterType === "movies") {
      combined = combined.filter((e) => e.kind === "movie");
    } else if (filterType === "tv") {
      combined = combined.filter((e) => e.kind === "series");
    }

    return {
      series: groupedSeries,
      movies: sortedMovies,
      combined,
      total: seriesMap.size + movieItems.length,
    };
  }, [items, sortBy, sortDir, searchQuery, filterType]);

  // Reset to the first page whenever the visible ordering/contents change,
  // otherwise a filter could leave the user stranded past the last page.
  useEffect(() => {
    setPage(0);
  }, [filterType, searchQuery, sortBy, sortDir]);

  // Derived from the live grouped list so removals inside the detail view
  // stay in sync instead of showing a stale snapshot.
  const selectedSeries = useMemo(
    () =>
      selectedSeriesId
        ? (series.find((s: SeriesGroup) => String(s.id) === selectedSeriesId) ??
          null)
        : null,
    [series, selectedSeriesId],
  );

  const totalPages = Math.max(1, Math.ceil(combined.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const visibleEntries = combined.slice(
    safePage * ITEMS_PER_PAGE,
    (safePage + 1) * ITEMS_PER_PAGE,
  );

  // When no search filter is active, "Remove all" must operate on the full
  // unfiltered list - not just the currently paginated slice, which would
  // silently leave most of the history behind.
  const filterActive = !!searchQuery.trim();

  function handleRemove(item: LastSeenItem) {
    let removed = false;
    if (item.type === "movie") {
      markUnwatched("movie", item.id);
      clearWatching("movie", item.id);
      removed = true;
    } else if (item.season && item.episode) {
      markUnwatched("tv", item.id, item.season, item.episode);
      clearWatching("tv", item.id, item.season, item.episode);
      if (getSeriesWatchedFlag(item.id).source === "auto") unmarkSeriesWatched(item.id);
      removed = true;
    } else if (item.type === "tv") {
      markUnwatched("tv", item.id);
      removed = true;
    }
    setItems(getLastSeen());
    if (removed) toast?.(t("lastSeen.toastRemoved"));
  }

  function handleRemoveShow(showId: string | number) {
    clearShowHistory(showId);
    setItems(getLastSeen());
    if (selectedSeriesId && String(selectedSeriesId) === String(showId)) {
      setSelectedSeriesId(null);
    }
    toast?.(t("lastSeen.toastSeriesRemoved"));
  }

  // Removes every movie in the current view - all of them when unfiltered,
  // or just the search matches when a filter is active. `movies` is already
  // narrowed by the search query, and pagination never limits the scope, so
  // page 1 of 3 does not leave pages 2-3 behind.
  function handleRemoveAllMovies() {
    if (!filterActive) {
      clearAllMoviesWatched();
    } else {
      for (const item of movies) {
        markUnwatched("movie", item.id);
        clearWatching("movie", item.id);
      }
    }
    setItems(getLastSeen());
    toast?.(
      filterActive
        ? t("lastSeen.toastMoviesRemoved", { count: movies.length })
        : t("lastSeen.toastAllMoviesRemoved"),
    );
  }

  // Keys are prefixed so a single selected set can hold series and movies at
  // once, and the removal handler can tell them apart again.
  function handleRemoveSelected(keys: string[]) {
    let removed = 0;
    for (const key of keys) {
      if (key.startsWith("tv-")) {
        const showId = key.slice(3);
        clearShowHistory(showId);
        removed += 1;
        if (selectedSeriesId && String(selectedSeriesId) === showId) {
          setSelectedSeriesId(null);
        }
      } else if (key.startsWith("movie-")) {
        const storageKey = key.slice(6);
        const item = items.find(
          (i: LastSeenItem) =>
            i.type === "movie" && i.storageKey === storageKey,
        );
        if (item) {
          markUnwatched("movie", item.id);
          clearWatching("movie", item.id);
          removed += 1;
        }
      }
    }
    setItems(getLastSeen());
    if (removed > 0) toast?.(t("lastSeen.toastSelectedRemoved", { count: removed }));
  }

  const visibleKeys = useMemo(
    () => visibleEntries.map((entry) => entry.key),
    [visibleEntries],
  );

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
    visibleKeys,
    onRemove: handleRemoveSelected,
  });

  function showSeriesEpisodes(show: SeriesGroup) {
    setSelectedSeriesId(String(show.id));
    setPage(0);
  }

  function backToSeries() {
    setSelectedSeriesId(null);
  }

  const showMoviesSection = filterType === "all" || filterType === "movies";
  const hasActiveFilter =
    filterType !== "all" ||
    sortBy !== "recent" ||
    sortDir !== "desc" ||
    searchQuery.trim();
  const hasNoMatches = combined.length === 0 && items.length > 0;

  return (
    <div className="page">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t("lastSeen.eyebrow")}</p>
          <h1>{t("lastSeen.title")}</h1>
        </div>
      </div>

      <section className="section">
        {loading ? (
          <CollectionSkeleton variant="history" count={3} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>{t("lastSeen.emptyTitle")}</h3>
            <p>
              {t("lastSeen.emptyDescription")}
            </p>
            <div className="empty-state-actions">
              <Link to="/movies" className="empty-state-action">
                {t("lastSeen.browseMovies")}
              </Link>
              <Link to="/tv" className="empty-state-action">
                {t("lastSeen.exploreTvShows")}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.lastSeenControls}>
              <input
                type="text"
                className={styles.lastSeenSearch}
                placeholder={t("lastSeen.filterPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label={t("lastSeen.filterLabel")}
              />
              <TypeToggle value={filterType} options={typeTabs} onChange={setFilterType} />
              <FilterDropdown
                className={styles.lastSeenSortSelect}
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
                  { value: "recent-desc", label: t("lastSeen.sortRecentlyAdded") },
                  { value: "recent-asc", label: t("lastSeen.sortOldestAdded") },
                  { value: "title-asc", label: t("lastSeen.sortTitleAsc") },
                  { value: "title-desc", label: t("lastSeen.sortTitleDesc") },
                  { value: "episodes-desc", label: t("lastSeen.sortMostEpisodes") },
                  { value: "episodes-asc", label: t("lastSeen.sortFewestEpisodes") },
                ]}
                placeholder={t("lastSeen.sortRecentlyAdded")}
                onSelect={(v: string) => {
                  const [field, dir] = v.split("-");
                  setSortBy(field);
                  setSortDir(dir === "asc" ? "asc" : "desc");
                }}
              />
            </div>
            <div className={styles.lastSeenMeta}>
              <span className={styles.lastSeenCount}>
                {t("lastSeen.count", { visible: combined.length, total })}
              </span>
              <div className={styles.lastSeenMetaActions}>
                {hasActiveFilter && (
                  <button
                    className={`${styles.lastSeenMetaBtn} ${styles.accent}`}
                    onClick={() => {
                      setFilterType("all");
                      setSortBy("recent");
                      setSortDir("desc");
                      setSearchQuery("");
                      setSelectedSeriesId(null);
                      setPage(0);
                    }}
                  >
                    {t("lastSeen.clearFilters")}
                  </button>
                )}
                <button
                  className={`${styles.lastSeenMetaBtn} ${selectMode ? styles.active : ""}`}
                  onClick={toggleSelectMode}
                  aria-pressed={selectMode}
                  aria-label={selectMode ? t("common.done") : t("common.select")}
                  title={selectMode ? t("lastSeen.exitSelection") : t("lastSeen.selectTitle")}
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
                onSelectPage={visibleKeys.length > 0 ? selectPage : undefined}
                onClear={clearSelection}
                onRequestRemove={requestRemove}
                onKeep={keepSelection}
                onConfirmRemove={removeSelected}
              />
            )}

            {!selectedSeries && hasNoMatches && (
              <div className="empty-state">
                <h3>{t("lastSeen.noMatchesTitle")}</h3>
                <p>
                  {t("lastSeen.noMatchesDescription")}
                </p>
              </div>
            )}

            {!selectedSeries && combined.length > 0 && (
              <>
                <div className="media-grid">
                  {visibleEntries.map((entry) => {
                    if (entry.kind === "series") {
                      const show = entry.group;
                      const key = entry.key;
                      const body = (
                        <>
                          <div className="media-card-poster">
                            <img
                              src={safeImageUrl(show.poster)}
                              alt={show.title}
                              loading="lazy"
                            />
                          </div>
                          <div className="media-card-info">
                            <h3>{show.title}</h3>
                            <span className="media-card-year">
                              {show.episodes.length === 1 &&
                              !show.episodes[0].season
                                ? t("lastSeen.watched")
                                : t("lastSeen.episodeCount", { count: show.episodes.length })}
                            </span>
                          </div>
                        </>
                      );
                      return (
                        <div
                          key={entry.key}
                          className={`media-card ${styles.lastSeenCard}`}
                        >
                          {selectMode && (
                            <input
                              type="checkbox"
                              className={bulkStyles.selectBox}
                              checked={selectedKeys.has(key)}
                              onChange={() => toggleKey(key)}
                              aria-label={t("lastSeen.selectItem", { title: show.title })}
                            />
                          )}
                          <Link
                            to={`/tv/${show.id}`}
                            className={styles.lastSeenCardLink}
                          >
                            {body}
                          </Link>
                          {!selectMode && (
                            <div className="media-card-footer">
                              <button
                                className={`${styles.lastSeenViewBtn} media-card-footer-view`}
                                onClick={() => showSeriesEpisodes(show)}
                                aria-label={t("lastSeen.viewLabel", { title: show.title })}
                              >
                                <span className="media-card-btn-icon phone-only" aria-hidden="true">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
                                </span>
                                <span>{t("lastSeen.view")}</span>
                              </button>
                              <button
                                className="wl-remove"
                                onClick={() => handleRemoveShow(show.id)}
                                title={t("lastSeen.removeAllEpisodes")}
                                aria-label={t("lastSeen.removeShowLabel", { title: show.title })}
                              >
                                <CloseIcon />
                                <span className="media-card-btn-label">{t("common.remove")}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const item = entry.item;
                    const key = entry.key;
                    return (
                      <div key={entry.key} className="media-card">
                        {selectMode && (
                          <input
                            type="checkbox"
                            className={bulkStyles.selectBox}
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleKey(key)}
                            aria-label={t("lastSeen.selectItem", { title: item.title || t("lastSeen.movieFallback", { id: item.id }) })}
                          />
                        )}
                        <Link to={`/movie/${item.id}`}>
                          <div className="media-card-poster">
                            <img
                              src={safeImageUrl(item.meta?.poster)}
                              alt={item.title || ""}
                              loading="lazy"
                            />
                          </div>
                          <div className="media-card-info">
                            <h3>{item.title || `Movie ${item.id}`}</h3>
                          </div>
                        </Link>
                        {!selectMode && (
                          <div className="media-card-footer">
                            <button
                              className="wl-remove"
                              onClick={() => handleRemove(item)}
                              title={t("common.remove")}
                              aria-label={t("lastSeen.removeLabel", {
                                title: item.title || t("lastSeen.movieFallback", { id: item.id }),
                              })}
                            >
                              <CloseIcon />
                              <span className="media-card-btn-label">{t("common.remove")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {showMoviesSection && movies.length > 0 && (
                  <button
                    className="watch-toggle danger"
                    onClick={handleRemoveAllMovies}
                  >
                    {t("lastSeen.removeAll")}
                  </button>
                )}
                {totalPages > 1 && (
                  <Pagination
                    page={safePage + 1}
                    totalPages={totalPages}
                    onChange={(p) => setPage(p - 1)}
                    style={{ marginTop: "1rem" }}
                  />
                )}
              </>
            )}

            {selectedSeries && (
              <>
                <div className={styles.lastSeenDetailHeader}>
                  <button
                    onClick={backToSeries}
                    className={styles.lastSeenBackBtn}
                  >
                    &larr; {t("lastSeen.backToSeries")}
                  </button>
                  <h3 className={styles.lastSeenDetailTitle}>
                    {selectedSeries.title}
                  </h3>
                </div>
                <div className="last-seen-series">
                  <div className="last-seen-series-head">
                    <div className="last-seen-series-title-wrap">
                      {selectedSeries.poster && (
                        <img
                          src={safeImageUrl(selectedSeries.poster)}
                          alt={selectedSeries.title}
                          className={styles.lastSeenSeriesPoster}
                        />
                      )}
                      <div>
                        <h3 className={styles.lastSeenSeriesTitle}>
                          {selectedSeries.title}
                        </h3>
                        <p className={styles.lastSeenSeriesSubtitle}>
                          {watchedEpisodeCount(selectedSeries) === 0
                            ? t("lastSeen.watched")
                            : t("lastSeen.watchedEpisodeCount", { count: watchedEpisodeCount(selectedSeries) })}
                        </p>
                      </div>
                    </div>
                    <div className={styles.lastSeenSeriesActions}>
                      <Link
                        to={`/tv/${selectedSeries.id}`}
                        className={styles.lastSeenSeriesLink}
                      >
                        {t("lastSeen.openShow")}
                      </Link>
                      <button
                        className="watch-toggle danger"
                        onClick={() => handleRemoveShow(selectedSeries.id)}
                      >
                        {t("lastSeen.removeAll")}
                      </button>
                    </div>
                  </div>

                  <div className="last-seen-episode-list">
                    {selectedSeries.episodes.map((item) => (
                      <div
                        key={item.storageKey}
                        className={styles.lastSeenEpisodeRow}
                      >
                        <Link
                          to={item.season && item.episode ? `/tv/${selectedSeries.id}?season=${item.season}&episode=${item.episode}` : `/tv/${selectedSeries.id}`}
                          className={styles.lastSeenEpisode}
                        >
                          <span className={styles.lsLabel}>
                            {item.season && item.episode
                              ? `S${item.season}E${item.episode}`
                              : item.season == null && item.episode == null
                                ? t("lastSeen.series")
                                : t("lastSeen.episode")}
                          </span>
                          <span className={styles.lsMeta}>{t("lastSeen.watched")}</span>
                        </Link>
                        <button
                          className={styles.lsRemove}
                          onClick={() => handleRemove(item)}
                          title={t("common.remove")}
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
