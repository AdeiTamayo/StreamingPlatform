import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getLastSeen, markUnwatched, clearProgress } from '../api/storage';
import { imageUrl } from '../api/tmdb';
import CollectionSkeleton from '../components/CollectionSkeleton';

const EPISODES_PER_PAGE = 6;

function getShowTitle(item) {
  const rawTitle = item.meta?.title || item.title || `Show ${item.id}`;
  return rawTitle.replace(/\sS\d+E\d+$/, '');
}

function formatEpisodeLabel(item) {
  if (item.season && item.episode) return `S${item.season}E${item.episode}`;
  return 'Episode';
}

export default function LastSeen() {
  const [items, setItems] = useState([]);
  const [pages, setPages] = useState({});
  const [hideWatched, setHideWatched] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Last Seen - StreamFlow';
    setItems(getLastSeen());
    setLoading(false);
  }, []);

  const { series, movies } = useMemo(() => {
    const seriesMap = new Map();
    const movieItems = [];

    items.forEach((item) => {
      if (item.type === 'tv' && item.season && item.episode) {
        const key = String(item.id);
        const existing = seriesMap.get(key) || {
          id: item.id,
          title: getShowTitle(item),
          poster: item.meta?.poster || null,
          latestTs: item.ts || 0,
          episodes: [],
        };
        existing.title = existing.title || getShowTitle(item);
        existing.poster = existing.poster || item.meta?.poster || null;
        existing.latestTs = Math.max(existing.latestTs, item.ts || 0);
        existing.episodes.push(item);
        seriesMap.set(key, existing);
      } else {
        movieItems.push(item);
      }
    });

    const groupedSeries = Array.from(seriesMap.values())
      .sort((a, b) => (b.latestTs || 0) - (a.latestTs || 0))
      .map((group) => ({
        ...group,
        episodes: group.episodes.sort((a, b) => (b.ts || 0) - (a.ts || 0)),
      }));

    const sortedMovies = movieItems.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    return { series: groupedSeries, movies: sortedMovies };
  }, [items]);

  function handleRemove(item) {
    if (item.type === 'movie') {
      markUnwatched('movie', item.id);
      clearProgress('movie', item.id);
    } else if (item.season && item.episode) {
      markUnwatched('tv', item.id, item.season, item.episode);
      clearProgress('tv', item.id, item.season, item.episode);
    }
    setItems(getLastSeen());
  }

  function setPage(showId, nextPage) {
    setPages((current) => ({ ...current, [showId]: nextPage }));
  }

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Last Seen</h2>
        {loading ? (
          <>
            <CollectionSkeleton variant="history" count={3} />
          </>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3>No history yet</h3>
            <p>Your watched episodes and resume points will appear here as you start playing something.</p>
            <Link to="/tv" className="empty-state-action">Browse TV shows</Link>
          </div>
        ) : (
          <>
            {series.length > 0 && (
              <div className="last-seen-groups">
                {series.map((show) => {
                  const hidden = hideWatched[show.id] || false;
                  const filtered = hidden ? show.episodes.filter((ep) => ep.source === 'progress') : show.episodes;
                  const currentPage = pages[show.id] || 0;
                  const pageCount = Math.max(1, Math.ceil(filtered.length / EPISODES_PER_PAGE));
                  const safePage = Math.min(currentPage, pageCount - 1);
                  const visibleEpisodes = filtered.slice(safePage * EPISODES_PER_PAGE, (safePage + 1) * EPISODES_PER_PAGE);

                  return (
                    <article key={show.id} className="last-seen-series">
                      <div className="last-seen-series-head">
                        <div className="last-seen-series-title-wrap">
                          {show.poster && <img src={imageUrl(show.poster)} alt={show.title} className="last-seen-series-poster" />}
                          <div>
                            <h3 className="last-seen-series-title">{show.title}</h3>
                            <p className="last-seen-series-subtitle">{show.episodes.length} saved episode{show.episodes.length === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                        <div className="last-seen-series-actions">
                          <button className={`watch-toggle ${hidden ? 'in-wl' : ''}`} onClick={() => setHideWatched((prev) => ({ ...prev, [show.id]: !hidden }))}>
                            {hidden ? 'Show all' : 'Hide watched'}
                          </button>
                          <Link to={`/tv/${show.id}`} className="last-seen-series-link">Open show</Link>
                        </div>
                      </div>

                      <div className="last-seen-episode-list">
                        {visibleEpisodes.map((item) => (
                          <div key={item.storageKey} className="last-seen-episode-row">
                            <Link
                              to={`/tv/${show.id}?season=${item.season}&episode=${item.episode}`}
                              className="last-seen-episode"
                            >
                              <span className="ls-label">{formatEpisodeLabel(item)}</span>
                              <span className="ls-meta">{item.source === 'progress' ? 'Resume' : 'Watched'}</span>
                            </Link>
                            <button className="ls-remove" onClick={() => handleRemove(item)} title="Remove">&times;</button>
                          </div>
                        ))}
                      </div>

                      {pageCount > 1 && (
                        <div className="pagination last-seen-pagination">
                          <button disabled={safePage === 0} onClick={() => setPage(show.id, safePage - 1)}>Previous</button>
                          <span>Page {safePage + 1} of {pageCount}</span>
                          <button disabled={safePage >= pageCount - 1} onClick={() => setPage(show.id, safePage + 1)}>Next</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {movies.length > 0 && (
              <section className="section last-seen-movies">
                <h3 className="sub-section-title">Movies</h3>
                <div className="media-grid">
                  {movies.map((item) => (
                    <div key={item.storageKey} className="media-card">
                      <Link to={`/movie/${item.id}`}>
                        <div className="media-card-poster">
                          <img src={imageUrl(item.meta?.poster)} alt={item.title} loading="lazy" />
                        </div>
                        <div className="media-card-info">
                          <h3>{item.title || `Movie ${item.id}`}</h3>
                        </div>
                      </Link>
                      <button className="wl-remove" onClick={() => handleRemove(item)}>Remove</button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </div>
  );
}
