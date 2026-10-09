import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getMovieDetail, imageUrl } from '../api/tmdb';
import { getMovieEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { getImdbRating, type ImdbRating } from '../api/omdb';
import { isWatched, markWatched, markUnwatched, saveProgress, getProgress, clearProgress, isInWatchLater, addWatchLater, removeWatchLater, getVideoSource, setVideoSource as persistVideoSource } from '../api/storage';
import Player from '../components/Player';
import MediaCard from '../components/MediaCard';
import FilterDropdown from '../components/FilterDropdown';
import PersonList from '../components/PersonList';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { useAuth } from '../hooks/useAuth';
import { logDebug } from '../utils/logger';
import type { TMDBMovie, TMDBCastMember, TMDBCrewMember } from '../types';
import styles from './MovieDetail.module.css';

const AUTO_WATCH_REMAINING_SECONDS = 120;

export default function MovieDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  // TMDB ids are numeric - reject anything else up front so a crafted URL
  // can never reach API paths, storage keys, or the embed iframe src.
  const id = rawId && /^\d+$/.test(rawId) ? rawId : undefined;
  const toast = useToast();
  const [movie, setMovie] = useState<TMDBMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [watched, setWatched] = useState(false);
  const [startAt, setStartAt] = useState<number | null>(null);
  // Bumped on every Restart click so the player remounts from 0:00 even
  // when there was no saved position (key would otherwise be unchanged).
  const [restartTick, setRestartTick] = useState(0);
  const [inWL, setInWL] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(null);
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const watchedRef = useRef(false);
  const autoWatchedRef = useRef(false);
  const lastTimeRef = useRef<number | null>(null);
  const playerWrapRef = useRef<HTMLDivElement | null>(null);
  const { getSignal } = useAbortController();
  const { isAuthenticated, syncVersion } = useAuth();

  const refreshFromStorage = useCallback(() => {
    if (!id) return;
    setWatched(isWatched('movie', id));
    setInWL(isInWatchLater('movie', id));
    const prog = getProgress('movie', id);
    setStartAt(prog?.currentTime || null);
    watchedRef.current = isWatched('movie', id);
  }, [id]);

  useEffect(() => {
    refreshFromStorage();
  }, [isAuthenticated, syncVersion, refreshFromStorage]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    refreshFromStorage();
    autoWatchedRef.current = false;
    setTrailerKey(null);
    setShowTrailer(false);
    getMovieDetail(id, getSignal())
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
  }, [id, refreshFromStorage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!movie?.imdb_id) {
      setImdbRating(null);
      return;
    }
    let cancelled = false;
    getImdbRating(movie.imdb_id, 'movie').then((r) => {
      if (!cancelled) setImdbRating(r);
    });
    return () => { cancelled = true; };
  }, [movie?.imdb_id]);

  // Keyboard shortcuts: W = toggle watched, L = toggle Watch Later,
  // F = toggle player fullscreen. Ignored while typing in a field or with
  // modifier keys held.
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    }
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k !== 'w' && k !== 'f' && k !== 'l') return;
      if (!movie || !id) return;
      if (k === 'f') {
        if (showTrailer) return;
        e.preventDefault();
        togglePlayerFullscreen();
        return;
      }
      if (k === 'l') {
        e.preventDefault();
        toggleWatchLater();
        return;
      }
      e.preventDefault();
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [movie, id, watched, inWL, showTrailer, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return <div className="page"><div className="loading">Movie not found</div></div>;

  const safeId = id;

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
    lastTimeRef.current = currentTime;
    if (watchedRef.current || !movie) return;
    saveProgress('movie', safeId, currentTime, null, null, { title: movie?.title, poster: movie?.poster_path }, duration || undefined);
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

  function togglePlayerFullscreen() {
    const el = playerWrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen().then(
        () => {
          // Hand keyboard focus to the embed once fullscreen engages, so
          // provider shortcuts (e.g. Space = play/pause) work immediately
          // without clicking the video first.
          el.querySelector('iframe')?.focus();
        },
        () => {},
      );
    }
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

  function toggleWatchLater() {
    if (inWL) {
      removeWatchLater('movie', safeId);
      setInWL(false);
      toast?.('Removed from Watch Later');
    } else if (movie) {
      addWatchLater('movie', safeId, movie.title, (movie.release_date || '').slice(0, 4), imageUrl(movie.poster_path));
      setInWL(true);
      toast?.('Added to Watch Later');
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

  const embedUrl = getMovieEmbedUrl(safeId, videoSource, startAt ?? undefined);
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
              {movie.imdb_id ? (
                <a
                  className="badge rating"
                  href={`https://www.imdb.com/title/${movie.imdb_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={imdbRating ? `IMDb ${imdbRating.rating}/10${imdbRating.votes ? ` \u00b7 ${imdbRating.votes} votes` : ''}` : 'Open on IMDb'}
                >
                  IMDb{imdbRating ? ` ${imdbRating.rating}` : ''}
                </a>
              ) : movie.vote_average != null ? (
                <span className="badge rating">TMDB {movie.vote_average.toFixed(1)}</span>
              ) : null}
              {genres && <span className="badge">{genres}</span>}
              {movie.runtime != null && movie.runtime > 0 && (
                <span className="badge">{movie.runtime} min</span>
              )}
              {watched && (
                <span className="badge" title="You have marked this movie as watched">✓ Watched</span>
              )}
            </div>
            <p className="detail-overview">{movie.overview}</p>
            {cast.length > 0 && (
              <div className="detail-cast">
                <strong>Cast:</strong> <PersonList people={cast} />
              </div>
            )}
            {director && (
              <div className="detail-crew"><strong>Director:</strong> <PersonList people={[director]} /></div>
            )}
            {writers.length > 0 && (
              <div className="detail-crew"><strong>Writers:</strong> <PersonList people={writers} /></div>
            )}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="watch-heading">
        <h2 id="watch-heading" className="section-title">Watch Now</h2>
        {showTrailer && trailerKey ? (
          <div className="trailer-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}`}
              title="Trailer"
              allow="autoplay; fullscreen; encrypted-media"
              allowFullScreen
              className="player-iframe"
            />
          </div>
        ) : (
          // startAt restores the last known position when returning from the
          // trailer, instead of restarting the film at 0:00 mid-watch.
          <div ref={playerWrapRef} className="player-fs-wrap">
              <Player
                key={`${startAt !== null ? 'resume' : 'fresh'}-${restartTick}`}
              src={embedUrl}
              title={movie.title}
              onProgress={handleProgress}
              onEnded={handleEnded}
              runtimeMinutes={movie.runtime ?? null}
              startAt={showTrailer && lastTimeRef.current ? lastTimeRef.current : (startAt ?? undefined)}
            />
          </div>
        )}
        <div className={styles.playerBar}>
          <div className={styles.playerBarStart}>
            <button
              type="button"
              className={`${styles.iconBtn} ${watched ? styles.activeWatched : ''}`}
              onClick={toggleWatched}
              title={watched ? 'Unmark as watched' : 'Mark as watched'}
              aria-label={watched ? 'Unmark as watched' : 'Mark as watched'}
              aria-pressed={watched}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4.5 12.5 9.5 17.5 19.5 6.5" /></svg>
            </button>
            <button
              type="button"
              className={`${styles.iconBtn} ${inWL ? styles.activeWatchLater : ''}`}
              onClick={toggleWatchLater}
              title={inWL ? 'Remove from Watch Later' : 'Save to Watch Later'}
              aria-label={inWL ? 'Remove from Watch Later' : 'Save to Watch Later'}
              aria-pressed={inWL}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></svg>
            </button>
            {trailerKey && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setShowTrailer((s) => !s)}
                title={showTrailer ? 'Hide trailer' : 'Play trailer'}
                aria-label={showTrailer ? 'Hide trailer' : 'Play trailer'}
                aria-pressed={showTrailer}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /><path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" /><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>
              </button>
            )}
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => { setStartAt(null); clearProgress('movie', safeId); setRestartTick((t) => t + 1); }}
              title="Restart from the beginning"
              aria-label="Restart from the beginning"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
            </button>
          </div>
          <div className={styles.playerBarEnd}>
            <FilterDropdown
              value={videoSource}
              options={SOURCE_KEYS.map((key: string) => ({ value: key, label: getSourceLabel(key) }))}
              placeholder="Source"
              onSelect={(val: string) => { setVideoSource(val); persistVideoSource(val); }}
              className="source-dropdown"
            />
          </div>
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
