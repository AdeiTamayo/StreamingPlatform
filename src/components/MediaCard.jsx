import { useState } from 'react';
import { Link } from 'react-router-dom';
import { imageUrl } from '../api/tmdb';
import { isWatched, isInWatchLater, addWatchLater, removeWatchLater } from '../api/storage';

export default function MediaCard({ item, mediaType }) {
  const [loaded, setLoaded] = useState(false);
  const [inWL, setInWL] = useState(() => isInWatchLater(mediaType || item.media_type || 'movie', item.id));
  const type = mediaType || item.media_type || 'movie';
  const id = item.id;
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const poster = imageUrl(item.poster_path);
  const watched = type === 'movie' && isWatched('movie', id);

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
        {loaded && watched && <span className="media-card-watched">Watched</span>}
        {loaded && (
          <button className={`media-card-wl ${inWL ? 'active' : ''}`} onClick={toggleWL} title={inWL ? 'Remove from Watch Later' : 'Add to Watch Later'}>
            {inWL ? '\u2605' : '\u2606'}
          </button>
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
}
