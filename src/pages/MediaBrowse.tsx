import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getPopularMovies,
  getPopularTV,
  getMovieGenres,
  getTVGenres,
  getCountries,
  getLanguages,
  discover,
  searchMovies,
  searchTV,
} from "../api/tmdb";
import MediaCard from "../components/MediaCard";
import Pagination from "../components/Pagination";
import DatePickerField from "../components/DatePickerField";
import NumberStepper from "../components/NumberStepper";
import useSearchFilter from "../hooks/useSearchFilter";
import { localizedGenreName } from "../utils/genres";
import type {
  MediaType,
  TMDBGenre,
  TMDBCountry,
  TMDBLanguage,
  TMDBMovie,
  TMDBSeries,
  TMDBPaginatedResponse,
  FilterOption,
} from "../types";
import SearchBar, { SearchSelectField } from "../components/SearchBar";

const years = Array.from(
  { length: new Date().getFullYear() - 1899 },
  (_, i) => new Date().getFullYear() - i,
);

// `labelKey` is an i18n key; labels are translated inside the component.
const movieSortOptions: { value: string; labelKey: string }[] = [
  { value: "popularity.desc", labelKey: "search.sortPopularity" },
  { value: "vote_average.desc", labelKey: "search.sortRating" },
  { value: "primary_release_date.desc", labelKey: "search.sortReleaseNewest" },
  { value: "primary_release_date.asc", labelKey: "search.sortReleaseOldest" },
  { value: "original_title.asc", labelKey: "search.sortTitleAsc" },
];

const tvSortOptions: { value: string; labelKey: string }[] = [
  { value: "popularity.desc", labelKey: "search.sortPopularity" },
  { value: "vote_average.desc", labelKey: "search.sortRating" },
  { value: "first_air_date.desc", labelKey: "search.sortReleaseNewest" },
  { value: "first_air_date.asc", labelKey: "search.sortReleaseOldest" },
  { value: "original_name.asc", labelKey: "search.sortTitleAsc" },
];

function refineSearchPage(
  data: TMDBPaginatedResponse<TMDBMovie | TMDBSeries>,
  filters: {
    genre?: string;
    language?: string;
    year?: string;
    voteCount?: string;
  },
): TMDBPaginatedResponse<TMDBMovie | TMDBSeries> {
  const { genre, language, year, voteCount } = filters;
  if (!genre && !language && !year && !voteCount) return data;
  const source = data.results || [];
  const results = source.filter((item) => {
    if (genre && !(item.genre_ids || []).includes(Number(genre))) return false;
    if (language && item.original_language !== language) return false;
    const date =
      (item as TMDBMovie).release_date ||
      (item as TMDBSeries).first_air_date ||
      "";
    if (year && date.slice(0, 4) !== year) return false;
    if (voteCount && (item.vote_count || 0) < Number(voteCount)) return false;
    return true;
  });
  const totalPages = Math.max(data.total_pages || 1, 1);
  const total_pages =
    source.length && results.length
      ? Math.max(1, Math.ceil((totalPages * results.length) / source.length))
      : totalPages;
  return { ...data, results, total_pages };
}

interface MediaBrowseProps {
  type: MediaType;
}

export default function MediaBrowse({ type }: MediaBrowseProps) {
  const { t } = useTranslation();
  const isMovie = type === "movie";
  const [searchParams, setSearchParams] = useSearchParams();
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [countries, setCountries] = useState<TMDBCountry[]>([]);
  const [languages, setLanguages] = useState<TMDBLanguage[]>([]);
  const [genre, setGenre] = useState(searchParams.get("genre") || "");
  const [country, setCountry] = useState("");
  const [year, setYear] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [releaseDateFrom, setReleaseDateFrom] = useState("");
  const [releaseDateUntil, setReleaseDateUntil] = useState("");
  const [language, setLanguage] = useState("");
  const [voteCount, setVoteCount] = useState("");
  const [voteInput, setVoteInput] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState(searchParams.get("query") || "");
  // Page number that had no matches (null = no hint); the text is rendered with t().
  const [pageHint, setPageHint] = useState<number | null>(null);

  useEffect(() => {
    const genreFn = isMovie ? getMovieGenres : getTVGenres;
    genreFn()
      .then((data: { genres: TMDBGenre[] }) => setGenres(data.genres || []))
      .catch(() => {});
    getCountries()
      .then((data) => setCountries(data as TMDBCountry[]))
      .catch(() => {});
    getLanguages()
      .then((data) => setLanguages(data as TMDBLanguage[]))
      .catch(() => {});
  }, [isMovie]);

  useEffect(() => {
    document.title = t("browse.documentTitle", {
      title: isMovie ? t("nav.movies") : t("nav.tvShows"),
    });
  }, [isMovie, t]);

  useEffect(() => {
    const timer = setTimeout(
      () => setVoteCount(voteInput.replace(/\D/g, "").slice(0, 6)),
      400,
    );
    return () => clearTimeout(timer);
  }, [voteInput]);

  const sortOptions = (isMovie ? movieSortOptions : tvSortOptions).map((o) => ({
    value: o.value,
    label: t(o.labelKey),
  }));
  const sortOptionList: FilterOption[] = [
    { value: "", label: t("search.sortBy") },
    ...sortOptions,
  ];
  const yearOptions: FilterOption[] = [
    { value: "", label: t("search.anyYear") },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ];
  const countryOptions: FilterOption[] = [
    { value: "", label: t("search.allCountries") },
    ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name })),
  ];
  const genreOptions: FilterOption[] = [
    { value: "", label: t("search.allGenres") },
    ...genres.map((g) => ({ value: String(g.id), label: localizedGenreName(g, t) })),
  ];
  const languageOptions: FilterOption[] = [
    { value: "", label: t("search.originalLanguage") },
    ...languages.map((l) => ({ value: l.iso_639_1, label: l.english_name })),
  ];

  const activeFiltersList = [
    query.trim()
      ? {
          key: "query",
          label: t("search.queryDocumentTitle", { query: query.trim() }),
        }
      : null,
    genre
      ? {
          key: "genre",
          label: t("search.filterGenre", {
            value: genreOptions.find((o) => o.value === genre)?.label || genre,
          }),
        }
      : null,
    country
      ? {
          key: "country",
          label: t("search.filterCountry", {
            value:
              countryOptions.find((o) => o.value === country)?.label || country,
          }),
        }
      : null,
    year
      ? { key: "year", label: t("search.filterYear", { value: year }) }
      : null,
    sortBy
      ? {
          key: "sortBy",
          label: t("search.filterSort", {
            value:
              sortOptionList.find((o) => o.value === sortBy)?.label || sortBy,
          }),
        }
      : null,
    releaseDateFrom
      ? {
          key: "from",
          label: t("search.filterFrom", { value: releaseDateFrom }),
        }
      : null,
    releaseDateUntil
      ? {
          key: "until",
          label: t("search.filterUntil", { value: releaseDateUntil }),
        }
      : null,
    language
      ? {
          key: "language",
          label: t("search.filterLanguage", {
            value:
              languageOptions.find((o) => o.value === language)?.label ||
              language,
          }),
        }
      : null,
    voteCount
      ? { key: "votes", label: t("search.filterVotes", { value: voteCount }) }
      : null,
  ].filter(
    (filter): filter is { key: string; label: string } => filter !== null,
  );

  const fetchFn = useCallback(
    async (
      page: number,
      filters: Record<string, string | undefined>,
      signal: AbortSignal,
    ) => {
      const {
        query: q,
        genre: g,
        country: c,
        year: y,
        sortBy: s,
        releaseDateFrom: rdf,
        releaseDateUntil: rdu,
        language: l,
        voteCount: vc,
      } = filters;
      if (q?.trim()) {
        const data = (await (isMovie ? searchMovies : searchTV)(
          q.trim(),
          page,
          signal,
        )) as TMDBPaginatedResponse<TMDBMovie | TMDBSeries>;
        return refineSearchPage(data, {
          genre: g,
          language: l,
          year: y,
          voteCount: vc,
        });
      }
      const hasFilters = g || c || y || s || rdf || rdu || l || vc;
      if (hasFilters) {
        return discover(
          type,
          {
            genreId: g || undefined,
            country: c || undefined,
            year: y || undefined,
            sortBy: s || undefined,
            releaseDateGte: rdf || undefined,
            releaseDateLte: rdu || undefined,
            originalLanguage: l || undefined,
            voteCountGte: vc || undefined,
          },
          page,
          signal,
        ) as Promise<TMDBPaginatedResponse<TMDBMovie | TMDBSeries>>;
      }
      return (isMovie ? getPopularMovies : getPopularTV)(
        page,
        signal,
      ) as Promise<TMDBPaginatedResponse<TMDBMovie | TMDBSeries>>;
    },
    [isMovie, type],
  );

  const { results, page, setPage, totalPages, loading, error } =
    useSearchFilter(fetchFn, {
      query,
      genre,
      country,
      year,
      sortBy,
      releaseDateFrom,
      releaseDateUntil,
      language,
      voteCount,
    });

  useEffect(() => {
    const g = searchParams.get("genre") || "";
    if (g !== genre) {
      setGenre(g);
      setPage(1);
    }
    const q = searchParams.get("query") || "";
    if (q !== query) {
      setQuery(q);
      setPage(1);
    }
  }, [searchParams]);

  const handleGenreChange = useCallback(
    (value: string) => {
      setGenre(value);
      setPage(1);
      const next = new URLSearchParams(searchParams);
      if (value) next.set("genre", value);
      else next.delete("genre");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, setPage],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setPage(1);
      const next = new URLSearchParams(searchParams);
      if (value) next.set("query", value);
      else next.delete("query");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, setPage],
  );

  const removeFilter = useCallback(
    (key: string) => {
      switch (key) {
        case "query": {
          setQuery("");
          const next = new URLSearchParams(searchParams);
          next.delete("query");
          setSearchParams(next, { replace: true });
          break;
        }
        case "genre":
          handleGenreChange("");
          break;
        case "country":
          setCountry("");
          break;
        case "year":
          setYear("");
          break;
        case "sortBy":
          setSortBy("");
          break;
        case "from":
          setReleaseDateFrom("");
          break;
        case "until":
          setReleaseDateUntil("");
          break;
        case "language":
          setLanguage("");
          break;
        case "votes":
          setVoteCount("");
          setVoteInput("");
          break;
        default:
          break;
      }
      setPage(1);
    },
    [handleGenreChange, searchParams, setSearchParams, setPage],
  );

  const clearFilters = useCallback(() => {
    setQuery("");
    setCountry("");
    setGenre("");
    setYear("");
    setSortBy("");
    setReleaseDateFrom("");
    setReleaseDateUntil("");
    setLanguage("");
    setVoteCount("");
    setVoteInput("");
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete("genre");
    next.delete("query");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setPage]);

  useEffect(() => {
    if (loading || error || !query.trim()) return;
    if (results.length === 0 && page > 1) {
      setPage(page - 1);
      setPageHint(page);
    } else if (pageHint !== null && (results.length > 0 || page === 1)) {
      setPageHint(null);
    }
  }, [loading, error, results, page, query, pageHint, setPage]);

  const dateRangeInvalid =
    !!releaseDateFrom &&
    !!releaseDateUntil &&
    releaseDateFrom > releaseDateUntil;

  return (
    <div className="page">
      <SearchBar
        query={query}
        onQueryChange={handleQueryChange}
        searchPlaceholder={
          isMovie
            ? t("browse.searchPlaceholderMovies")
            : t("browse.searchPlaceholderTv")
        }
        countryValue={country}
        onCountryChange={(value) => {
          setCountry(value);
          setPage(1);
        }}
        countryOptions={countryOptions}
        genreValue={genre}
        onGenreChange={handleGenreChange}
        genreOptions={genreOptions}
        sortValue={sortBy}
        onSortChange={(value) => {
          setSortBy(value);
          setPage(1);
        }}
        sortOptions={sortOptionList}
        showMore={showMore}
        onToggleShowMore={() => setShowMore((s) => !s)}
        activeFilters={activeFiltersList}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isSearchContext={false}
        title={isMovie ? t("nav.movies") : t("nav.tvShows")}
        subtitle={t("search.subtitle")}
      >
        <div className="field">
          <span className="field-label">{t("search.releaseFrom")}</span>
          <DatePickerField
            label={t("search.from")}
            value={releaseDateFrom}
            placeholder={t("search.selectStartDate")}
            onChange={(value) => {
              setReleaseDateFrom(value);
              setPage(1);
            }}
          />
        </div>
        <div className="field">
          <span className="field-label">{t("search.releaseUntil")}</span>
          <DatePickerField
            label={t("search.until")}
            value={releaseDateUntil}
            placeholder={t("search.selectEndDate")}
            onChange={(value) => {
              setReleaseDateUntil(value);
              setPage(1);
            }}
          />
        </div>
        <SearchSelectField
          label={t("search.year")}
          value={year}
          options={yearOptions}
          onChange={(value) => {
            setYear(value);
            setPage(1);
          }}
        />
        <SearchSelectField
          label={t("search.language")}
          value={language}
          options={languageOptions}
          onChange={(value) => {
            setLanguage(value);
            setPage(1);
          }}
        />
        <div className="field">
          <label className="field-label" htmlFor="browse-min-votes">
            {t("search.minimumVotes")}
          </label>
          <NumberStepper
            id="browse-min-votes"
            label={t("search.minimumVotesLabel")}
            value={voteInput}
            onChange={setVoteInput}
            step={100}
            placeholder={t("search.anyAmount")}
          />
        </div>
        {dateRangeInvalid && (
          <p className="filter-error" role="alert">
            {t("search.dateRangeError")}
          </p>
        )}
      </SearchBar>

      {pageHint !== null && (
        <p className="page-hint" role="status">
          {t("search.pageHint", { page: pageHint })}
        </p>
      )}
      {error ? (
        <div className="empty-state" role="alert">
          <h3>{t("browse.loadErrorTitle")}</h3>
          <p>{t("browse.loadErrorBody")}</p>
        </div>
      ) : loading ? (
        <div
          className="media-grid"
          role="status"
          aria-live="polite"
          aria-label={
            isMovie ? t("browse.loadingMovies") : t("browse.loadingTv")
          }
        >
          {Array.from({ length: 12 }, (_, i) => (
            <div
              className="media-card skeleton-card"
              key={i}
              aria-hidden="true"
            >
              <div className="media-card-poster">
                <div className="media-card-skeleton" />
              </div>
              <div className="media-card-info">
                <div className="skeleton-text skeleton-title" />
                <div className="skeleton-text skeleton-year" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state" role="status">
          <h3>{isMovie ? t("browse.emptyMovies") : t("browse.emptyTv")}</h3>
          <p>{t("browse.emptyBody")}</p>
          {activeFiltersList.length > 0 && (
            <button className="empty-state-action" onClick={clearFilters}>
              {t("search.clearFilters")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="media-grid">
            {results.map((item) => (
              <MediaCard key={item.id} item={item} mediaType={type} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
