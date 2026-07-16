import { Link } from 'react-router-dom';
import { imageUrl } from '../api/tmdb';
import { isWatched } from '../api/storage';

export default function MediaCard({ item, mediaType }) {
  const type = mediaType || item.media_type || 'movie';
  const id = item.id;
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : '?';
  const poster = imageUrl(item.poster_path);
  const watched = type === 'movie' && isWatched('movie', id);

  return (
    <Link to={`/${type === 'tv' ? 'tv' : 'movie'}/${id}`} className="media-card">
      <div className="media-card-poster">
        <img src={poster} alt={title} loading="lazy" />
        <span className="media-card-rating">{rating}</span>
        {watched && <span className="media-card-watched">Watched</span>}
      </div>
      <div className="media-card-info">
        <h3>{title}</h3>
        {year && <span className="media-card-year">{year}</span>}
      </div>
    </Link>
  );
}
