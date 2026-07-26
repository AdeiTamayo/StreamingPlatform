import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTrending, imageUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getContinueWatching, clearProgress } from '../api/storage';
import { useToast } from '../components/useToast';
import styles from './Home.module.css';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [continueWatching, setContinueWatching] = useState([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [cwFilter, setCwFilter] = useState('all');
  const toast = useToast();

  useEffect(() => {
    document.title = 'StreamFlow';
    setContinueWatching(getContinueWatching());
    getTrending('all')
      .then((data) => setTrending(data.results || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (trending.length < 2) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % Math.min(trending.length, 8));
    }, 6000);
    return () => clearInterval(timer);
  }, [trending.length]);

  const heroItems = trending.slice(0, 8);
  const hero = heroItems[heroIdx];

  useEffect(() => {
    if (!hero?.backdrop_path && !hero?.poster_path) return;
    const url = imageUrl(hero.backdrop_path || hero.poster_path, 'original');
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = url;
    document.head.appendChild(link);
    return () => link.remove();
  }, [hero?.id, hero?.backdrop_path, hero?.poster_path]);

  function handleRemoveCW(item) {
    clearProgress(item.type, item.id, item.season, item.episode);
    setContinueWatching(getContinueWatching());
    toast('Removed from Continue Watching');
  }

  const filteredCW = continueWatching.filter((item) => {
    if (cwFilter === 'all') return true;
    return item.type === cwFilter;
  });

  const cwCounts = {
    all: continueWatching.length,
    movie: continueWatching.filter((i) => i.type === 'movie').length,
    tv: continueWatching.filter((i) => i.type === 'tv').length,
  };

  const CW_TABS = [
    { key: 'all', label: `All (${cwCounts.all})` },
    { key: 'movie', label: `Movies (${cwCounts.movie})` },
    { key: 'tv', label: `Series (${cwCounts.tv})` },
  ];

  return (
    <div className="page">
      <section className={styles.hero}>
        <div className={styles.heroBackdrop}>
          {hero ? (
            <>
              <img
                src={imageUrl(hero.backdrop_path || hero.poster_path, 'original')}
                alt=""
                key={hero.id}
                fetchPriority="high"
                width="1920"
                height="1080"
              />
              <div className={styles.heroGradient} />
            </>
          ) : (
            <div className={styles.heroPlaceholder} />
          )}
        </div>
        {hero && (
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>{hero.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
            <h1 className={styles.heroTitle}>{hero.title || hero.name}</h1>
            <div className={styles.heroMeta}>
              {hero.vote_average > 0 && (
                <span className={styles.heroRating}>{hero.vote_average.toFixed(1)}</span>
              )}
              <span className={styles.heroYear}>{(hero.release_date || hero.first_air_date || '').slice(0, 4)}</span>
            </div>
            {hero.overview && <p className={styles.heroOverview}>{hero.overview}</p>}
            <div className={styles.heroActions}>
              <Link
                to={`/${hero.media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`}
                className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}
              >
                &#9654; Play
              </Link>
            </div>
            <div className={styles.heroDots}>
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.heroDot} ${i === heroIdx ? styles.active : ''}`}
                  onClick={() => setHeroIdx(i)}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {continueWatching.length > 0 && (
        <section className="section">
          <div className="section-header">
            <h2 className="section-title">Continue Watching</h2>
            <div className={styles.cwToggles}>
              {CW_TABS.map((t) => (
                <button
                  key={t.key}
                  className={`${styles.cwToggle} ${cwFilter === t.key ? styles.active : ''}`}
                  onClick={() => setCwFilter(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {filteredCW.length > 0 ? (
            <div className={styles.cwGrid}>
              {filteredCW.map((item, i) => {
              const label = item.meta?.title || `${item.type === 'movie' ? 'Movie' : 'Show'} ${item.id}`;
              const poster = item.meta?.poster;
              const pct = item.currentTime ? Math.min(99, Math.round((item.currentTime / (item.type === 'movie' ? 7200 : 2700)) * 100)) : null;
              return (
                <div key={`${item.type}-${item.id}-${item.episode || ''}-${i}`} className={styles.cwCard}>
                  <Link
                    to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}${item.season ? `?season=${item.season}&episode=${item.episode}` : ''}`}
                    className={styles.cwCardLink}
                  >
                    <div className={styles.cwCardPoster}>
                      {poster ? (
                        <img src={imageUrl(poster)} alt={label} loading="lazy" />
                      ) : (
                        <div className={styles.cwCardPlaceholder} />
                      )}
                      {pct !== null && (
                        <div className={styles.cwCardBar}>
                          <div className={styles.cwCardBarFill} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className={styles.cwCardInfo}>
                      <span className={styles.cwCardLabel}>{label}</span>
                      {item.season && <span className={styles.cwCardMeta}>S{item.season}E{item.episode}</span>}
                    </div>
                  </Link>
                  <button className={styles.cwRemove} onClick={() => handleRemoveCW(item)} title="Remove">&times;</button>
                </div>
              );
            })}
            </div>
          ) : (
            <div className="loading">Nothing in this category</div>
          )}
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
