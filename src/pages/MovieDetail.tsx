import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { getMovieDetail, imageUrl } from '../api/tmdb';
import { getMovieEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { isWatched, markWatched, markUnwatched, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater, getVideoSource } from '../api/storage';
import Player from '../components/Player';
import MediaCard from '../components/MediaCard';
import FilterDropdown from '../components/FilterDropdown';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { logDebug } from '../utils/logger';
import type { TMDBMovie, TMDBCastMember, TMDBCrewMember } from '../types';
import styles from './MovieDetail.module.css';

const AUTO_WATCH_REMAINING_SECONDS = 120;

export default function MovieDetail() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [movie, setMovie] = useState<TMDBMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [inWL, setInWL] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef(false);
  const { getSignal } = useAbortController();

  useEffect(() => {
    if (!id) return;
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
    getMovieDetail(id!, getSignal())
      .then((data) => {
        setMovie(data as TMDBMovie);
        document.title = `${(data as TMDBMovie).title} - StreamFlow`;
        const vids = (data as TMDBMovie).videos?.results || [];
        const yt = vids.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
      })
      .catch((err: Error) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const safeId = id!;

  function autoMarkWatched() {
    if (!movie || watchedRef.current || autoWatchedRef.current) return;
    autoWatchedRef.current = true;
    markWatched('movie', safeId, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
    clearProgress('movie', safeId);
    watchedRef.current = true;
    setWatched(true);
    setStartAt(null);
  }

  function handleProgress(currentTime: number, duration: number) {
    if (watchedRef.current || !movie) return;
    saveProgress('movie', safeId, currentTime, null, null, { title: movie?.title, poster: movie?.poster_path });
    const tmdbRuntime = movie.runtime || null;
    const runtimeSeconds = duration || (tmdbRuntime ? tmdbRuntime * 60 : null);

    logDebug(`autoWatch check: currentTime=${currentTime} duration=${duration} tmdbRuntime=${tmdbRuntime} runtimeSeconds=${runtimeSeconds}`);

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
    if (!movie || !id) return;
    if (watched) {
      markUnwatched('movie', id);
      clearProgress('movie', id);
      setWatched(false);
      toast?.('Removed from watched');
    } else {
      markWatched('movie', id, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
      clearProgress('movie', id);
      setWatched(true);
      toast?.('Marked as watched');
    }
  }

  function retry() {
    if (!id) return;
    setLoading(true);
    setError(false);
    getMovieDetail(id, getSignal()).then(setMovie).catch((err: Error) => { if (err?.name !== 'AbortError') setError(true); }).finally(() => setLoading(false));
  }

  if (loading) return <div className="page"><div className="loading" role="status">Loading...</div></div>;

  if (error) return (
    <div className="page" role="alert">
      <div className="loading">Failed to load. Check your connection.</div>
      <div className="retry-bar"><button className="watch-toggle" onClick={retry}>Retry</button></div>
    </div>
  );
  if (!movie) return <div className="page"><div className="loading">Movie not found</div></div>;

  const embedUrl = getMovieEmbedUrl(safeId, videoSource);
  const backdrop = imageUrl(movie.backdrop_path, 'original');
  const year = (movie.release_date || '').slice(0, 4);
  const cast: TMDBCastMember[] = movie.credits?.cast?.slice(0, 8) || [];
  const crew: TMDBCrewMember[] = movie.credits?.crew || [];
  const director = crew.find((c) => c.job === 'Director');
  const writers = crew.filter((c) => c.job === 'Screenplay' || c.job === 'Writer').slice(0, 2);
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
            {director && (
              <div className="detail-crew"><strong>Director:</strong> {director.name}</div>
            )}
            {writers.length > 0 && (
              <div className="detail-crew"><strong>Writers:</strong> {writers.map((w) => w.name).join(', ')}</div>
            )}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="watch-heading">
        <h2 id="watch-heading" className="section-title">Watch Now</h2>
        <div className="detail-actions">
          <button className={`watch-toggle ${watched ? 'watched' : ''}`} onClick={toggleWatched}>
            {watched ? 'Watched' : 'Mark as watched'}
          </button>
          <button className={`watch-toggle ${inWL ? 'in-wl' : ''}`} onClick={() => {
            if (inWL) { removeWatchLater('movie', safeId); setInWL(false); }
            else { addWatchLater('movie', safeId, movie.title, year, imageUrl(movie.poster_path)); setInWL(true); }
          }}>{inWL ? 'In Watch Later' : 'Watch Later'}</button>
          {trailerKey && (
            <button className="watch-toggle" onClick={() => setShowTrailer((s) => !s)}>
              {showTrailer ? 'Hide Trailer' : 'Trailer'}
            </button>
          )}
          {startAt && (
            <button className="watch-toggle restart-btn" onClick={() => { setStartAt(null); clearProgress('movie', safeId); }}>
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
          <Player key={startAt !== null ? 'resume' : 'fresh'} src={embedUrl} title={movie.title} onProgress={handleProgress} onEnded={handleEnded} runtimeMinutes={movie.runtime ?? null} />
        )}
        <div className={styles.sourceSelector}>
          <FilterDropdown
            value={videoSource}
            options={SOURCE_KEYS.map((key: string) => ({ value: key, label: getSourceLabel(key) }))}
            placeholder="Source"
            onSelect={(val: string) => setVideoSource(val)}
            className="source-dropdown"
          />
        </div>
      </section>

      {recommendations.length > 0 && (
        <section className="section" aria-labelledby="recs-heading">
          <h2 id="recs-heading" className="section-title">You might also like</h2>
          <div className="media-grid">
            {recommendations.map((item) => (
              <MediaCard key={(item as { id: number }).id} item={item as TMDBMovie} mediaType="movie" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
