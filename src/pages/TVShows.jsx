import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPopularTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function TVShows() {
  const [shows, setShows] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPopularTV(page)
      .then((data) => setShows(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Popular TV Shows</h2>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="media-grid">
              {shows.map((show) => (
                <MediaCard key={show.id} item={show} mediaType="tv" />
              ))}
            </div>
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
