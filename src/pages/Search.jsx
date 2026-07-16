import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchMulti } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    searchMulti(query)
      .then((data) => setResults(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Search Results for "{query}"</h2>
        {loading ? (
          <div className="loading">Searching...</div>
        ) : results.length === 0 ? (
          <div className="loading">No results found</div>
        ) : (
          <div className="media-grid">
            {results.filter((item) => item.media_type !== 'person').map((item) => (
              <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
