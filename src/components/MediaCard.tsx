import { useState, useEffect, memo } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../api/tmdb';
import { isWatched, markWatched, markUnwatched, isInWatchLater, addWatchLater, removeWatchLater, clearProgress } from '../api/storage';
import { useTVStatus } from '../hooks/useTVStatus';
import { useAuth } from '../hooks/useAuth';
import type { TMDBMovie, TMDBSeries, MediaType } from '../types';

interface MediaCardProps {
  item: TMDBMovie | TMDBSeries;
  mediaType?: MediaType;
}

const MediaCard = memo(function MediaCard({ item, mediaType }: MediaCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const isMovie = !!(item as TMDBMovie).title;
  const inferredType: MediaType = mediaType || ((item as unknown as Record<string, string>).media_type as MediaType) || (isMovie ? 'movie' : 'tv');
  const [inWL, setInWL] = useState(() => isInWatchLater(inferredType, item.id));
  const [isWatchedState, setIsWatchedState] = useState(() => isWatched(inferredType, item.id));
  const { isAuthenticated, syncVersion } = useAuth();
  const type = inferredType;
  const id = item.id;

  useEffect(() => {
    setInWL(isInWatchLater(type, id));
    setIsWatchedState(isWatched(type, id));
  }, [isAuthenticated, syncVersion, type, id]);
  const title = (item as TMDBMovie).title || (item as TMDBSeries).name || '';
  const series = item as TMDBSeries;
  const year = isMovie
    ? ((item as TMDBMovie).release_date || '').slice(0, 4)
    : series.first_air_date?.slice(0, 4) || '';
  const tvStatus = useTVStatus(isMovie ? 0 : id);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const poster = imageUrl(item.poster_path);
  const posterSrc = imgError ? imageUrl(null) : poster;

  function toggleWL(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (inWL) {
      removeWatchLater(type, id);
      setInWL(false);
    } else {
      addWatchLater(type, id, title, year, poster);
      setInWL(true);
    }
  }

  function toggleWatched(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isWatchedState) {
      markUnwatched(type, id);
      setIsWatchedState(false);
    } else {
      markWatched(type, id, title, null, null, { title, poster: item.poster_path, source: 'explicit' });
      clearProgress(type, id);
      setIsWatchedState(true);
    }
  }

  return (
    <div className="media-card">
      <Link to={`/${type === 'tv' ? 'tv' : 'movie'}/${id}`} className="media-card-link">
        <div className="media-card-poster">
          {!loaded && <div className="media-card-skeleton" />}
          <img
            src={posterSrc}
            alt={title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
          {loaded && <span className="media-card-rating">{rating}</span>}
          {loaded && <span className={`media-card-type ${type}`}>{type === 'tv' ? 'TV' : 'Movie'}</span>}
        </div>
        <div className="media-card-info">
          {!loaded ? (
            <>
              <div className="skeleton-text skeleton-title" />
              <div className="skeleton-text skeleton-year" />
            </>
          ) : (
            <>
              <h3>{title}</h3>
              {year && <span className="media-card-year">{tvStatus?.ended && tvStatus.endYear ? `${year}-${tvStatus.endYear}` : year}</span>}
            </>
          )}
        </div>
      </Link>
      {loaded && (
        <div className="media-card-actions">
          <button className={`media-card-wl ${inWL ? 'active' : ''}`} onClick={toggleWL} title={inWL ? 'Remove from Watch Later' : 'Add to Watch Later'}>
            {inWL ? '\u2605' : '\u2606'}
          </button>
          <button className={`media-card-watched-btn ${isWatchedState ? 'active' : ''}`} onClick={toggleWatched} title={isWatchedState ? 'Unmark watched' : (isMovie ? 'Mark as seen' : 'Mark series as seen')}>
            {isWatchedState ? '\u2713' : '+'}
          </button>
        </div>
      )}
    </div>
  );
});

export default MediaCard;
