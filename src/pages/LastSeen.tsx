import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getLastSeen, markUnwatched, clearProgress, clearShowHistory } from '../api/storage';
import { imageUrl } from '../api/tmdb';
import CollectionSkeleton from '../components/CollectionSkeleton';
import FilterDropdown from '../components/FilterDropdown';
import { useToast } from '../components/useToast';
import type { LastSeenItem } from '../types';
import styles from './LastSeen.module.css';

const MOVIES_PER_PAGE = 20;

interface SeriesGroup {
  id: number | string;
  title: string;
  poster: string | null;
  latestTs: number;
  episodes: LastSeenItem[];
}

function formatEpisodeLabel(item: LastSeenItem): string {
  if (item.season && item.episode) return `S${item.season}E${item.episode}`;
  return 'Episode';
}

export default function LastSeen() {
  const [items, setItems] = useState<LastSeenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [moviePage, setMoviePage] = useState(0);
  const [selectedSeries, setSelectedSeries] = useState<SeriesGroup | null>(null);
  const toast = useToast();

  useEffect(() => {
    document.title = 'Last Seen - StreamFlow';
    setItems(getLastSeen());
    setLoading(false);
  }, []);

  const { series, movies } = useMemo(() => {
    const seriesMap = new Map<string, SeriesGroup>();
    const movieItems: LastSeenItem[] = [];

    items.forEach((item: LastSeenItem) => {
      if (item.type === 'tv' && item.season && item.episode) {
        const key = String(item.id);
        const rawTitle = (item.meta?.title as string) || item.title || `Show ${item.id}`;
        const title = rawTitle.replace(/\sS\d+E\d+$/, '') || `Show ${item.id}`;
        const existing = seriesMap.get(key) || ({
          id: item.id,
          title,
          poster: (item.meta?.poster as string) || null,
          latestTs: item.ts || 0,
          episodes: [] as LastSeenItem[],
        } as SeriesGroup);
        existing.title = existing.title || title;
        existing.poster = existing.poster || (item.meta?.poster as string) || null;
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

    let sortedMovies = [...movieItems].sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      groupedSeries = groupedSeries.filter((s: SeriesGroup) => s.title.toLowerCase().includes(q));
      sortedMovies = sortedMovies.filter((m: LastSeenItem) => (m.title || '').toLowerCase().includes(q));
    }

    if (sortBy === 'title') {
      groupedSeries.sort((a, b) => a.title.localeCompare(b.title));
      sortedMovies.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'episodes') {
      groupedSeries.sort((a, b) => b.episodes.length - a.episodes.length);
    } else if (sortBy === 'year') {
      sortedMovies.sort((a: LastSeenItem, b: LastSeenItem) => ((b.meta?.year || '').toString().localeCompare((a.meta?.year || '').toString())));
    }

    return { series: groupedSeries, movies: sortedMovies };
  }, [items, sortBy, searchQuery]);

  const totalMoviePages = Math.max(1, Math.ceil(movies.length / MOVIES_PER_PAGE));
  const safeMoviePage = Math.min(moviePage, totalMoviePages - 1);
  const visibleMovies = movies.slice(safeMoviePage * MOVIES_PER_PAGE, (safeMoviePage + 1) * MOVIES_PER_PAGE);

  function handleRemove(item: LastSeenItem) {
    if (item.type === 'movie') {
      markUnwatched('movie', item.id);
      clearProgress('movie', item.id);
    } else if (item.season && item.episode) {
      markUnwatched('tv', item.id, item.season, item.episode);
      clearProgress('tv', item.id, item.season, item.episode);
    }
    setItems(getLastSeen());
    toast?.('Removed from history');
  }

  function handleRemoveShow(showId: string | number) {
    clearShowHistory(showId);
    setItems(getLastSeen());
    if (selectedSeries && String(selectedSeries.id) === String(showId)) {
      setSelectedSeries(null);
    }
    toast?.('Series removed from history');
  }

  function showSeriesEpisodes(show: SeriesGroup) {
    setSelectedSeries(show);
    setMoviePage(0);
  }

  function backToSeries() {
    setSelectedSeries(null);
  }

  const showSeriesSection = filterType === 'all' || filterType === 'tv';
  const showMoviesSection = filterType === 'all' || filterType === 'movies';
  const hasActiveFilter = filterType !== 'all' || sortBy !== 'recent' || searchQuery.trim();

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Last Seen</h2>
        {loading ? (
          <CollectionSkeleton variant="history" count={3} />
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>No history yet</h3>
            <p>Your watched episodes and resume points will appear here as you start playing something.</p>
            <Link to="/tv" className="empty-state-action">Browse TV shows</Link>
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
              />
              <FilterDropdown
                value={filterType}
                options={[
                  { value: 'all', label: 'All types' },
                  { value: 'tv', label: 'TV Shows' },
                  { value: 'movies', label: 'Movies' },
                ]}
                placeholder="All types"
                onSelect={setFilterType}
              />
              <FilterDropdown
                value={sortBy}
                options={[
                  { value: 'recent', label: 'Most recent' },
                  { value: 'title', label: 'Title A-Z' },
                  { value: 'episodes', label: 'Most episodes' },
                  { value: 'year', label: 'Year' },
                ]}
                placeholder="Sort by"
                onSelect={setSortBy}
              />
              {hasActiveFilter && (
                <button className={styles.lastSeenClearBtn} onClick={() => { setFilterType('all'); setSortBy('recent'); setSearchQuery(''); setSelectedSeries(null); }}>Clear filters</button>
              )}
            </div>

            {showSeriesSection && !selectedSeries && series.length > 0 && (
              <>
                <h3 className="sub-section-title">TV Series ({series.length})</h3>
                <div className="media-grid">
                  {series.map((show) => (
                    <div key={show.id} className="media-card">
                      <Link to={`/tv/${show.id}`}>
                        <div className="media-card-poster">
                          <img src={show.poster ? imageUrl(show.poster) : imageUrl(null)} alt={show.title} loading="lazy" />
                        </div>
                        <div className="media-card-info">
                          <h3>{show.title}</h3>
                          <div className={styles.lastSeenMetaRow}>
                            <span className="media-card-year">{show.episodes.length} watched episode{show.episodes.length === 1 ? '' : 's'}</span>
                            <button className={styles.lastSeenViewBtn} onClick={(e) => { e.preventDefault(); e.stopPropagation(); showSeriesEpisodes(show); }}>
                              View
                            </button>
                          </div>
                        </div>
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}

            {showSeriesSection && selectedSeries && (
              <>
                <div className={styles.lastSeenDetailHeader}>
                  <button onClick={backToSeries} className={styles.lastSeenBackBtn}>&larr; Back to series</button>
                  <h3 className={styles.lastSeenDetailTitle}>{selectedSeries.title}</h3>
                </div>
                <div className="last-seen-series">
                  <div className="last-seen-series-head">
                    <div className="last-seen-series-title-wrap">
                      {selectedSeries.poster && <img src={imageUrl(selectedSeries.poster)} alt={selectedSeries.title} className={styles.lastSeenSeriesPoster} />}
                      <div>
                        <h3 className={styles.lastSeenSeriesTitle}>{selectedSeries.title}</h3>
                        <p className={styles.lastSeenSeriesSubtitle}>{selectedSeries.episodes.length} watched episode{selectedSeries.episodes.length === 1 ? '' : 's'}</p>
                      </div>
                    </div>
                    <div className={styles.lastSeenSeriesActions}>
                      <Link to={`/tv/${selectedSeries.id}`} className={styles.lastSeenSeriesLink}>Open show</Link>
                      <button className="watch-toggle danger" onClick={() => { if (window.confirm(`Remove all ${selectedSeries.episodes.length} watched episode${selectedSeries.episodes.length === 1 ? '' : 's'} for "${selectedSeries.title}"?`)) handleRemoveShow(selectedSeries.id); }}>
                        Remove all
                      </button>
                    </div>
                  </div>

                  <div className="last-seen-episode-list">
                    {selectedSeries.episodes.map((item) => (
                      <div key={item.storageKey} className={styles.lastSeenEpisodeRow}>
                        <Link
                          to={`/tv/${selectedSeries.id}?season=${item.season}&episode=${item.episode}`}
                          className={styles.lastSeenEpisode}
                        >
                          <span className={styles.lsLabel}>{formatEpisodeLabel(item)}</span>
                          <span className={styles.lsMeta}>{item.source === 'progress' ? 'Resume' : 'Watched'}</span>
                        </Link>
                        <button className={styles.lsRemove} onClick={() => handleRemove(item)} title="Remove">&times;</button>
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
                          <img src={imageUrl(item.meta?.poster as string | null)} alt={item.title || ''} loading="lazy" />
                        </div>
                        <div className="media-card-info">
                          <h3>{item.title || `Movie ${item.id}`}</h3>
                        </div>
                      </Link>
                      <button className="wl-remove" onClick={() => handleRemove(item)} title="Remove">&times;</button>
                    </div>
                  ))}
                </div>
                {totalMoviePages > 1 && (
                  <div className="pagination" style={{ marginTop: '1rem' }}>
                    <button disabled={safeMoviePage === 0} onClick={() => setMoviePage((p) => p - 1)}>Prev</button>
                    <span>Page {safeMoviePage + 1} of {totalMoviePages}</span>
                    <button disabled={safeMoviePage >= totalMoviePages - 1} onClick={() => setMoviePage((p) => p + 1)}>Next</button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}
