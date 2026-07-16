import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getLastSeen } from '../api/storage';
import { imageUrl } from '../api/tmdb';

export default function LastSeen() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems(getLastSeen());
  }, []);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <h2 className="section-title">Last Seen</h2>
        {items.length === 0 ? (
          <div className="loading">No activity yet</div>
        ) : (
          <div className="last-seen-list">
            {items.map((item, i) => {
              const isMovie = item.type === 'movie' || item.storageKey?.startsWith('progress:movie');
              const id = item.id;
              const label = item.title || (item.storageKey || '');
              return (
                <Link key={item.storageKey || i} to={`/${isMovie ? 'movie' : 'tv'}/${id}`} className="last-seen-item">
                  <span className="ls-label">{label}</span>
                  <span className="ls-meta">{isMovie ? 'Movie' : 'Episode'}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
