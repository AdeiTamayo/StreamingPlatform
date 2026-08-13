import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  getLastSeen,
  markUnwatched,
  clearProgress,
  clearShowHistory,
  getSeriesWatchedFlag,
  unmarkSeriesWatched,
} from "../api/storage";
import { imageUrl } from "../api/tmdb";
import CollectionSkeleton from "../components/CollectionSkeleton";
import FilterDropdown from "../components/FilterDropdown";
import Pagination from "../components/Pagination";
import { useToast } from "../components/useToast";
import type { LastSeenItem } from "../types";
import styles from "./LastSeen.module.css";

const MOVIES_PER_PAGE = 20;
const SERIES_PER_PAGE = 20;

interface SeriesGroup {
  id: number | string;
  title: string;
  poster: string | null;
  latestTs: number;
  episodes: LastSeenItem[];
}

function formatEpisodeLabel(item: LastSeenItem): string {
  if (item.season && item.episode) return `S${item.season}E${item.episode}`;
  if (item.season == null && item.episode == null) return "Series";
  return "Episode";
}

function watchedEpisodeCount(group: SeriesGroup): number {
  return group.episodes.filter((e: LastSeenItem) => e.season && e.episode).length;
}

export default function LastSeen() {
  const [items, setItems] = useState<LastSeenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("recent");
  const [filterType, setFilterType] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [moviePage, setMoviePage] = useState(0);
  const [seriesPage, setSeriesPage] = useState(0);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    document.title = "Last Seen - StreamFlow";
    setItems(getLastSeen());
    setLoading(false);
  }, []);

  const { series, movies } = useMemo(() => {
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

    let groupedSeries: SeriesGroup[] = Array.from(seriesMap.values())
      .sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0))
      .map((group: SeriesGroup) => ({
        ...group,
        episodes: group.episodes.sort((a, b) => (b.ts || 0) - (a.ts || 0)),
      }));

    let sortedMovies = [...movieItems].sort(
      (a, b) => (b.ts || 0) - (a.ts || 0),
    );

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      groupedSeries = groupedSeries.filter((s: SeriesGroup) =>
        s.title.toLowerCase().includes(q),
      );
      sortedMovies = sortedMovies.filter((m: LastSeenItem) =>
        (m.title || "").toLowerCase().includes(q),
      );
    }

    if (sortBy === "title") {
      groupedSeries.sort((a, b) => a.title.localeCompare(b.title));
      sortedMovies.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "episodes") {
      groupedSeries.sort((a, b) => b.episodes.length - a.episodes.length);
    } else if (sortBy === "year") {
      sortedMovies.sort((a: LastSeenItem, b: LastSeenItem) =>
        (b.meta?.year || "")
          .toString()
          .localeCompare((a.meta?.year || "").toString()),
      );
    }

    return { series: groupedSeries, movies: sortedMovies };
  }, [items, sortBy, searchQuery]);

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

  const totalMoviePages = Math.max(
    1,
    Math.ceil(movies.length / MOVIES_PER_PAGE),
  );
  const safeMoviePage = Math.min(moviePage, totalMoviePages - 1);
  const visibleMovies = movies.slice(
    safeMoviePage * MOVIES_PER_PAGE,
    (safeMoviePage + 1) * MOVIES_PER_PAGE,
  );

  const totalSeriesPages = Math.max(
    1,
    Math.ceil(series.length / SERIES_PER_PAGE),
  );
  const safeSeriesPage = Math.min(seriesPage, totalSeriesPages - 1);
  const visibleSeries = series.slice(
    safeSeriesPage * SERIES_PER_PAGE,
    (safeSeriesPage + 1) * SERIES_PER_PAGE,
  );

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

  function showSeriesEpisodes(show: SeriesGroup) {
    setSelectedSeriesId(String(show.id));
    setMoviePage(0);
    setSeriesPage(0);
  }

  function backToSeries() {
    setSelectedSeriesId(null);
  }

  const showSeriesSection = filterType === "all" || filterType === "tv";
  const showMoviesSection = filterType === "all" || filterType === "movies";
  const hasActiveFilter =
    filterType !== "all" || sortBy !== "recent" || searchQuery.trim();

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
              Your watched episodes and resume points will appear here as you
              start playing something.
            </p>
            <Link to="/tv" className="empty-state-action">
              Browse TV shows
            </Link>
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
              <FilterDropdown
                value={filterType}
                options={[
                  { value: "all", label: "All types" },
                  { value: "tv", label: "TV Shows" },
                  { value: "movies", label: "Movies" },
                ]}
                placeholder="All types"
                onSelect={setFilterType}
              />
              <FilterDropdown
                value={sortBy}
                options={[
                  { value: "recent", label: "Most recent" },
                  { value: "title", label: "Title A-Z" },
                  { value: "episodes", label: "Most episodes" },
                  { value: "year", label: "Year" },
                ]}
                placeholder="Sort by"
                onSelect={setSortBy}
              />
              {hasActiveFilter && (
                <button
                  className={styles.lastSeenClearBtn}
                  onClick={() => {
                    setFilterType("all");
                    setSortBy("recent");
                    setSearchQuery("");
                    setSelectedSeriesId(null);
                    setSeriesPage(0);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>

            {showSeriesSection && !selectedSeries && series.length > 0 && (
              <>
                <h3 className="sub-section-title">
                  TV Series ({series.length})
                </h3>
                <div className="media-grid">
                  {visibleSeries.map((show) => (
                    <div
                      key={show.id}
                      className={`media-card ${styles.lastSeenCard}`}
                    >
                      <Link
                        to={`/tv/${show.id}`}
                        className={styles.lastSeenCardLink}
                      >
                        <div className="media-card-poster">
                          <img
                            src={
                              show.poster
                                ? imageUrl(show.poster)
                                : imageUrl(null)
                            }
                            alt={show.title}
                            loading="lazy"
                          />
                        </div>
                        <div className="media-card-info">
                          <h3>{show.title}</h3>
                          <span className="media-card-year">
                            {show.episodes.length === 1 && !show.episodes[0].season
                              ? "Watched"
                              : `${show.episodes.length} episode${show.episodes.length === 1 ? "" : "s"}`}
                          </span>
                        </div>
                      </Link>
                      <button
                        className={styles.lastSeenViewBtn}
                        onClick={() => showSeriesEpisodes(show)}
                      >
                        View
                      </button>
                    </div>
                  ))}
                </div>
                {totalSeriesPages > 1 && (
                  <Pagination
                    page={safeSeriesPage + 1}
                    totalPages={totalSeriesPages}
                    onChange={(p) => setSeriesPage(p - 1)}
                    style={{ marginTop: "1rem" }}
                  />
                )}
              </>
            )}

            {showSeriesSection && selectedSeries && (
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
                          src={imageUrl(selectedSeries.poster)}
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
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove all ${watchedEpisodeCount(selectedSeries)} watched episode${watchedEpisodeCount(selectedSeries) === 1 ? "" : "s"} for "${selectedSeries.title}"?`,
                            )
                          )
                            handleRemoveShow(selectedSeries.id);
                        }}
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
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {showMoviesSection && movies.length > 0 && (
              <section className="section">
                <h3 className="sub-section-title">Movies ({movies.length})</h3>
                <div className="media-grid">
                  {visibleMovies.map((item) => (
                    <div key={item.storageKey} className="media-card">
                      <Link to={`/movie/${item.id}`}>
                        <div className="media-card-poster">
                          <img
                            src={imageUrl(item.meta?.poster as string | null)}
                            alt={item.title || ""}
                            loading="lazy"
                          />
                        </div>
                        <div className="media-card-info">
                          <h3>{item.title || `Movie ${item.id}`}</h3>
                        </div>
                      </Link>
                      <button
                        className="wl-remove"
                        onClick={() => handleRemove(item)}
                        title="Remove"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
                {totalMoviePages > 1 && (
                  <Pagination
                    page={safeMoviePage + 1}
                    totalPages={totalMoviePages}
                    onChange={(p) => setMoviePage(p - 1)}
                    style={{ marginTop: "1rem" }}
                  />
                )}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}
