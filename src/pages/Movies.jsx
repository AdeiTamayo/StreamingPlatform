import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPopularMovies, getMovieGenres, discoverByGenre } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [genres, setGenres] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState('');

  useEffect(() => {
    getMovieGenres().then((data) => setGenres(data.genres || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const fetcher = genre ? discoverByGenre('movie', genre, page) : getPopularMovies(page);
    fetcher.then((data) => setMovies(data.results || [])).catch(console.error).finally(() => setLoading(false));
  }, [page, genre]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Movies</h2>
          <select className="genre-select" value={genre} onChange={(e) => { setGenre(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
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
