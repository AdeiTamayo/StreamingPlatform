import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTrending, imageUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getContinueWatching, getProgress } from '../api/storage';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [continueWatching, setContinueWatching] = useState([]);

  useEffect(() => {
    document.title = 'StreamFlow';
    setContinueWatching(getContinueWatching());
    getTrending('all')
      .then((data) => setTrending(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      {continueWatching.length > 0 && (
        <section className="section">
          <h2 className="section-title">Continue Watching</h2>
          <div className="cw-grid">
            {continueWatching.map((item, i) => {
              const label = item.meta?.title || `${item.type === 'movie' ? 'Movie' : 'Show'} ${item.id}`;
              const poster = item.meta?.poster;
              const prog = getProgress(item.type, item.id, item.season, item.episode);
              const pct = prog?.currentTime ? Math.min(99, Math.round((prog.currentTime / (item.type === 'movie' ? 7200 : 2700)) * 100)) : null;
              return (
                <Link
                  key={`${item.type}-${item.id}-${item.episode || ''}-${i}`}
                  to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}${item.season ? `?season=${item.season}&episode=${item.episode}` : ''}`}
                  className="cw-card"
                >
                  <div className="cw-card-poster">
                    {poster ? (
                      <img src={imageUrl(poster)} alt={label} loading="lazy" />
                    ) : (
                      <div className="cw-card-placeholder" />
                    )}
                    {pct !== null && (
                      <div className="cw-card-bar">
                        <div className="cw-card-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="cw-card-info">
                    <span className="cw-card-label">{label}</span>
                    {item.season && <span className="cw-card-meta">S{item.season}E{item.episode}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Trending This Week</h2>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <div className="media-grid">
            {trending.map((item) => (
              <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
