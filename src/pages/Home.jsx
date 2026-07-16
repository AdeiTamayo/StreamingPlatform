import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrending } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
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
        </div>
      </section>
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
