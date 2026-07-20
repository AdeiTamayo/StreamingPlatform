import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getWatchLater, removeWatchLater, getEpisodeWatchLater, removeEpisodeWatchLater } from '../api/storage';
import { imageUrl } from '../api/tmdb';
import CollectionSkeleton from '../components/CollectionSkeleton';
import FilterDropdown from '../components/FilterDropdown';
import { useToast } from '../components/Toast';

export default function WatchLater() {
  const [items, setItems] = useState([]);
  const [epItems, setEpItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('recent');
  const [filterType, setFilterType] = useState('all');
  const toast = useToast();

  useEffect(() => {
    document.title = 'Watch Later - StreamFlow';
    setItems(getWatchLater());
    setEpItems(getEpisodeWatchLater());
    setLoading(false);
  }, []);

  function handleRemove(type, id) {
    removeWatchLater(type, id);
    setItems(getWatchLater());
    toast('Removed from Watch Later');
  }

  function handleRemoveEp(showId, season, episode) {
    removeEpisodeWatchLater(showId, season, episode);
    setEpItems(getEpisodeWatchLater());
    toast('Removed from Watch Later');
  }

  const sortedItems = useMemo(() => {
    let list = [...items];
    if (filterType === 'movies') list = list.filter((i) => i.type === 'movie');
    else if (filterType === 'tv') list = list.filter((i) => i.type === 'tv');
    if (sortBy === 'title') list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (sortBy === 'year') list.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));
    else list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    return list;
  }, [items, sortBy, filterType]);

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Watch Later</h2>
        {loading ? (
          <CollectionSkeleton variant="grid" count={6} />
        ) : items.length === 0 && epItems.length === 0 ? (
          <div className="empty-state">
            <h3>Nothing saved yet</h3>
            <p>Add movies, shows, or individual episodes to watch later and they'll show up here.</p>
            <Link to="/movies" className="empty-state-action">Start browsing</Link>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <>
                <div className="wl-controls">
                  <FilterDropdown
                    value={filterType}
                    options={[
                      { value: 'all', label: 'All types' },
                      { value: 'movies', label: 'Movies' },
                      { value: 'tv', label: 'TV Shows' },
                    ]}
                    placeholder="All types"
                    onSelect={setFilterType}
                  />
                  <FilterDropdown
                    value={sortBy}
                    options={[
                      { value: 'recent', label: 'Most recent' },
                      { value: 'title', label: 'Title A-Z' },
                      { value: 'year', label: 'Year' },
                    ]}
                    placeholder="Sort by"
                    onSelect={setSortBy}
                  />
                  {(filterType !== 'all' || sortBy !== 'recent') && (
                    <button className="wl-clear-btn" onClick={() => { setFilterType('all'); setSortBy('recent'); }}>Clear filters</button>
                  )}
                </div>
                <div className="media-grid">
                  {sortedItems.map((item) => (
                    <div key={`${item.type}-${item.id}`} className="media-card">
                      <Link to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}`}>
                        <div className="media-card-poster">
                          <img src={item.poster || imageUrl(null)} alt={item.title} loading="lazy" />
                          <span className={`media-card-type ${item.type}`}>{item.type === 'tv' ? 'TV' : 'Movie'}</span>
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
              </>
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
