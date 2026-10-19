import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getLastSeen,
  markUnwatched,
  clearProgress,
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
import SortDirectionIcon from "../components/SortDirectionIcon";
import BulkSelectBar from "../components/BulkSelectBar";
import useBulkSelect from "../components/useBulkSelect";
import bulkStyles from "../components/BulkSelectBar.module.css";
import { useToast } from "../components/useToast";
import type { LastSeenItem } from "../types";
import styles from "./LastSeen.module.css";

const ITEMS_PER_PAGE = 21;

const TYPE_TABS = [
  { value: "all", label: "All" },
  { value: "movies", label: "Movies" },
  { value: "tv", label: "TV Shows" },
];

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
      year: string;
    }
  | {
      kind: "movie";
      key: string;
      item: LastSeenItem;
      title: string;
      ts: number;
      episodes: number;
      year: string;
    };

function metaYear(meta: Record<string, unknown> | null | undefined): string {
  const year = meta?.year;
  return year == null ? "" : String(year);
}

function formatEpisodeLabel(item: LastSeenItem): string {
  if (item.season && item.episode) return `S${item.season}E${item.episode}`;
  if (item.season == null && item.episode == null) return "Series";
  return "Episode";
}

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
    document.title = "Last Seen - StreamFlow";
    setItems(getLastSeen());
    setLoading(false);
  }, []);

  const { series, movies, combined } = useMemo(() => {
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
        year: metaYear(group.episodes[0]?.meta),
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
        year: metaYear(item.meta),
      }),
    );

    let combined = [...seriesEntries, ...movieEntries].sort((a, b) => {
      if (sortBy === "title") return dir * a.title.localeCompare(b.title);
      if (sortBy === "episodes") return dir * (a.episodes - b.episodes);
      if (sortBy === "year") return dir * a.year.localeCompare(b.year);
      return dir * ((a.ts || 0) - (b.ts || 0));
    });

    if (filterType === "movies") {
      combined = combined.filter((e) => e.kind === "movie");
    } else if (filterType === "tv") {
      combined = combined.filter((e) => e.kind === "series");
    }

    return { series: groupedSeries, movies: sortedMovies, combined };
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
      clearProgress("movie", item.id);
      removed = true;
    } else if (item.season && item.episode) {
      markUnwatched("tv", item.id, item.season, item.episode);
      clearProgress("tv", item.id, item.season, item.episode);
      if (getSeriesWatchedFlag(item.id).source === "auto") unmarkSeriesWatched(item.id);
      removed = true;
    } else if (item.type === "tv") {
      markUnwatched("tv", item.id);
      removed = true;
    }
    setItems(getLastSeen());
    if (removed) toast?.("Removed from history");
  }

  function handleRemoveShow(showId: string | number) {
    clearShowHistory(showId);
    setItems(getLastSeen());
    if (selectedSeriesId && String(selectedSeriesId) === String(showId)) {
      setSelectedSeriesId(null);
    }
    toast?.("Series removed from history");
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
        clearProgress("movie", item.id);
      }
    }
    setItems(getLastSeen());
    toast?.(
      filterActive
        ? `${movies.length} movie${movies.length === 1 ? "" : "s"} removed from history`
        : "All watched movies removed from history",
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
          clearProgress("movie", item.id);
          removed += 1;
        }
      }
    }
    setItems(getLastSeen());
    if (removed > 0) toast?.(`${removed} removed from history`);
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
      <section className="section">
        <h2 className="section-title">Last Seen</h2>
        {loading ? (
          <CollectionSkeleton variant="history" count={3} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>No history yet</h3>
            <p>
              Everything you watch - and where you left off - will appear
              here as you start playing something.
            </p>
            <div className="empty-state-actions">
              <Link to="/movies" className="empty-state-action">
                Browse Movies
              </Link>
              <Link to="/tv" className="empty-state-action">
                Explore TV Shows
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.lastSeenControls}>
              <input
                type="text"
                className={styles.lastSeenSearch}
                placeholder="Filter by title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter by title"
              />
              <TypeToggle value={filterType} options={TYPE_TABS} onChange={setFilterType} />
              <FilterDropdown
                value={sortBy}
                options={[
                  { value: "recent", label: "Date added" },
                  { value: "title", label: "Title" },
                  { value: "episodes", label: "Most episodes" },
                  { value: "year", label: "Year" },
                ]}
                placeholder="Date added"
                onSelect={(v: string) => {
                  setSortBy(v);
                  setSortDir(v === "title" ? "asc" : "desc");
                }}
              />
              <button
                className={styles.lastSeenSortDirBtn}
                onClick={() =>
                  setSortDir((d) => (d === "desc" ? "asc" : "desc"))
                }
                title={`Sort ${sortDir === "desc" ? "descending" : "ascending"} — activate to reverse`}
                aria-label={`Sort direction: ${sortDir === "desc" ? "descending" : "ascending"} — activate to reverse`}
              >
                <SortDirectionIcon direction={sortDir} />
              </button>
              {hasActiveFilter && (
                <button
                  className={styles.lastSeenClearBtn}
                  onClick={() => {
                    setFilterType("all");
                    setSortBy("recent");
                    setSortDir("desc");
                    setSearchQuery("");
                    setSelectedSeriesId(null);
                    setPage(0);
                  }}
                >
                  Clear filters
                </button>
              )}
              <button
                className={`${styles.lastSeenClearBtn} ${styles.lastSeenSelectBtn} ${selectMode ? styles.active : ""}`}
                onClick={toggleSelectMode}
                aria-pressed={selectMode}
                aria-label={selectMode ? "Done" : "Select"}
                title={selectMode ? "Exit selection" : "Select multiple titles"}
              >
                <SelectIcon />
              </button>
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
                <h3>No matches</h3>
                <p>
                  No titles match your current filters. Try a different search
                  or clear the filters.
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
                                ? "Watched"
                                : `${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"}`}
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
                              aria-label={`Select ${show.title}`}
                            />
                          )}
                          <Link
                            to={`/tv/${show.id}`}
                            className={styles.lastSeenCardLink}
                          >
                            {body}
                          </Link>
                          {!selectMode && (
                            <button
                              className={styles.lastSeenViewBtn}
                              onClick={() => showSeriesEpisodes(show)}
                            >
                              View
                            </button>
                          )}
                          {!selectMode && (
                            <button
                              className="wl-remove"
                              onClick={() => handleRemoveShow(show.id)}
                              title="Remove all episodes"
                            >
                              <CloseIcon />
                            </button>
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
                            aria-label={`Select ${item.title || `Movie ${item.id}`}`}
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
                            {entry.year && (
                              <span className="media-card-year">
                                {entry.year}
                              </span>
                            )}
                          </div>
                        </Link>
                        {!selectMode && (
                          <button
                            className="wl-remove"
                            onClick={() => handleRemove(item)}
                            title="Remove"
                          >
                            <CloseIcon />
                          </button>
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
                    Remove all
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
                    &larr; Back to series
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
                            ? "Watched"
                            : `${watchedEpisodeCount(selectedSeries)} watched episode${watchedEpisodeCount(selectedSeries) === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </div>
                    <div className={styles.lastSeenSeriesActions}>
                      <Link
                        to={`/tv/${selectedSeries.id}`}
                        className={styles.lastSeenSeriesLink}
                      >
                        Open show
                      </Link>
                      <button
                        className="watch-toggle danger"
                        onClick={() => handleRemoveShow(selectedSeries.id)}
                      >
                        Remove all
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
                            {formatEpisodeLabel(item)}
                          </span>
                          <span className={styles.lsMeta}>
                            {item.source === "progress" ? "Resume" : "Watched"}
                          </span>
                        </Link>
                        <button
                          className={styles.lsRemove}
                          onClick={() => handleRemove(item)}
                          title="Remove"
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
