import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getLastSeen } from '../api/storage';
import { imageUrl } from '../api/tmdb';

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

  useEffect(() => {
    setItems(getLastSeen());
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

  function setPage(showId, nextPage) {
    setPages((current) => ({ ...current, [showId]: nextPage }));
  }

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Last Seen</h2>
        {items.length === 0 ? (
          <div className="loading">No activity yet</div>
        ) : (
          <>
            {series.length > 0 && (
              <div className="last-seen-groups">
                {series.map((show) => {
                  const currentPage = pages[show.id] || 0;
                  const pageCount = Math.max(1, Math.ceil(show.episodes.length / EPISODES_PER_PAGE));
                  const safePage = Math.min(currentPage, pageCount - 1);
                  const visibleEpisodes = show.episodes.slice(safePage * EPISODES_PER_PAGE, (safePage + 1) * EPISODES_PER_PAGE);

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
                        <Link to={`/tv/${show.id}`} className="last-seen-series-link">Open show</Link>
                      </div>

                      <div className="last-seen-episode-list">
                        {visibleEpisodes.map((item) => (
                          <Link
                            key={item.storageKey}
                            to={`/tv/${show.id}?season=${item.season}&episode=${item.episode}`}
                            className="last-seen-episode"
                          >
                            <span className="ls-label">{formatEpisodeLabel(item)}</span>
                            <span className="ls-meta">{item.source === 'progress' ? 'Resume' : 'Watched'}</span>
                          </Link>
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
                <div className="last-seen-list">
                  {movies.map((item) => (
                    <Link key={item.storageKey} to={`/movie/${item.id}`} className="last-seen-item">
                      <span className="ls-label">{item.title || `Movie ${item.id}`}</span>
                      <span className="ls-meta">Movie</span>
                    </Link>
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
