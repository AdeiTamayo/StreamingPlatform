import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getPopularMovies, getPopularTV, getMovieGenres, getTVGenres, getCountries, getLanguages, discover, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import Pagination from '../components/Pagination';
import DatePickerField from '../components/DatePickerField';
import useSearchFilter from '../hooks/useSearchFilter';
import type { MediaType, TMDBGenre, TMDBCountry, TMDBLanguage, TMDBMovie, TMDBSeries, TMDBPaginatedResponse, FilterOption } from '../types';
import SearchBar, { SearchSelectField } from '../components/SearchBar';

const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

const movieSortOptions: FilterOption[] = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'primary_release_date.desc', label: 'Release date (newest)' },
  { value: 'primary_release_date.asc', label: 'Release date (oldest)' },
  { value: 'original_title.asc', label: 'Title A-Z' },
];

const tvSortOptions: FilterOption[] = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'first_air_date.desc', label: 'Release date (newest)' },
  { value: 'first_air_date.asc', label: 'Release date (oldest)' },
  { value: 'original_name.asc', label: 'Name A-Z' },
];

const yearOptions: FilterOption[] = [{ value: '', label: 'Any year' }, ...years.map((y) => ({ value: String(y), label: String(y) }))];

function refineSearchPage(
  data: TMDBPaginatedResponse<TMDBMovie | TMDBSeries>,
  filters: { genre?: string; language?: string; year?: string; voteCount?: string },
): TMDBPaginatedResponse<TMDBMovie | TMDBSeries> {
  const { genre, language, year, voteCount } = filters;
  if (!genre && !language && !year && !voteCount) return data;
  const source = data.results || [];
  const results = source.filter((item) => {
    if (genre && !(item.genre_ids || []).includes(Number(genre))) return false;
    if (language && item.original_language !== language) return false;
    const date = (item as TMDBMovie).release_date || (item as TMDBSeries).first_air_date || '';
    if (year && date.slice(0, 4) !== year) return false;
    if (voteCount && (item.vote_count || 0) < Number(voteCount)) return false;
    return true;
  });
  const totalPages = Math.max(data.total_pages || 1, 1);
  const total_pages = source.length && results.length
    ? Math.max(1, Math.ceil((totalPages * results.length) / source.length))
    : totalPages;
  return { ...data, results, total_pages };
}

interface MediaBrowseProps {
  type: MediaType;
}

export default function MediaBrowse({ type }: MediaBrowseProps) {
  const isMovie = type === 'movie';
  const [searchParams, setSearchParams] = useSearchParams();
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [countries, setCountries] = useState<TMDBCountry[]>([]);
  const [languages, setLanguages] = useState<TMDBLanguage[]>([]);
  const [genre, setGenre] = useState(searchParams.get('genre') || '');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateUntil, setReleaseDateUntil] = useState('');
  const [language, setLanguage] = useState('');
  const [voteCount, setVoteCount] = useState('');
  const [voteInput, setVoteInput] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState(searchParams.get('query') || '');
  const [pageHint, setPageHint] = useState('');

  useEffect(() => {
    document.title = `${isMovie ? 'Movies' : 'TV Shows'} - StreamFlow`;
    const genreFn = isMovie ? getMovieGenres : getTVGenres;
    genreFn().then((data: { genres: TMDBGenre[] }) => setGenres(data.genres || [])).catch(() => {});
    getCountries().then((data) => setCountries(data as TMDBCountry[])).catch(() => {});
    getLanguages().then((data) => setLanguages(data as TMDBLanguage[])).catch(() => {});
  }, [isMovie]);

  useEffect(() => {
    const t = setTimeout(() => setVoteCount(voteInput.replace(/\D/g, '').slice(0, 6)), 400);
    return () => clearTimeout(t);
  }, [voteInput]);

  const sortOptions = isMovie ? movieSortOptions : tvSortOptions;
  const sortOptionList: FilterOption[] = [{ value: '', label: 'Sort by' }, ...sortOptions];
  const countryOptions: FilterOption[] = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const genreOptions: FilterOption[] = [{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))];
  const languageOptions: FilterOption[] = [{ value: '', label: 'Original language' }, ...languages.map((l) => ({ value: l.iso_639_1, label: l.english_name }))];

  const activeFiltersList = [
    query.trim() ? { key: 'query', label: `Search: ${query.trim()}` } : null,
    genre ? { key: 'genre', label: `Genre: ${genreOptions.find((o) => o.value === genre)?.label || genre}` } : null,
    country ? { key: 'country', label: `Country: ${countryOptions.find((o) => o.value === country)?.label || country}` } : null,
    year ? { key: 'year', label: `Year: ${year}` } : null,
    sortBy ? { key: 'sortBy', label: `Sort: ${sortOptionList.find((o) => o.value === sortBy)?.label || sortBy}` } : null,
    releaseDateFrom ? { key: 'from', label: `From: ${releaseDateFrom}` } : null,
    releaseDateUntil ? { key: 'until', label: `Until: ${releaseDateUntil}` } : null,
    language ? { key: 'language', label: `Language: ${languageOptions.find((o) => o.value === language)?.label || language}` } : null,
    voteCount ? { key: 'votes', label: `Min votes: ${voteCount}` } : null,
  ].filter((filter): filter is { key: string; label: string } => filter !== null);

  const fetchFn = useCallback(async (page: number, filters: Record<string, string | undefined>, signal: AbortSignal) => {
    const { query: q, genre: g, country: c, year: y, sortBy: s, releaseDateFrom: rdf, releaseDateUntil: rdu, language: l, voteCount: vc } = filters;
    if (q?.trim()) {
      const data = await (isMovie ? searchMovies : searchTV)(q.trim(), page, signal) as TMDBPaginatedResponse<TMDBMovie | TMDBSeries>;
      return refineSearchPage(data, { genre: g, language: l, year: y, voteCount: vc });
    }
    const hasFilters = g || c || y || s || rdf || rdu || l || vc;
    if (hasFilters) {
      return discover(type, {
        genreId: g || undefined, country: c || undefined, year: y || undefined, sortBy: s || undefined,
        releaseDateGte: rdf || undefined, releaseDateLte: rdu || undefined,
        originalLanguage: l || undefined, voteCountGte: vc || undefined,
      }, page, signal) as Promise<TMDBPaginatedResponse<TMDBMovie | TMDBSeries>>;
    }
    return (isMovie ? getPopularMovies : getPopularTV)(page, signal) as Promise<TMDBPaginatedResponse<TMDBMovie | TMDBSeries>>;
  }, [isMovie, type]);

  const { results, page, setPage, totalPages, loading, error } = useSearchFilter(fetchFn, {
    query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount,
  });

  useEffect(() => {
    const g = searchParams.get('genre') || '';
    if (g !== genre) { setGenre(g); setPage(1); }
    const q = searchParams.get('query') || '';
    if (q !== query) { setQuery(q); setPage(1); }
  }, [searchParams]);

  const handleGenreChange = useCallback((value: string) => {
    setGenre(value);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('genre', value); else next.delete('genre');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setPage]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
    const next = new URLSearchParams(searchParams);
    if (value) next.set('query', value); else next.delete('query');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setPage]);

  const removeFilter = useCallback((key: string) => {
    switch (key) {
      case 'query': {
        setQuery('');
        const next = new URLSearchParams(searchParams);
        next.delete('query');
        setSearchParams(next, { replace: true });
        break;
      }
      case 'genre': handleGenreChange(''); break;
      case 'country': setCountry(''); break;
      case 'year': setYear(''); break;
      case 'sortBy': setSortBy(''); break;
      case 'from': setReleaseDateFrom(''); break;
      case 'until': setReleaseDateUntil(''); break;
      case 'language': setLanguage(''); break;
      case 'votes': setVoteCount(''); setVoteInput(''); break;
      default: break;
    }
    setPage(1);
  }, [handleGenreChange, searchParams, setSearchParams, setPage]);

  const clearFilters = useCallback(() => {
    setQuery('');
    setCountry('');
    setGenre('');
    setYear('');
    setSortBy('');
    setReleaseDateFrom('');
    setReleaseDateUntil('');
    setLanguage('');
    setVoteCount('');
    setVoteInput('');
    setPage(1);
    const next = new URLSearchParams(searchParams);
    next.delete('genre');
    next.delete('query');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, setPage]);

  useEffect(() => {
    if (loading || error || !query.trim()) return;
    if (results.length === 0 && page > 1) {
      setPage(page - 1);
      setPageHint(`No matches on page ${page}. Showing an earlier page.`);
    } else if (pageHint && (results.length > 0 || page === 1)) {
      setPageHint('');
    }
  }, [loading, error, results, page, query, pageHint, setPage]);

  const dateRangeInvalid = !!releaseDateFrom && !!releaseDateUntil && releaseDateFrom > releaseDateUntil;

  return (
    <div className="page">
      <SearchBar
        query={query}
        onQueryChange={handleQueryChange}
        searchPlaceholder={`Search ${isMovie ? 'movies' : 'TV shows'}...`}
        countryValue={country}
        onCountryChange={(value) => { setCountry(value); setPage(1); }}
        countryOptions={countryOptions}
        genreValue={genre}
        onGenreChange={handleGenreChange}
        genreOptions={genreOptions}
        showMore={showMore}
        onToggleShowMore={() => setShowMore((s) => !s)}
        activeFilters={activeFiltersList}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isSearchContext={false}
        title={isMovie ? 'Movies' : 'TV Shows'}
        subtitle="Discover something new"
      >
        <div className="field">
          <span className="field-label">Release from</span>
          <DatePickerField label="From" value={releaseDateFrom} placeholder="Select start date" onChange={(value) => { setReleaseDateFrom(value); setPage(1); }} />
        </div>
        <div className="field">
          <span className="field-label">Release until</span>
          <DatePickerField label="Until" value={releaseDateUntil} placeholder="Select end date" onChange={(value) => { setReleaseDateUntil(value); setPage(1); }} />
        </div>
        <SearchSelectField label="Year" value={year} options={yearOptions} onChange={(value) => { setYear(value); setPage(1); }} />
        <SearchSelectField label="Sort results" value={sortBy} options={sortOptionList} onChange={(value) => { setSortBy(value); setPage(1); }} />
        <SearchSelectField label="Language" value={language} options={languageOptions} onChange={(value) => { setLanguage(value); setPage(1); }} />
        <label className="field">
          <span className="field-label">Minimum votes</span>
          <span className="field-control"><input className="votes-input" placeholder="Any amount" type="number" min="0" value={voteInput} onChange={(e) => setVoteInput(e.target.value)} /></span>
        </label>
        {dateRangeInvalid && <p className="filter-error" role="alert">Start date must be on or before the end date.</p>}
      </SearchBar>

      {pageHint && <p className="page-hint" role="status">{pageHint}</p>}
      {error ? (
        <div className="empty-state" role="alert"><h3>Couldn't load results</h3><p>Check your connection, then refresh or adjust your filters.</p></div>
      ) : loading ? (
        <div className="media-grid" role="status" aria-live="polite" aria-label={`Loading ${isMovie ? 'movies' : 'TV shows'}`}>
          {Array.from({ length: 12 }, (_, i) => (
            <div className="media-card skeleton-card" key={i} aria-hidden="true">
              <div className="media-card-poster"><div className="media-card-skeleton" /></div>
              <div className="media-card-info">
                <div className="skeleton-text skeleton-title" />
                <div className="skeleton-text skeleton-year" />
              </div>
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="empty-state" role="status"><h3>No {isMovie ? 'movies' : 'TV shows'} found</h3><p>Try removing a filter or searching for a different title.</p>{activeFiltersList.length > 0 && <button className="empty-state-action" onClick={clearFilters}>Clear filters</button>}</div>
      ) : (
        <>
          <div className="media-grid">
            {results.map((item) => (
              <MediaCard key={item.id} item={item} mediaType={type} />
            ))}
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}