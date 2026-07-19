import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getMovieDetail, imageUrl } from '../api/tmdb';
import { getMovieEmbedUrl } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater } from '../api/storage';
import Player from '../components/Player';
import MediaCard from '../components/MediaCard';

const AUTO_WATCH_REMAINING_SECONDS = 120;

export default function MovieDetail() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const [inWL, setInWL] = useState(false);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setWatched(isWatched('movie', id));
    setInWL(isInWatchLater('movie', id));
    const prog = getProgress('movie', id);
    setStartAt(prog?.currentTime || null);
    watchedRef.current = isWatched('movie', id);
    autoWatchedRef.current = false;
    setTrailerKey(null);
    setShowTrailer(false);
    getMovieDetail(id)
      .then((data) => {
        setMovie(data);
        document.title = `${data.title} - StreamFlow`;
        const vids = data.videos?.results || [];
        const yt = vids.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  function autoMarkWatched() {
    if (!movie || watchedRef.current || autoWatchedRef.current) return;
    autoWatchedRef.current = true;
    markWatched('movie', id, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
    clearProgress('movie', id);
    watchedRef.current = true;
    setWatched(true);
    setStartAt(null);
  }

  function handleProgress(currentTime, duration) {
    if (watchedRef.current || !movie) return;
    saveProgress('movie', id, currentTime, null, null, { title: movie?.title, poster: movie?.poster_path });
    const tmdbRuntime = movie.runtime || null;
    const runtimeSeconds = duration || (tmdbRuntime ? tmdbRuntime * 60 : null);

    try {
      const prev = JSON.parse(localStorage.getItem('player_debug') || '[]');
      prev.push({ ts: Date.now(), msg: `autoWatch check: currentTime=${currentTime} duration=${duration} tmdbRuntime=${tmdbRuntime} runtimeSeconds=${runtimeSeconds}` });
      if (prev.length > 50) prev.splice(0, prev.length - 50);
      localStorage.setItem('player_debug', JSON.stringify(prev));
    } catch { }

    if (!runtimeSeconds) return;
    const autoWatchThreshold = Math.min(runtimeSeconds * 0.9, runtimeSeconds - AUTO_WATCH_REMAINING_SECONDS);
    if (autoWatchThreshold > 0 && currentTime >= autoWatchThreshold) {
      autoMarkWatched();
    }
  }

  function handleEnded() {
    autoMarkWatched();
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

  function retry() {
    setLoading(true);
    setError(false);
    getMovieDetail(id).then(setMovie).catch(() => setError(true)).finally(() => setLoading(false));
  }

  if (loading) return <div className="page"><div className="loading">Loading...</div></div>;

  if (error) return (
    <div className="page">
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
  const recommendations = movie.recommendations?.results?.slice(0, 10) || [];

  return (
    <div className="page">
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
          {trailerKey && (
            <button className="watch-toggle" onClick={() => setShowTrailer((s) => !s)}>
              {showTrailer ? 'Hide Trailer' : 'Trailer'}
            </button>
          )}
          {startAt && (
            <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('movie', id); }}>
              Restart from beginning
            </button>
          )}
        </div>
        {showTrailer && trailerKey && (
          <div className="trailer-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}`}
              title="Trailer"
              allow="autoplay; fullscreen; encrypted-media"
              allowFullScreen
              className="player-iframe"
            />
          </div>
        )}
        {!showTrailer && (
          <Player key={startAt !== null ? 'resume' : 'fresh'} src={embedUrl} title={movie.title} onProgress={handleProgress} onEnded={handleEnded} runtimeMinutes={movie.runtime} />
        )}
      </section>

      {recommendations.length > 0 && (
        <section className="section">
          <h2 className="section-title">You might also like</h2>
          <div className="media-grid">
            {recommendations.map((item) => (
              <MediaCard key={item.id} item={item} mediaType="movie" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
