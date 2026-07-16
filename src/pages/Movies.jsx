import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPopularMovies } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getPopularMovies(page)
      .then((data) => setMovies(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Popular Movies</h2>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="media-grid">
              {movies.map((movie) => (
                <MediaCard key={movie.id} item={movie} mediaType="movie" />
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
