import { useState, useEffect, useCallback } from 'react';
import { getPopularMovies, getPopularTV, getMovieGenres, getTVGenres, getCountries, getLanguages, discover, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import Pagination from '../components/Pagination';
import FilterBar from '../components/FilterBar';
import FilterDropdown from '../components/FilterDropdown';
import DatePickerField from '../components/DatePickerField';
import useSearchFilter from '../hooks/useSearchFilter';
import type { MediaType, TMDBGenre, TMDBCountry, TMDBLanguage, FilterOption } from '../types';

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

interface MediaBrowseProps {
  type: MediaType;
}

export default function MediaBrowse({ type }: MediaBrowseProps) {
  const isMovie = type === 'movie';
  const [genres, setGenres] = useState<TMDBGenre[]>([]);
  const [countries, setCountries] = useState<TMDBCountry[]>([]);
  const [languages, setLanguages] = useState<TMDBLanguage[]>([]);
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateUntil, setReleaseDateUntil] = useState('');
  const [language, setLanguage] = useState('');
  const [voteCount, setVoteCount] = useState('');
  const [voteInput, setVoteInput] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    document.title = `${isMovie ? 'Movies' : 'TV Shows'} - StreamFlow`;
    const genreFn = isMovie ? getMovieGenres : getTVGenres;
    genreFn().then((data: { genres: TMDBGenre[] }) => setGenres(data.genres || [])).catch(() => {});
    getCountries().then((data) => setCountries(data as TMDBCountry[])).catch(() => {});
    getLanguages().then((data) => setLanguages(data as TMDBLanguage[])).catch(() => {});
  }, [isMovie]);

  // Debounce the min-votes input so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => setVoteCount(voteInput.replace(/\D/g, '').slice(0, 6)), 400);
    return () => clearTimeout(t);
  }, [voteInput]);

  const sortOptions = isMovie ? movieSortOptions : tvSortOptions;
  const sortOptionList: FilterOption[] = [{ value: '', label: 'Sort by' }, ...sortOptions];
  const countryOptions: FilterOption[] = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const genreOptions: FilterOption[] = [{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))];
  const languageOptions: FilterOption[] = [{ value: '', label: 'Original language' }, ...languages.map((l) => ({ value: l.iso_639_1, label: l.english_name }))];
  const activeFilters = [
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

  const fetchFn = useCallback((page: number, filters: Record<string, string | undefined>, signal: AbortSignal) => {
    const { query: q, genre: g, country: c, year: y, sortBy: s, releaseDateFrom: rdf, releaseDateUntil: rdu, language: l, voteCount: vc } = filters;
    if (q?.trim()) {
      return (isMovie ? searchMovies : searchTV)(q.trim(), page, signal);
    }
    const hasFilters = g || c || y || s || rdf || rdu || l || vc;
    if (hasFilters) {
      return discover(type, {
        genreId: g || undefined, country: c || undefined, year: y || undefined, sortBy: s || undefined,
        releaseDateGte: rdf || undefined, releaseDateLte: rdu || undefined,
        originalLanguage: l || undefined, voteCountGte: vc || undefined,
      }, page, signal);
    }
    return (isMovie ? getPopularMovies : getPopularTV)(page, signal);
  }, [isMovie, type]);

  const { results, page, setPage, totalPages, loading, error } = useSearchFilter(fetchFn, {
    query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount,
  });

  return (
    <div className="page">
      <section className="section" aria-labelledby="browse-heading">
        <div className="section-header browse-header">
          <h2 id="browse-heading" className="section-title">{isMovie ? 'Movies' : 'TV Shows'}</h2>
          <FilterBar
            countryValue={country}
            genreValue={genre}
            showMore={showMore}
            onToggleShowMore={() => setShowMore((s) => !s)}
            onCountryChange={(value) => { setCountry(value); setPage(1); }}
            onGenreChange={(value) => { setGenre(value); setPage(1); }}
            countryOptions={countryOptions}
            genreOptions={genreOptions}
            hasActiveFilters={!!query || !!country || !!genre || !!year || !!sortBy || !!releaseDateFrom || !!releaseDateUntil || !!language || !!voteCount}
            onClearFilters={() => { setQuery(''); setCountry(''); setGenre(''); setYear(''); setSortBy(''); setReleaseDateFrom(''); setReleaseDateUntil(''); setLanguage(''); setVoteCount(''); setVoteInput(''); setPage(1); }}
          />
        </div>
        {showMore && (
          <div className="more-filters-panel" aria-label="Additional filters">
            <div className="filter-control"><span className="filter-control-label">Release date</span><DatePickerField label="From" value={releaseDateFrom} placeholder="Select start date" onChange={(value) => { setReleaseDateFrom(value); setPage(1); }} /></div>
            <div className="filter-control"><span className="filter-control-label">Release date</span><DatePickerField label="Until" value={releaseDateUntil} placeholder="Select end date" onChange={(value) => { setReleaseDateUntil(value); setPage(1); }} /></div>
            <div className="filter-control"><span className="filter-control-label">Year</span><FilterDropdown value={year} options={yearOptions} placeholder="Any year" onSelect={(value) => { setYear(value); setPage(1); }} /></div>
            <div className="filter-control sort-filter-control"><span className="filter-control-label">Sort results</span><FilterDropdown className="sort-filter" value={sortBy} options={sortOptionList} placeholder="Sort by" onSelect={(value) => { setSortBy(value); setPage(1); }} /></div>
            <div className="filter-control"><span className="filter-control-label">Language</span><FilterDropdown value={language} options={languageOptions} placeholder="Original language" onSelect={(value) => { setLanguage(value); setPage(1); }} /></div>
            <label className="filter-control"><span className="filter-control-label">Minimum votes</span><input className="filter-number-input" type="number" min="0" inputMode="numeric" placeholder="Any amount" aria-label="Minimum votes" value={voteInput} onChange={(e) => setVoteInput(e.target.value)} /></label>
          </div>
        )}
        {activeFilters.length > 0 && (
          <div className="active-filters" aria-label="Active filters">
            <span className="active-filters-label">Active filters</span>
            {activeFilters.map((filter) => <span className="filter-chip" key={filter.key}>{filter.label}</span>)}
          </div>
        )}
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder={`Search ${isMovie ? 'movies' : 'TV shows'}...`}
            aria-label={`Search ${isMovie ? 'movies' : 'TV shows'}`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
        {query.trim() && (country || genre || year || sortBy || releaseDateFrom || releaseDateUntil || language || voteCount) && (
          <div className="loading" role="note" style={{ fontSize: "0.8rem", opacity: 0.75 }}>
            Text search ignores the browse filters above - clear the search to browse with filters.
          </div>
        )}
        {error ? (
          <div className="empty-state" role="alert"><h3>Couldn’t load results</h3><p>Check your connection, then refresh or adjust your filters.</p></div>
        ) : loading ? (
          <div className="loading" role="status" aria-live="polite">Finding {isMovie ? 'movies' : 'TV shows'}...</div>
        ) : results.length === 0 ? (
          <div className="empty-state" role="status"><h3>No {isMovie ? 'movies' : 'TV shows'} found</h3><p>Try removing a filter or searching for a different title.</p>{activeFilters.length > 0 && <button className="empty-state-action" onClick={() => { setQuery(''); setCountry(''); setGenre(''); setYear(''); setSortBy(''); setReleaseDateFrom(''); setReleaseDateUntil(''); setLanguage(''); setVoteCount(''); setVoteInput(''); setPage(1); }}>Clear filters</button>}</div>
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
      </section>
    </div>
  );
}
