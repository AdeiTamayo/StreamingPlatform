import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { getMovieDetail, imageUrl } from '../api/tmdb';
import { getMovieEmbedUrl, getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { getImdbRating, type ImdbRating } from '../api/omdb';
import { isWatched, markWatched, markUnwatched, markWatching, clearWatching, isInWatchLater, addWatchLater, removeWatchLater, getVideoSource, setVideoSource as persistVideoSource } from '../api/storage';
import Player from '../components/Player';
import MediaCard from '../components/MediaCard';
import FilterDropdown from '../components/FilterDropdown';
import PersonList from '../components/PersonList';
import ViewModeToggle from '../components/ViewModeToggle';
import MediaCarousel from '../components/MediaCarousel';
import Duration from '../components/Duration';
import DetailActions from '../components/DetailActions';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { useAuth } from '../hooks/useAuth';
import { formatVotes } from '../utils/format';
import { isTypingTarget } from '../utils/isTypingTarget';
import type { TMDBMovie, TMDBCastMember, TMDBCrewMember } from '../types';
import styles from './MovieDetail.module.css';

export default function MovieDetail() {
  const { id: rawId } = useParams<{ id: string }>();
  // TMDB ids are numeric - reject anything else up front so a crafted URL
  // can never reach API paths, storage keys, or the embed iframe src.
  const id = rawId && /^\d+$/.test(rawId) ? rawId : undefined;
  const toast = useToast();
  const [movie, setMovie] = useState<TMDBMovie | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'transient' | 'notfound' | null>(null);
  const [watched, setWatched] = useState(false);
  // Bumped on every Restart click so the player remounts from 0:00.
  const [restartTick, setRestartTick] = useState(0);
  const [inWL, setInWL] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [imdbRating, setImdbRating] = useState<ImdbRating | null>(null);
  const [imdbResolved, setImdbResolved] = useState(false);
  const [videoSource, setVideoSource] = useState(getVideoSource());
  const [retryKey, setRetryKey] = useState(0);
  const watchedRef = useRef(false);
  // True once this playback session finished/was marked watched, so stray
  // player ticks can't re-add it to Continue Watching.
  const finishedRef = useRef(false);
  const playerWrapRef = useRef<HTMLDivElement | null>(null);
  // Identifies the latest fetch so a superseded request's handlers (which can
  // resolve after the effect for a new :id has already started) never touch
  // state - without this the previous movie is rendered under the new URL and
  // its .finally wrongly clears the new request's loading flag.
  const requestIdRef = useRef(0);
  const { getSignal } = useAbortController();
  const { isAuthenticated, syncVersion } = useAuth();

  const refreshFromStorage = useCallback(() => {
    if (!id) return;
    setWatched(isWatched('movie', id));
    setInWL(isInWatchLater('movie', id));
    watchedRef.current = isWatched('movie', id);
  }, [id]);

  useEffect(() => {
    refreshFromStorage();
  }, [isAuthenticated, syncVersion, refreshFromStorage]);

  // Keep the ref - read by the progress/auto-watch handlers - in step with the
  // state. Without this, unmarking a watched movie leaves the ref `true`, so
  // progress stops being saved for the rest of the session (and the movie
  // never re-enters Continue Watching).
  useEffect(() => {
    watchedRef.current = watched;
  }, [watched]);

  useEffect(() => {
    if (!id) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    // Never keep the previous item around while the new one loads: the old
    // movie's title/metadata would otherwise be paired with the new id by the
    // shortcut and progress handlers.
    setMovie(null);
    setImdbRating(null);
    setImdbResolved(false);
    refreshFromStorage();
    finishedRef.current = false;
    setTrailerKey(null);
    setShowTrailer(false);
    getMovieDetail(id, getSignal())
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setMovie(data as TMDBMovie);
        const vids = (data as TMDBMovie).videos?.results || [];
        const yt = vids.find((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (yt) setTrailerKey(yt.key);
      })
      .catch((err: Error) => {
        if (err?.name === 'AbortError' || requestId !== requestIdRef.current) return;
        setError(/404/.test(err?.message ?? '') ? 'notfound' : 'transient');
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [id, refreshFromStorage, retryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const imdbId = movie?.imdb_id;
    if (!imdbId) {
      setImdbRating(null);
      return;
    }
    let cancelled = false;
    setImdbResolved(false);
    getImdbRating(imdbId, 'movie').then((r) => {
      if (cancelled) return;
      setImdbRating(r);
      setImdbResolved(true);
    }).catch(() => {
      if (cancelled) return;
      setImdbResolved(true);
    });
    return () => { cancelled = true; };
  }, [movie?.imdb_id]);

  useEffect(() => {
    if (!id || (!loading && error === 'notfound') || (!loading && !error && !movie)) {
      document.title = 'Movie not found - StreamFlow';
    } else if (loading) {
      document.title = 'Loading... - StreamFlow';
    } else if (error) {
      document.title = 'Something went wrong - StreamFlow';
    } else if (movie) {
      document.title = `${movie.title} - StreamFlow`;
    }
  }, [id, loading, error, movie]);

  // Keyboard shortcuts: W = toggle watched, L = toggle Watch Later,
  // F = toggle player fullscreen. Ignored while typing in a field or with
  // modifier keys held.
  useEffect(() => {
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
        setWatched(false);
        toast?.('Removed from watched');
      } else {
        finishedRef.current = true;
        markWatched('movie', id, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
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
    if (!movie || finishedRef.current) return;
    finishedRef.current = true;
    markWatched('movie', safeId, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
    watchedRef.current = true;
    setWatched(true);
  }

  function handleWatching() {
    if (!movie || finishedRef.current) return;
    markWatching('movie', safeId, null, null, { title: movie.title, poster: movie.poster_path, backdrop: movie.backdrop_path });
    // Starting a watched movie is a rewatch: markWatching dropped the watched
    // mark, so keep the header badge in step.
    if (watchedRef.current) {
      watchedRef.current = false;
      setWatched(false);
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
      setWatched(false);
      toast?.('Removed from watched');
    } else {
      finishedRef.current = true;
      markWatched('movie', id, movie.title, null, null, { title: movie.title, poster: movie.poster_path });
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

  function switchMode(next: 'trailer' | 'player') {
    setShowTrailer(next === 'trailer');
  }

  // Re-run the whole load through the fetch effect (metadata, trailer, IMDb,
  // progress refs). A bare re-fetch here used to leave the trailer control and
  // other derived state missing after a successful retry.
  function retry() {
    setRetryKey((k) => k + 1);
  }

  if (loading) return <div className="page"><div className="loading" role="status">Loading...</div></div>;

  if (error === 'notfound') return (
    <div className="page" role="alert">
      <div className="loading">Movie not found</div>
    </div>
  );

  if (error) return (
    <div className="page" role="alert">
      <div className="loading">Something went wrong. Check your connection.</div>
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
  const genres = movie.genres?.slice(0, 3).map((g) => g.name).join(', ') || '';
  const recommendations = movie.recommendations?.results?.slice(0, 24) || [];

  // Secondary facts render as a single bullet-separated line (hero style)
  // instead of individual pill badges.
  const metaNodes: ReactNode[] = [];
  const addMeta = (key: string, node: ReactNode, title?: string) => {
    if (metaNodes.length > 0) {
      metaNodes.push(<span key={`sep-${key}`} className="detail-meta-sep" aria-hidden="true">{'\u00b7'}</span>);
    }
    metaNodes.push(<span key={key} className="detail-meta-item" title={title}>{node}</span>);
  };
  if (genres) addMeta('genres', genres);
  if (movie.runtime != null && movie.runtime > 0) addMeta('runtime', <Duration minutes={movie.runtime} />);
  if (watched) addMeta('watched', '\u2713 Watched', 'You have marked this movie as watched');

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
              {movie.imdb_id && imdbRating ? (
                <a
                  className={`${styles.detailRating} badge rating rating-imdb`}
                  href={`https://www.imdb.com/title/${movie.imdb_id}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`IMDb ${imdbRating.rating}/10${imdbRating.votes ? ` \u00b7 ${imdbRating.votes} votes` : ''}${imdbRating.tomatoes ? ` \u00b7 Rotten Tomatoes ${imdbRating.tomatoes}` : ''}`}
                  aria-label={`IMDb rating ${imdbRating.rating} out of 10${imdbRating.votes ? `, ${imdbRating.votes} votes` : ''}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" /></svg>
                  <span className="rating-source">{imdbRating.rating}</span>
                  {imdbRating.votes && <span className="rating-votes">({formatVotes(imdbRating.votes)})</span>}
                </a>
              ) : (!movie.imdb_id || imdbResolved) && movie.vote_average > 0 ? (
                <span
                  className={`${styles.detailRating} badge rating rating-tmdb`}
                  title={`TMDB rating ${movie.vote_average.toFixed(1)}/10${movie.vote_count ? ` \u00b7 ${formatVotes(String(movie.vote_count))} votes` : ''}`}
                  aria-label={`TMDB rating ${movie.vote_average.toFixed(1)} out of 10${movie.vote_count ? `, ${movie.vote_count} votes` : ''}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" /></svg>
                  <span className="rating-source">{movie.vote_average.toFixed(1)}</span>
                  {movie.vote_count > 0 && <span className="rating-votes">({formatVotes(String(movie.vote_count))})</span>}
                </span>
              ) : null}
              {metaNodes.length > 0 && (
                <span className="detail-meta-line">{metaNodes}</span>
              )}
            </div>
            <div className={styles.headerActions}>
              <DetailActions
                inList={inWL}
                watched={watched}
                onToggleList={toggleWatchLater}
                onToggleWatched={toggleWatched}
                shareTitle={movie.title}
              />
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
        <div className="section-header">
          <h2 id="watch-heading" className="section-title">Watch Now</h2>
          {trailerKey && (
            <ViewModeToggle mode={showTrailer ? 'trailer' : 'player'} onChange={switchMode} />
          )}
        </div>
        <div
          id="watch-panel"
          role={trailerKey ? 'tabpanel' : undefined}
          aria-labelledby={trailerKey ? 'watch-heading' : undefined}
        >
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
            <div ref={playerWrapRef} className="player-fs-wrap">
              <Player
                key={restartTick}
                src={embedUrl}
                title={movie.title}
                onWatching={handleWatching}
                onEnded={handleEnded}
                runtimeMinutes={movie.runtime ?? null}
              />
            </div>
          )}
        </div>
        {!showTrailer && (
          <div className={styles.playerBar}>
            <div className={styles.playerBarStart}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => { finishedRef.current = false; clearWatching('movie', safeId); setRestartTick((t) => t + 1); }}
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
        )}
      </section>

      {recommendations.length > 0 && (
        <section className="section" aria-labelledby="recs-heading">
          <h2 id="recs-heading" className="section-title">You might also like</h2>
          <MediaCarousel>
            {recommendations.map((item) => (
              <MediaCard key={(item as { id: number }).id} item={item as TMDBMovie} mediaType="movie" />
            ))}
          </MediaCarousel>
        </section>
      )}
    </div>
  );
}
