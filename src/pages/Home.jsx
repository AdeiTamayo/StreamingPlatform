import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrending } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getContinueWatching } from '../api/storage';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [continueWatching, setContinueWatching] = useState([]);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setContinueWatching(getContinueWatching());
    getTrending('all')
      .then((data) => setTrending(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setQuery('');
    }
  }

  return (
    <div className="page">
      <section className="hero">
        <form className="hero-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search movies & shows..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
        <div className="nav-links">
          <Link to="/movies">Movies</Link>
          <Link to="/tv">TV Shows</Link>
          <Link to="/watch-later">Watch Later</Link>
          <Link to="/last-seen">Last Seen</Link>
          <Link to="/settings">Settings</Link>
        </div>
      </section>

      {continueWatching.length > 0 && (
        <section className="section">
          <h2 className="section-title">Continue Watching</h2>
          <div className="cw-list">
            {continueWatching.map((item, i) => {
              const mins = Math.floor(item.currentTime / 60);
              const secs = Math.floor(item.currentTime % 60);
              const label = item.meta?.title || `${item.type === 'movie' ? 'Movie' : 'Show'} ${item.id}`;
              return (
                <Link
                  key={`${item.type}-${item.id}-${item.episode || ''}-${i}`}
                  to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}`}
                  className="cw-item"
                >
                  <span className="cw-label">{label}{item.episode ? ` S${item.season}E${item.episode}` : ''}</span>
                  <span className="cw-progress">{mins}:{String(secs).padStart(2, '0')}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Trending This Week</h2>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="media-grid">
            {trending.map((item) => (
              <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
