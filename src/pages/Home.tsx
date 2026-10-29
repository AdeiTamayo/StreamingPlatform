import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getTrending,
  getPopularMovies,
  getPopularTV,
  getMovieGenres,
  getTVGenres,
  imageUrl,
  safeImageUrl,
} from "../api/tmdb";
import {
  getOmdbRatingByTitle,
  peekOmdbRatingByTmdb,
  type ImdbRating,
} from "../api/omdb";
import MediaCard from "../components/MediaCard";
import MediaCarousel from "../components/MediaCarousel";
import CollectionSkeleton from "../components/CollectionSkeleton";
import { getContinueWatching, clearWatching } from "../api/storage";
import { useToast } from "../components/useToast";
import { useAbortController } from "../hooks/useAbortController";
import { useAuth } from "../hooks/useAuth";
import { usePageTitle } from "../i18n/usePageTitle";
import { formatRatingTitle, formatVotes } from "../utils/format";
import type {
  TMDBMovie,
  TMDBSeries,
  TMDBGenre,
  ContinueWatchingItem,
} from "../types";
import styles from "./Home.module.css";

type TrendingType = "all" | "movie" | "tv";

// A broad set of representative genres, each illustrated with the backdrop of a
// currently-popular title in that genre. Enough of them that the row scrolls.
// `key` is the i18n key under `genres.*` (the displayed name is translated).
const MOVIE_GENRE_HIGHLIGHTS: { id: number; key: string }[] = [
  { id: 28, key: "action" },
  { id: 12, key: "adventure" },
  { id: 16, key: "animation" },
  { id: 35, key: "comedy" },
  { id: 80, key: "crime" },
  { id: 99, key: "documentary" },
  { id: 18, key: "drama" },
  { id: 10751, key: "family" },
  { id: 14, key: "fantasy" },
  { id: 36, key: "history" },
  { id: 27, key: "horror" },
  { id: 10402, key: "music" },
  { id: 9648, key: "mystery" },
  { id: 10749, key: "romance" },
  { id: 878, key: "sciFi" },
  { id: 53, key: "thriller" },
  { id: 10752, key: "war" },
  { id: 37, key: "western" },
];

const TV_GENRE_HIGHLIGHTS: { id: number; key: string }[] = [
  { id: 10759, key: "actionAdventure" },
  { id: 16, key: "animation" },
  { id: 35, key: "comedy" },
  { id: 80, key: "crime" },
  { id: 99, key: "documentary" },
  { id: 18, key: "drama" },
  { id: 10751, key: "family" },
  { id: 10762, key: "kids" },
  { id: 9648, key: "mystery" },
  { id: 10764, key: "reality" },
  { id: 10765, key: "sciFiFantasy" },
  { id: 10766, key: "soap" },
  { id: 10768, key: "warPolitics" },
  { id: 37, key: "western" },
];

interface GenreHighlight {
  id: number;
  key: string;
  backdrop: string | null;
  title: string;
}

function buildHighlights(
  pool: (TMDBMovie | TMDBSeries)[],
  defs: { id: number; key: string }[],
): GenreHighlight[] {
  return defs.map((def) => {
    const match = pool.find((item) => (item.genre_ids || []).includes(def.id));
    return {
      id: def.id,
      key: def.key,
      backdrop: match?.backdrop_path ?? null,
      title: match
        ? (match as TMDBMovie).title || (match as TMDBSeries).name || ""
        : "",
    };
  });
}

function GenreCarousel({
  highlights,
  to,
  headingId,
  label,
}: {
  highlights: GenreHighlight[];
  to: string;
  headingId: string;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <MediaCarousel
      className="genre-carousel"
      label={label}
      labelledBy={headingId}
    >
      {highlights.map((g) => (
        <Link
          key={`${to}-${g.id}`}
          to={`${to}?genre=${g.id}`}
          className={styles.genreTile}
          style={
            g.backdrop
              ? { backgroundImage: `url(${imageUrl(g.backdrop, "w500")})` }
              : undefined
          }
        >
          <span className={styles.genreTileName}>{t(`genres.${g.key}`)}</span>
          {g.title && (
            <span className={styles.genreTileExample}>{g.title}</span>
          )}
        </Link>
      ))}
    </MediaCarousel>
  );
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function CwCard({
  item,
  onRemove,
  onRestart,
}: {
  item: ContinueWatchingItem;
  onRemove: (item: ContinueWatchingItem) => void;
  onRestart: (item: ContinueWatchingItem) => void;
}) {
  const { t } = useTranslation();
  const label =
    (item.meta?.title as string) ||
    (item.type === "movie"
      ? t("home.movieFallback", { id: item.id })
      : t("home.showFallback", { id: item.id }));
  const poster = item.meta?.poster as string | undefined;
  const backdrop = (item.meta?.backdrop as string | undefined) || poster;
  const episodeName = item.meta?.episodeName as string | undefined;
  const playTo = `/${item.type === "tv" ? "tv" : "movie"}/${item.id}${item.season ? `?season=${item.season}&episode=${item.episode}` : ""}`;
  const typeLabel =
    item.type === "tv"
      ? item.season
        ? t("home.seriesWithEpisode", {
            season: item.season,
            episode: item.episode,
          })
        : t("media.series")
      : t("media.movie");
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
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </div>
        <div className={styles.cwCardBody}>
          <div className={styles.cwCardTop}>
            <span className={styles.cwCardType}>{typeLabel}</span>
          </div>
          <h3 className={styles.cwCardTitle}>{label}</h3>
          {episodeName && (
            <span className={styles.cwCardSub}>{episodeName}</span>
          )}
        </div>
      </Link>
      <div className={styles.cwCardActions}>
        <Link
          to={playTo}
          className={styles.cwRestart}
          onClick={() => onRestart(item)}
          title={t("home.restartTitle")}
          aria-label={t("home.restartLabel", { title: label })}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </Link>
        <button
          type="button"
          className={styles.cwRemove}
          onClick={() => onRemove(item)}
          title={t("home.removeCwTitle")}
          aria-label={t("home.removeCwLabel", { title: label })}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const { t } = useTranslation();
  const [trending, setTrending] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [trendingType, setTrendingType] = useState<TrendingType>("all");
  const [movieGenres, setMovieGenres] = useState<TMDBGenre[]>([]);
  const [tvGenres, setTvGenres] = useState<TMDBGenre[]>([]);
  const [movieHighlights, setMovieHighlights] = useState<GenreHighlight[]>(
    MOVIE_GENRE_HIGHLIGHTS.map((g) => ({ ...g, backdrop: null, title: "" })),
  );
  const [tvHighlights, setTvHighlights] = useState<GenreHighlight[]>(
    TV_GENRE_HIGHLIGHTS.map((g) => ({ ...g, backdrop: null, title: "" })),
  );
  const [continueWatching, setContinueWatching] = useState<
    ContinueWatchingItem[]
  >([]);
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroImdbRating, setHeroImdbRating] = useState<ImdbRating | null>(null);
  const [cwFilter, setCwFilter] = useState<string>("all");
  const [heroPaused, setHeroPaused] = useState(false);
  const toast = useToast();
  const { getSignal } = useAbortController();
  const { isAuthenticated, syncVersion } = useAuth();
  usePageTitle(t("home.title"));

  useEffect(() => {
    setContinueWatching(getContinueWatching());
    const signal = getSignal();
    getMovieGenres(signal)
      .then((data) =>
        setMovieGenres((data as { genres?: TMDBGenre[] })?.genres || []),
      )
      .catch(() => {});
    getTVGenres(signal)
      .then((data) =>
        setTvGenres((data as { genres?: TMDBGenre[] })?.genres || []),
      )
      .catch(() => {});
    // A wider pool of popular titles so every genre can borrow a backdrop.
    Promise.all([
      getPopularMovies(1, signal),
      getPopularMovies(2, signal),
      getPopularMovies(3, signal),
    ])
      .then((pages) => {
        const pool = pages.flatMap(
          (data) =>
            (data as { results?: (TMDBMovie | TMDBSeries)[] })?.results || [],
        );
        setMovieHighlights(buildHighlights(pool, MOVIE_GENRE_HIGHLIGHTS));
      })
      .catch(() => {});
    Promise.all([
      getPopularTV(1, signal),
      getPopularTV(2, signal),
      getPopularTV(3, signal),
    ])
      .then((pages) => {
        const pool = pages.flatMap(
          (data) =>
            (data as { results?: (TMDBMovie | TMDBSeries)[] })?.results || [],
        );
        setTvHighlights(buildHighlights(pool, TV_GENRE_HIGHLIGHTS));
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setContinueWatching(getContinueWatching());
  }, [isAuthenticated, syncVersion]);

  // Trending "all" can include people - they have no detail page, so keep
  // them out of the hero rotation and the grid (MediaCard also guards).
  const playableTrending = trending.filter(
    (item) =>
      (item as unknown as { media_type?: string }).media_type !== "person",
  );
  const heroItems = playableTrending.slice(0, 8);
  // The stored index can outlive a shrink of the list (e.g. type switches),
  // so clamp before reading - otherwise the hero renders blank.
  const activeHeroIdx = heroItems.length > 0 ? heroIdx % heroItems.length : 0;
  const hero = heroItems[activeHeroIdx];

  // Rotate over the hero's actual slides. The modulus must be the playable
  // list length: using raw `trending.length` walked past the filtered list
  // (people removed) and blanked the hero for a full 6s tick.
  useEffect(() => {
    if (heroItems.length < 2 || heroPaused || prefersReducedMotion()) return;
    const timer = setInterval(() => {
      setHeroIdx((i) => (i + 1) % heroItems.length);
    }, 6000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroItems.length, heroPaused]);
  const heroGenreNames = (hero?.genre_ids || [])
    .map(
      (gid) =>
        (
          movieGenres.find((g) => g.id === gid) ||
          tvGenres.find((g) => g.id === gid)
        )?.name,
    )
    .filter((name): name is string => !!name)
    .slice(0, 3)
    .join(" · ");
  const heroType =
    (hero as unknown as { media_type?: string } | undefined)?.media_type ===
    "tv"
      ? t("media.tvSeries")
      : t("media.movie");
  const heroYear = (
    (hero as TMDBMovie | undefined)?.release_date ||
    (hero as TMDBSeries | undefined)?.first_air_date ||
    ""
  ).slice(0, 4);
  const heroFacts = [heroYear, heroType, heroGenreNames]
    .filter(Boolean)
    .join(" · ");

  // IMDb rating for the current hero slide via OMDb, falling back to the
  // TMDB vote average while (or if) no IMDb rating is available. The rating is
  // cleared before each lookup so a previous slide's value can never linger.
  useEffect(() => {
    if (!hero) {
      setHeroImdbRating(null);
      return;
    }
    setHeroImdbRating(null);
    const peek = peekOmdbRatingByTmdb(hero.id);
    if (peek.state !== "fresh") {
      setHeroImdbRating(peek.rating);
      return;
    }
    const isMovie = !!(hero as TMDBMovie).title;
    const title = isMovie
      ? (hero as TMDBMovie).title
      : (hero as TMDBSeries).name;
    const year = isMovie
      ? ((hero as TMDBMovie).release_date || "").slice(0, 4)
      : (hero as TMDBSeries).first_air_date?.slice(0, 4) || "";
    let cancelled = false;
    getOmdbRatingByTitle(hero.id, title, year, isMovie ? "movie" : "series")
      .then((r) => {
        if (!cancelled) setHeroImdbRating(r);
      })
      .catch(() => {
        if (!cancelled) setHeroImdbRating(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hero]);

  // Single source for trending: the same results feed the hero rotation and
  // the grid, so switching type never duplicates a request or splits the
  // error/loading state in two.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const data = (await getTrending(
          trendingType,
          1,
          controller.signal,
        )) as { results?: (TMDBMovie | TMDBSeries)[] };
        if (!cancelled) setTrending(data.results || []);
      } catch (err) {
        // Aborts (unmount or a re-fetch replacing this one) are not user-
        // visible failures - the page is gone or a newer request owns state.
        if (cancelled || (err as Error)?.name === "AbortError") return;
        setError(true);
        toast?.(t("home.toastTrendingFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendingType]);

  function handleRemoveCW(item: ContinueWatchingItem) {
    clearWatching(
      item.type,
      item.id,
      item.season ?? undefined,
      item.episode ?? undefined,
    );
    setContinueWatching(getContinueWatching());
    toast?.(t("home.toastRemovedCw"));
  }

  // Drops the "being watched" flag so the card leaves the row; playback
  // always starts from the beginning anyway.
  function handleRestartCW(item: ContinueWatchingItem) {
    clearWatching(
      item.type,
      item.id,
      item.season ?? undefined,
      item.episode ?? undefined,
    );
    setContinueWatching(getContinueWatching());
    toast?.(t("home.toastRestarting"));
  }

  const filteredCW = continueWatching.filter((item: ContinueWatchingItem) => {
    if (cwFilter === "all") return true;
    return item.type === cwFilter;
  });

  const cwCounts = useMemo(
    () => ({
      all: continueWatching.length,
      movie: continueWatching.filter(
        (i: ContinueWatchingItem) => i.type === "movie",
      ).length,
      tv: continueWatching.filter((i: ContinueWatchingItem) => i.type === "tv")
        .length,
    }),
    [continueWatching],
  );

  const CW_TABS: { key: string; label: string }[] = [
    { key: "all", label: t("home.allCount", { count: cwCounts.all }) },
    { key: "movie", label: t("home.moviesCount", { count: cwCounts.movie }) },
    { key: "tv", label: t("home.seriesCount", { count: cwCounts.tv }) },
  ];

  const TRENDING_TABS: { key: TrendingType; label: string }[] = [
    { key: "all", label: t("home.all") },
    { key: "movie", label: t("home.movies") },
    { key: "tv", label: t("home.series") },
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
                src={imageUrl(
                  hero.backdrop_path || hero.poster_path,
                  "original",
                )}
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
        <Link
          to="/search"
          className={styles.heroSearchBtn}
          aria-label={t("home.search")}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </Link>
        {hero && !loading && (
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              {(hero as TMDBMovie).title || (hero as TMDBSeries).name}
            </h1>
            <div className={styles.heroMeta}>
              {heroImdbRating ? (
                <span
                  className={`badge rating rating-imdb ${styles.heroRating}`}
                  title={formatRatingTitle(t, {
                    imdbRating: heroImdbRating.rating,
                    imdbVotes:
                      heroImdbRating.votes ||
                      (hero.vote_count > 0
                        ? formatVotes(String(hero.vote_count))
                        : null),
                    tomatoes: heroImdbRating.tomatoes,
                  })}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
                  </svg>
                  <span className="rating-source">{heroImdbRating.rating}</span>
                  {(heroImdbRating.votes || hero.vote_count > 0) && (
                    <span className="rating-votes">
                      (
                      {heroImdbRating.votes
                        ? formatVotes(heroImdbRating.votes)
                        : formatVotes(String(hero.vote_count))}
                      )
                    </span>
                  )}
                </span>
              ) : hero.vote_average > 0 ? (
                <span
                  className={`badge rating rating-tmdb ${styles.heroRating}`}
                  title={formatRatingTitle(t, {
                    tmdbRating: hero.vote_average.toFixed(1),
                    imdbVotes: hero.vote_count ? String(hero.vote_count) : null,
                  })}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 2.5l2.9 6.06 6.6.8-4.87 4.5 1.27 6.54L12 17.9l-5.9 3.5 1.27-6.54L2.5 9.36l6.6-.8z" />
                  </svg>
                  <span className="rating-source">
                    {hero.vote_average.toFixed(1)}
                  </span>
                  {!!hero.vote_count && (
                    <span className="rating-votes">
                      ({formatVotes(String(hero.vote_count))})
                    </span>
                  )}
                </span>
              ) : null}
              {heroFacts && (
                <span className={styles.heroFacts}>{heroFacts}</span>
              )}
            </div>
            {hero.overview && (
              <p className={styles.heroOverview}>{hero.overview}</p>
            )}
            <div className={styles.heroActions}>
              <Link
                to={`/${(hero as unknown as { media_type?: string }).media_type === "tv" ? "tv" : "movie"}/${hero.id}`}
                className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}
              >
                &#9654; {t("home.play")}
              </Link>
            </div>
            <div
              className={styles.heroDots}
              role="group"
              aria-label={t("home.featuredItems")}
            >
              {heroItems.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === activeHeroIdx}
                  className={`${styles.heroDot} ${i === activeHeroIdx ? styles.active : ""}`}
                  onClick={() => setHeroIdx(i)}
                  aria-label={t("home.showItem", { number: i + 1 })}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {continueWatching.length > 0 && (
        <section className="section" aria-labelledby="continue-heading">
          <div className="section-header">
            <h2 id="continue-heading" className="section-title">
              {t("home.continueWatching")}
            </h2>
            <div
              className={styles.filterTabs}
              aria-label={t("home.filterByType")}
            >
              {CW_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={cwFilter === tab.key}
                  className={`${styles.filterTab} ${cwFilter === tab.key ? styles.active : ""}`}
                  onClick={() => setCwFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {filteredCW.length > 0 ? (
            filteredCW.length > 1 ? (
              <MediaCarousel
                className="cw-carousel"
                label={t("home.continueWatching")}
                labelledBy="continue-heading"
              >
                {filteredCW.map((item, i) => (
                  <CwCard
                    key={`${item.type}-${item.id}-${item.episode || ""}-${i}`}
                    item={item}
                    onRemove={handleRemoveCW}
                    onRestart={handleRestartCW}
                  />
                ))}
              </MediaCarousel>
            ) : (
              <div className={styles.cwGrid}>
                {filteredCW.map((item, i) => (
                  <CwCard
                    key={`${item.type}-${item.id}-${item.episode || ""}-${i}`}
                    item={item}
                    onRemove={handleRemoveCW}
                    onRestart={handleRestartCW}
                  />
                ))}
              </div>
            )
          ) : (
            <div className={styles.cwEmpty}>{t("home.nothingInCategory")}</div>
          )}
        </section>
      )}

      <section className="section" aria-labelledby="trending-heading">
        <div className="section-header">
          <h2 id="trending-heading" className="section-title">
            {t("home.trendingThisWeek")}
          </h2>
          <div
            className={styles.filterTabs}
            aria-label={t("home.filterTrendingByType")}
          >
            {TRENDING_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                aria-pressed={trendingType === tab.key}
                className={`${styles.filterTab} ${trendingType === tab.key ? styles.active : ""}`}
                onClick={() => setTrendingType(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <CollectionSkeleton variant="grid" count={12} />
        ) : error ? (
          <div className="empty-state" role="alert">
            <h3>{t("home.trendingErrorTitle")}</h3>
            <p>{t("home.trendingErrorBody")}</p>
          </div>
        ) : playableTrending.length === 0 ? (
          <div className="empty-state" role="status">
            <h3>{t("home.trendingEmptyTitle")}</h3>
            <p>{t("home.trendingEmptyBody")}</p>
          </div>
        ) : (
          <div className="media-grid">
            {playableTrending.map((item) => (
              <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="genres-heading">
        <h2 id="genres-heading" className="section-title">
          {t("home.browseByGenre")}
        </h2>
        <h3 id="genres-movies-heading" className="sub-section-title">
          {t("home.movies")}
        </h3>
        <GenreCarousel
          highlights={movieHighlights}
          to="/movies"
          headingId="genres-movies-heading"
          label={t("home.movieGenres")}
        />
        <h3 id="genres-tv-heading" className="sub-section-title">
          {t("nav.tvShows")}
        </h3>
        <GenreCarousel
          highlights={tvHighlights}
          to="/tv"
          headingId="genres-tv-heading"
          label={t("home.tvGenres")}
        />
      </section>
    </div>
  );
}
