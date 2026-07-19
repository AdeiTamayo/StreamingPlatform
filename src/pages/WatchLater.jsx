import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getWatchLater, removeWatchLater, getEpisodeWatchLater, removeEpisodeWatchLater } from '../api/storage';
import { imageUrl } from '../api/tmdb';
import CollectionSkeleton from '../components/CollectionSkeleton';

export default function WatchLater() {
  const [items, setItems] = useState([]);
  const [epItems, setEpItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Watch Later - StreamFlow';
    setItems(getWatchLater());
    setEpItems(getEpisodeWatchLater());
    setLoading(false);
  }, []);

  function handleRemove(type, id) {
    removeWatchLater(type, id);
    setItems(getWatchLater());
  }

  function handleRemoveEp(showId, season, episode) {
    removeEpisodeWatchLater(showId, season, episode);
    setEpItems(getEpisodeWatchLater());
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
            <p>Add movies, shows, or individual episodes to watch later and they’ll show up here.</p>
            <Link to="/movies" className="empty-state-action">Start browsing</Link>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <div className="media-grid">
                {items.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="media-card">
                    <Link to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}`}>
                      <div className="media-card-poster">
                        <img src={item.poster || imageUrl(null)} alt={item.title} loading="lazy" />
                      </div>
                      <div className="media-card-info">
                        <h3>{item.title}</h3>
                        {item.year && <span className="media-card-year">{item.year}</span>}
                      </div>
                    </Link>
                    <button className="wl-remove" onClick={() => handleRemove(item.type, item.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            {epItems.length > 0 && (
              <>
                <h3 className="sub-section-title">Episodes</h3>
                <div className="media-grid">
                  {epItems.map((item) => (
                    <div key={`${item.showId}-S${item.season}E${item.episode}`} className="media-card ep-wl-card">
                      <Link to={`/tv/${item.showId}?season=${item.season}&episode=${item.episode}`}>
                        <div className="media-card-info">
                          <h3>{item.showTitle}</h3>
                          <span className="media-card-year">S{item.season} E{item.episode}</span>
                        </div>
                      </Link>
                      <button className="wl-remove" onClick={() => handleRemoveEp(item.showId, item.season, item.episode)}>Remove</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
