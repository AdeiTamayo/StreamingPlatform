import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMovieDetail, imageUrl } from '../api/tmdb';
import { getMovieEmbedUrl } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater } from '../api/storage';
import Player from '../components/Player';

export default function MovieDetail() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const [inWL, setInWL] = useState(false);
  const progressTimer = useRef(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setWatched(isWatched('movie', id));
    setInWL(isInWatchLater('movie', id));
    const prog = getProgress('movie', id);
    setStartAt(prog?.currentTime || null);
    getMovieDetail(id)
      .then(setMovie)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  function handleProgress(currentTime) {
    saveProgress('movie', id, currentTime, null, null, { title: movie?.title, poster: movie?.poster_path });
  }

  function toggleWatched() {
    if (watched) {
      markUnwatched('movie', id);
      clearProgress('movie', id);
      setWatched(false);
    } else {
      markWatched('movie', id, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
      clearProgress('movie', id);
      setWatched(true);
    }
  }

  if (loading) return <div className="page"><div className="loading">Loading...</div></div>;
  function retry() {
    setLoading(true);
    setError(false);
    getMovieDetail(id).then(setMovie).catch(() => setError(true)).finally(() => setLoading(false));
  }

  if (error) return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <div className="loading">Failed to load. Check your connection.</div>
      <div className="retry-bar"><button className="watch-toggle" onClick={retry}>Retry</button></div>
    </div>
  );
  if (!movie) return <div className="page"><div className="loading">Movie not found</div></div>;

  const embedUrl = getMovieEmbedUrl(id, startAt);
  const backdrop = imageUrl(movie.backdrop_path, 'original');
  const year = (movie.release_date || '').slice(0, 4);
  const cast = movie.credits?.cast?.slice(0, 8) || [];
  const genres = movie.genres?.map((g) => g.name).join(', ') || '';

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <div className="detail-header" style={{ backgroundImage: `url(${backdrop})` }}>
        <div className="detail-header-overlay">
          <div className="detail-poster">
            <img src={imageUrl(movie.poster_path)} alt={movie.title} />
          </div>
          <div className="detail-meta">
            <h1>{movie.title} <span className="year">({year})</span></h1>
            <div className="detail-badges">
              <span className="badge rating">{movie.vote_average?.toFixed(1)}</span>
              {genres && <span className="badge">{genres}</span>}
              <span className="badge">{movie.runtime} min</span>
              {startAt && <span className="badge resume-badge">Resume at {Math.floor(startAt / 60)}:{String(Math.floor(startAt % 60)).padStart(2, '0')}</span>}
            </div>
            <p className="detail-overview">{movie.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast">
                <strong>Cast:</strong> {cast.map((c) => c.name).join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="section">
        <h2 className="section-title">Watch Now</h2>
        <div className="detail-actions">
          <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
            {watched ? 'Watched' : 'Mark as watched'}
          </button>
          <button className={`watch-toggle ${inWL ? 'in-wl' : ''}`} onClick={() => {
            if (inWL) { removeWatchLater('movie', id); setInWL(false); }
            else { addWatchLater('movie', id, movie.title, year, imageUrl(movie.poster_path)); setInWL(true); }
          }}>{inWL ? 'In Watch Later' : 'Watch Later'}</button>
          {startAt && (
            <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('movie', id); }}>
              Restart from beginning
            </button>
          )}
        </div>
        <Player key={startAt !== null ? 'resume' : 'fresh'} src={embedUrl} title={movie.title} onProgress={handleProgress} />
      </section>
    </div>
  );
}
