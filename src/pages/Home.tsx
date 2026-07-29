import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getTrending, imageUrl } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getContinueWatching, clearProgress } from '../api/storage';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import type { TMDBMovie, TMDBSeries, ContinueWatchingItem, TMDBGenre, TMDBCountry, FilterOption } from '../types';
import styles from './Home.module.css';

function CwCard({ item, onRemove }: { item: ContinueWatchingItem; onRemove: (item: ContinueWatchingItem) => void }) {
  const label = (item.meta?.title as string) || `${item.type === 'movie' ? 'Movie' : 'Show'} ${item.id}`;
  const poster = item.meta?.poster as string | undefined;
  const pct = item.currentTime ? Math.min(99, Math.round((item.currentTime / (item.type === 'movie' ? 7200 : 2700)) * 100)) : null;
  return (
    <div className={styles.cwCard}>
      <Link
        to={`/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}${item.season ? `?season=${item.season}&episode=${item.episode}` : ''}`}
        className={styles.cwCardLink}
      >
        <div className={styles.cwCardPoster}>
          {poster ? (
            <img src={imageUrl(poster ?? null)} alt={label} loading="lazy" />
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
      <button className={styles.cwRemove} onClick={() => onRemove(item)} title="Remove">&times;</button>
    </div>
  );
}

export default function Home() {
  const [trending, setTrending] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [cwFilter, setCwFilter] = useState<string>('all');
  const heroRef = useRef<HTMLElement>(null);
  const toast = useToast();
  const { getSignal } = useAbortController();

  useEffect(() => {
    document.title = 'StreamFlow';
    setContinueWatching(getContinueWatching());
    setLoading(true);
    setError(false);
    getTrending('all', 1, getSignal())
      .then((data) => setTrending((data as { results: (TMDBMovie | TMDBSeries)[] }).results || []))
      .catch(() => {
        setError(true);
        toast?.('Failed to load trending');
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (trending.length < 2) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % Math.min(trending.length, 8));
    }, 6000);
    return () => clearInterval(timer);
  }, [trending.length]);

  const heroItems = trending.slice(0, 8);
  const hero = heroItems[heroIdx];

  function handleRemoveCW(item: ContinueWatchingItem) {
    clearProgress(item.type, item.id, item.season ?? undefined, item.episode ?? undefined);
    setContinueWatching(getContinueWatching());
    toast?.('Removed from Continue Watching');
  }

  const filteredCW = continueWatching.filter((item: ContinueWatchingItem) => {
    if (cwFilter === 'all') return true;
    return item.type === cwFilter;
  });

  const cwCounts = useMemo(() => ({
    all: continueWatching.length,
    movie: continueWatching.filter((i: ContinueWatchingItem) => i.type === 'movie').length,
    tv: continueWatching.filter((i: ContinueWatchingItem) => i.type === 'tv').length,
  }), [continueWatching]);

  const CW_TABS: { key: string; label: string }[] = [
    { key: 'all', label: `All (${cwCounts.all})` },
    { key: 'movie', label: `Movies (${cwCounts.movie})` },
    { key: 'tv', label: `Series (${cwCounts.tv})` },
  ];

  return (
    <div className="page">
      <section
        className={styles.hero}
        ref={heroRef}
      >
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
            <span className={styles.heroBadge}>{(hero as unknown as { media_type?: string }).media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
            <h1 className={styles.heroTitle}>{(hero as TMDBMovie).title || (hero as TMDBSeries).name}</h1>
            <div className={styles.heroMeta}>
              {hero.vote_average > 0 && (
                <span className={styles.heroRating}>{hero.vote_average.toFixed(1)}</span>
              )}
              <span className={styles.heroYear}>{((hero as TMDBMovie).release_date || (hero as TMDBSeries).first_air_date || '').slice(0, 4)}</span>
            </div>
            {hero.overview && <p className={styles.heroOverview}>{hero.overview}</p>}
            <div className={styles.heroActions}>
              <Link
                to={`/${(hero as unknown as { media_type?: string }).media_type === 'tv' ? 'tv' : 'movie'}/${hero.id}`}
                className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}
              >
                &#9654; Play
              </Link>
            </div>
            <div className={styles.heroDots} role="tablist" aria-label="Featured items">
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === heroIdx}
                  className={`${styles.heroDot} ${i === heroIdx ? styles.active : ''}`}
                  onClick={() => setHeroIdx(i)}
                  aria-label={`Show item ${i + 1}`}
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
            <div className={styles.cwToggles} role="tablist" aria-label="Filter by type">
              {CW_TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={cwFilter === t.key}
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
              {filteredCW.map((item, i) => (
                <CwCard key={`${item.type}-${item.id}-${item.episode || ''}-${i}`} item={item} onRemove={handleRemoveCW} />
              ))}
            </div>
          ) : (
            <div className="loading" role="status">Nothing in this category</div>
          )}
        </section>
      )}

      <section className="section" aria-labelledby="trending-heading">
        <h2 id="trending-heading" className="section-title">Trending This Week</h2>
        {loading ? (
          <div className="loading" role="status">Loading...</div>
        ) : error ? (
          <div className="loading" role="alert">Failed to load trending. Check your connection.</div>
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
