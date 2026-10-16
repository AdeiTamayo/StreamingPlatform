import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getTrending, getPopularMovies, getPopularTV, getMovieGenres, getTVGenres, imageUrl, safeImageUrl } from '../api/tmdb';
import { getOmdbRatingByTitle, peekOmdbRatingByTmdb, type ImdbRating } from '../api/omdb';
import MediaCard from '../components/MediaCard';
import MediaCarousel from '../components/MediaCarousel';
import { getContinueWatching, clearProgress } from '../api/storage';
import { useToast } from '../components/useToast';
import { useAbortController } from '../hooks/useAbortController';
import { useAuth } from '../hooks/useAuth';
import { formatVotes } from '../utils/format';
import type { TMDBMovie, TMDBSeries, TMDBGenre, ContinueWatchingItem } from '../types';
import styles from './Home.module.css';

type TrendingType = 'all' | 'movie' | 'tv';

// A broad set of representative genres, each illustrated with the backdrop of a
// currently-popular title in that genre. Enough of them that the row scrolls.
const MOVIE_GENRE_HIGHLIGHTS: { id: number; name: string }[] = [
  { id: 28, name: 'Action' },
  { id: 12, name: 'Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 14, name: 'Fantasy' },
  { id: 36, name: 'History' },
  { id: 27, name: 'Horror' },
  { id: 10402, name: 'Music' },
  { id: 9648, name: 'Mystery' },
  { id: 10749, name: 'Romance' },
  { id: 878, name: 'Sci-Fi' },
  { id: 53, name: 'Thriller' },
  { id: 10752, name: 'War' },
  { id: 37, name: 'Western' },
];

const TV_GENRE_HIGHLIGHTS: { id: number; name: string }[] = [
  { id: 10759, name: 'Action & Adventure' },
  { id: 16, name: 'Animation' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 99, name: 'Documentary' },
  { id: 18, name: 'Drama' },
  { id: 10751, name: 'Family' },
  { id: 10762, name: 'Kids' },
  { id: 9648, name: 'Mystery' },
  { id: 10764, name: 'Reality' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10766, name: 'Soap' },
  { id: 10768, name: 'War & Politics' },
  { id: 37, name: 'Western' },
];

interface GenreHighlight {
  id: number;
  name: string;
  backdrop: string | null;
  title: string;
}

function buildHighlights(
  pool: (TMDBMovie | TMDBSeries)[],
  defs: { id: number; name: string }[],
): GenreHighlight[] {
  return defs.map((def) => {
    const match = pool.find((item) => (item.genre_ids || []).includes(def.id));
    return {
      id: def.id,
      name: def.name,
      backdrop: match?.backdrop_path ?? null,
      title: match
        ? (match as TMDBMovie).title || (match as TMDBSeries).name || ''
        : '',
    };
  });
}

function CwCard({ item, onRemove, onRestart }: { item: ContinueWatchingItem; onRemove: (item: ContinueWatchingItem) => void; onRestart: (item: ContinueWatchingItem) => void }) {
  const label = (item.meta?.title as string) || `${item.type === 'movie' ? 'Movie' : 'Show'} ${item.id}`;
  const poster = item.meta?.poster as string | undefined;
  const backdrop = (item.meta?.backdrop as string | undefined) || poster;
  const episodeName = item.meta?.episodeName as string | undefined;
  const metaRuntime = (item.meta?.runtime as number) || null;
  const defaultRuntime = item.type === 'movie' ? 7200 : 2700;
  const runtimeSeconds = metaRuntime ? metaRuntime * 60 : defaultRuntime;
  const pct = item.currentTime ? Math.min(99, Math.round((item.currentTime / runtimeSeconds) * 100)) : null;
  const playTo = `/${item.type === 'tv' ? 'tv' : 'movie'}/${item.id}${item.season ? `?season=${item.season}&episode=${item.episode}` : ''}`;
  const typeLabel = item.type === 'tv'
    ? `Series${item.season ? ` \u00b7 S${item.season}E${item.episode}` : ''}`
    : 'Movie';
  return (
    <div className={styles.cwCard}>
      <Link to={playTo} className={styles.cwCardLink}>
        <div className={styles.cwCardBackdrop}>
          {backdrop ? (
            // Progress metadata comes from localStorage, so validate the path.
            <img src={safeImageUrl(backdrop)} alt="" loading="lazy" />
          ) : (
            <div className={styles.cwCardPlaceholder} />
          )}
          <div className={styles.cwCardScrim} />
          <span className={styles.cwCardPlay} aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </div>
        {pct !== null && (
          <div className={styles.cwCardBar}>
            <div className={styles.cwCardBarFill} style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className={styles.cwCardBody}>
          <div className={styles.cwCardTop}>
            <span className={styles.cwCardType}>{typeLabel}</span>
          </div>
          <h3 className={styles.cwCardTitle}>{label}</h3>
          {episodeName && <span className={styles.cwCardSub}>{episodeName}</span>}
        </div>
      </Link>
      <div className={styles.cwCardActions}>
        <Link
          to={playTo}
          className={styles.cwRestart}
          onClick={() => onRestart(item)}
          title="Restart from the beginning"
          aria-label={`Restart ${label} from the beginning`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
        </Link>
        <button className={styles.cwRemove} onClick={() => onRemove(item)} title="Remove from Continue Watching" aria-label={`Remove ${label} from Continue Watching`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [trending, setTrending] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [trendingType, setTrendingType] = useState<TrendingType>('all');
  const [trendingItems, setTrendingItems] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);
  const [movieGenres, setMovieGenres] = useState<TMDBGenre[]>([]);
  const [tvGenres, setTvGenres] = useState<TMDBGenre[]>([]);
  const [movieHighlights, setMovieHighlights] = useState<GenreHighlight[]>(MOVIE_GENRE_HIGHLIGHTS.map((g) => ({ ...g, backdrop: null, title: '' })));
  const [tvHighlights, setTvHighlights] = useState<GenreHighlight[]>(TV_GENRE_HIGHLIGHTS.map((g) => ({ ...g, backdrop: null, title: '' })));
  const [continueWatching, setContinueWatching] = useState<ContinueWatchingItem[]>([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroImdbRating, setHeroImdbRating] = useState<ImdbRating | null>(null);
  const [cwFilter, setCwFilter] = useState<string>('all');
  const [heroPaused, setHeroPaused] = useState(false);
  const toast = useToast();
  const { getSignal } = useAbortController();
  const { isAuthenticated, syncVersion } = useAuth();

  useEffect(() => {
    document.title = 'StreamFlow';
    setContinueWatching(getContinueWatching());
    setLoading(true);
    setError(false);
    const signal = getSignal();
    getTrending('all', 1, signal)
      .then((data) => setTrending((data as { results: (TMDBMovie | TMDBSeries)[] }).results || []))
      .catch(() => {
        setError(true);
        toast?.('Failed to load trending');
      })
      .finally(() => setLoading(false));
    getMovieGenres(signal)
      .then((data) => setMovieGenres((data as { genres?: TMDBGenre[] })?.genres || []))
      .catch(() => {});
    getTVGenres(signal)
      .then((data) => setTvGenres((data as { genres?: TMDBGenre[] })?.genres || []))
      .catch(() => {});
    // A wider pool of popular titles so every genre can borrow a backdrop.
    Promise.all([getPopularMovies(1, signal), getPopularMovies(2, signal), getPopularMovies(3, signal)])
      .then((pages) => {
        const pool = pages.flatMap((data) => (data as { results?: (TMDBMovie | TMDBSeries)[] })?.results || []);
        setMovieHighlights(buildHighlights(pool, MOVIE_GENRE_HIGHLIGHTS));
      })
      .catch(() => {});
    Promise.all([getPopularTV(1, signal), getPopularTV(2, signal), getPopularTV(3, signal)])
      .then((pages) => {
        const pool = pages.flatMap((data) => (data as { results?: (TMDBMovie | TMDBSeries)[] })?.results || []);
        setTvHighlights(buildHighlights(pool, TV_GENRE_HIGHLIGHTS));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setContinueWatching(getContinueWatching());
  }, [isAuthenticated, syncVersion]);

  useEffect(() => {
    if (trending.length < 2 || heroPaused) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % Math.min(trending.length, 8));
    }, 6000);
    return () => clearInterval(timer);
  }, [trending.length, heroPaused]);

  // Trending "all" can include people - they have no detail page, so keep
  // them out of the hero rotation and the grid (MediaCard also guards).
  const playableTrending = trending.filter(
    (item) => (item as unknown as { media_type?: string }).media_type !== "person",
  );
  const heroItems = playableTrending.slice(0, 8);
  const hero = heroItems[heroIdx];
  const heroGenreNames = (hero?.genre_ids || [])
    .map((gid) => (movieGenres.find((g) => g.id === gid) || tvGenres.find((g) => g.id === gid))?.name)
    .filter((name): name is string => !!name)
    .slice(0, 3)
    .join(' \u00b7 ');
  const heroType = (hero as unknown as { media_type?: string } | undefined)?.media_type === 'tv' ? 'TV Series' : 'Movie';
  const heroYear = ((hero as TMDBMovie | undefined)?.release_date || (hero as TMDBSeries | undefined)?.first_air_date || '').slice(0, 4);
  const heroFacts = [heroYear, heroType, heroGenreNames].filter(Boolean).join(' \u00b7 ');

  // IMDb rating for the current hero slide via OMDb, falling back to the
  // TMDB vote average while (or if) no IMDb rating is available.
  useEffect(() => {
    if (!hero) {
      setHeroImdbRating(null);
      return;
    }
    const peek = peekOmdbRatingByTmdb(hero.id);
    if (peek.state !== 'fresh') {
      setHeroImdbRating(peek.rating);
      return;
    }
    const isMovie = !!(hero as TMDBMovie).title;
    const title = isMovie ? (hero as TMDBMovie).title : (hero as TMDBSeries).name;
    const year = isMovie
      ? ((hero as TMDBMovie).release_date || '').slice(0, 4)
      : (hero as TMDBSeries).first_air_date?.slice(0, 4) || '';
    let cancelled = false;
    getOmdbRatingByTitle(hero.id, title, year, isMovie ? 'movie' : 'series').then((r) => {
      if (!cancelled) setHeroImdbRating(r);
    });
    return () => { cancelled = true; };
  }, [hero]);

  // Trending grid: independent of the hero so switching type never disturbs
  // the hero carousel.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setTrendingLoading(true);
    setTrendingError(false);
    (async () => {
      try {
        const data = await getTrending(trendingType, 1, controller.signal) as { results?: (TMDBMovie | TMDBSeries)[] };
        if (!cancelled) setTrendingItems(data.results || []);
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== 'AbortError') setTrendingError(true);
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [trendingType]);

  function handleRemoveCW(item: ContinueWatchingItem) {
    clearProgress(item.type, item.id, item.season ?? undefined, item.episode ?? undefined);
    setContinueWatching(getContinueWatching());
    toast?.('Removed from Continue Watching');
  }

  // Restart clears the saved position without removing anything else; the
  // card links to the same play URL, which now opens fresh from 0:00.
  function handleRestartCW(item: ContinueWatchingItem) {
    clearProgress(item.type, item.id, item.season ?? undefined, item.episode ?? undefined);
    setContinueWatching(getContinueWatching());
    toast?.('Restarting from the beginning');
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

  const TRENDING_TABS: { key: TrendingType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'Series' },
  ];

  return (
    <div className="page">
      <section
        className={styles.hero}
        onMouseEnter={() => setHeroPaused(true)}
        onMouseLeave={() => setHeroPaused(false)}
        onFocus={() => setHeroPaused(true)}
        onBlur={() => setHeroPaused(false)}
        onTouchStart={() => setHeroPaused(true)}
        onTouchEnd={() => setHeroPaused(false)}
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
        <Link to="/search" className={styles.heroSearchBtn} aria-label="Search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Link>
        {hero && !loading && (
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>{(hero as TMDBMovie).title || (hero as TMDBSeries).name}</h1>
            <div className={styles.heroMeta}>
              {heroImdbRating ? (
                <span
                  className="badge rating"
                  title={`IMDb ${heroImdbRating.rating}/10${heroImdbRating.votes ? ` \u00b7 ${heroImdbRating.votes} votes` : ''}${heroImdbRating.tomatoes ? ` \u00b7 Rotten Tomatoes ${heroImdbRating.tomatoes}` : ''}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" /></svg>
                  <span className="rating-source">{heroImdbRating.rating}</span>
                  {heroImdbRating.votes && <span className="rating-votes">({formatVotes(heroImdbRating.votes)})</span>}
                </span>
              ) : hero.vote_average > 0 ? (
                <span className="badge rating" title={`TMDB rating ${hero.vote_average.toFixed(1)}/10`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" /></svg>
                  <span className="rating-source">{hero.vote_average.toFixed(1)}</span>
                </span>
              ) : null}
              {heroFacts && <span className={styles.heroFacts}>{heroFacts}</span>}
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
            <div className={styles.heroDots} aria-label="Featured items">
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  aria-pressed={i === heroIdx}
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
            <div className={styles.cwToggles} aria-label="Filter by type">
              {CW_TABS.map((t) => (
                <button
                  key={t.key}
                  aria-pressed={cwFilter === t.key}
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
                <CwCard key={`${item.type}-${item.id}-${item.episode || ''}-${i}`} item={item} onRemove={handleRemoveCW} onRestart={handleRestartCW} />
              ))}
            </div>
          ) : (
            <div className={styles.cwEmpty}>Nothing in this category</div>
          )}
        </section>
      )}

      <section className="section" aria-labelledby="trending-heading">
        <div className="section-header">
          <h2 id="trending-heading" className="section-title">Trending This Week</h2>
          <div className={styles.cwToggles} aria-label="Filter trending by type">
            {TRENDING_TABS.map((t) => (
              <button
                key={t.key}
                aria-pressed={trendingType === t.key}
                className={`${styles.cwToggle} ${trendingType === t.key ? styles.active : ''}`}
                onClick={() => setTrendingType(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {trendingLoading ? (
          <div className="loading" role="status">Loading...</div>
        ) : (trendingError || error) ? (
          <div className="loading" role="alert">Failed to load trending. Check your connection.</div>
        ) : (
          <div className="media-grid">
            {trendingItems
              .filter((item) => (item as { media_type?: string }).media_type !== 'person')
              .map((item) => (
                <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
              ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="genres-heading">
        <h2 id="genres-heading" className="section-title">Browse by genre</h2>
        <h3 className="sub-section-title">Movies</h3>
        <MediaCarousel className="genre-carousel">
          {movieHighlights.map((g) => (
            <Link
              key={`movie-${g.id}`}
              to={`/movies?genre=${g.id}`}
              className={styles.genreTile}
              style={g.backdrop ? { backgroundImage: `url(${imageUrl(g.backdrop, 'w500')})` } : undefined}
            >
              <span className={styles.genreTileName}>{g.name}</span>
              {g.title && <span className={styles.genreTileExample}>{g.title}</span>}
            </Link>
          ))}
        </MediaCarousel>
        <h3 className="sub-section-title">TV Shows</h3>
        <MediaCarousel className="genre-carousel">
          {tvHighlights.map((g) => (
            <Link
              key={`tv-${g.id}`}
              to={`/tv?genre=${g.id}`}
              className={styles.genreTile}
              style={g.backdrop ? { backgroundImage: `url(${imageUrl(g.backdrop, 'w500')})` } : undefined}
            >
              <span className={styles.genreTileName}>{g.name}</span>
              {g.title && <span className={styles.genreTileExample}>{g.title}</span>}
            </Link>
          ))}
        </MediaCarousel>
      </section>
    </div>
  );
}
