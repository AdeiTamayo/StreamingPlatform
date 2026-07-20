import { useState, memo } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../api/tmdb';
import { isWatched, markWatched, markUnwatched, isInWatchLater, addWatchLater, removeWatchLater } from '../api/storage';

const MediaCard = memo(function MediaCard({ item, mediaType }) {
  const [loaded, setLoaded] = useState(false);
  const [inWL, setInWL] = useState(() => isInWatchLater(mediaType || item.media_type || 'movie', item.id));
  const [isWatchedState, setIsWatchedState] = useState(() => isWatched(mediaType || item.media_type || 'movie', item.id));
  const type = mediaType || item.media_type || 'movie';
  const id = item.id;
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const poster = imageUrl(item.poster_path);

  function toggleWL(e) {
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

  function toggleWatched(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isWatchedState) {
      markUnwatched(type, id);
      setIsWatchedState(false);
    } else {
      markWatched(type, id, title, null, null, { title, poster: item.poster_path });
      setIsWatchedState(true);
    }
  }

  return (
    <Link to={`/${type === 'tv' ? 'tv' : 'movie'}/${id}`} className="media-card">
      <div className="media-card-poster">
        {!loaded && <div className="media-card-skeleton" />}
        <img
          src={poster}
          alt={title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          style={{ opacity: loaded ? 1 : 0 }}
        />
        {loaded && <span className="media-card-rating">{rating}</span>}
        {loaded && <span className={`media-card-type ${type}`}>{type === 'tv' ? 'TV' : 'Movie'}</span>}
        {loaded && (
          <div className="media-card-actions">
            <button className={`media-card-wl ${inWL ? 'active' : ''}`} onClick={toggleWL} title={inWL ? 'Remove from Watch Later' : 'Add to Watch Later'}>
              {inWL ? '\u2605' : '\u2606'}
            </button>
            <button className={`media-card-watched-btn ${isWatchedState ? 'active' : ''}`} onClick={toggleWatched} title={isWatchedState ? 'Unmark watched' : 'Mark as watched'}>
              {isWatchedState ? '\u2713' : '+'}
            </button>
          </div>
        )}
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
            {year && <span className="media-card-year">{year}</span>}
          </>
        )}
      </div>
    </Link>
  );
});

export default MediaCard;
