import { useState, useEffect, useCallback } from 'react';
import { getPopularMovies, getPopularTV, getMovieGenres, getTVGenres, getCountries, discover, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import FilterBar from '../components/FilterBar';
import FilterDropdown from '../components/FilterDropdown';
import DatePickerField from '../components/DatePickerField';
import useSearchFilter from '../hooks/useSearchFilter';
import type { MediaType, TMDBGenre, TMDBCountry, FilterOption } from '../types';

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
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateUntil, setReleaseDateUntil] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    document.title = `${isMovie ? 'Movies' : 'TV Shows'} - StreamFlow`;
    const genreFn = isMovie ? getMovieGenres : getTVGenres;
    genreFn().then((data: { genres: TMDBGenre[] }) => setGenres(data.genres || [])).catch(() => {});
    getCountries().then((data) => setCountries(data as TMDBCountry[])).catch(() => {});
  }, [isMovie]);

  const sortOptions = isMovie ? movieSortOptions : tvSortOptions;
  const sortOptionList: FilterOption[] = [{ value: '', label: 'Sort by' }, ...sortOptions];
  const countryOptions: FilterOption[] = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const genreOptions: FilterOption[] = [{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))];

  const fetchFn = useCallback((page: number, filters: Record<string, string | undefined>, signal: AbortSignal) => {
    const { query: q, genre: g, country: c, year: y, sortBy: s, releaseDateFrom: rdf, releaseDateUntil: rdu } = filters;
    if (q?.trim()) {
      return (isMovie ? searchMovies : searchTV)(q.trim(), page, signal);
    }
    const hasFilters = g || c || y || s || rdf || rdu;
    if (hasFilters) {
      return discover(type, { genreId: g || undefined, country: c || undefined, year: y || undefined, sortBy: s || undefined, releaseDateGte: rdf || undefined, releaseDateLte: rdu || undefined }, page, signal);
    }
    return (isMovie ? getPopularMovies : getPopularTV)(page, signal);
  }, [isMovie, type]);

  const { results, page, setPage, totalPages, loading, error } = useSearchFilter(fetchFn, { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil });

  return (
    <div className="page">
      <section className="section" aria-labelledby="browse-heading">
        <div className="section-header">
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
            hasActiveFilters={!!query || !!country || !!genre || !!year || !!sortBy || !!releaseDateFrom || !!releaseDateUntil}
            onClearFilters={() => { setQuery(''); setCountry(''); setGenre(''); setYear(''); setSortBy(''); setReleaseDateFrom(''); setReleaseDateUntil(''); setPage(1); }}
          />
        </div>
        {showMore && (
          <div className="more-filters-panel">
            <DatePickerField label="From" value={releaseDateFrom} placeholder="Select start date" onChange={(value) => { setReleaseDateFrom(value); setPage(1); }} />
            <DatePickerField label="Until" value={releaseDateUntil} placeholder="Select end date" onChange={(value) => { setReleaseDateUntil(value); setPage(1); }} />
            <FilterDropdown value={year} options={yearOptions} placeholder="Any year" onSelect={(value) => { setYear(value); setPage(1); }} />
            <FilterDropdown value={sortBy} options={sortOptionList} placeholder="Sort by" onSelect={(value) => { setSortBy(value); setPage(1); }} />
          </div>
        )}
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder={`Search ${isMovie ? 'movies' : 'TV shows'}...`}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        {error ? (
          <div className="loading" role="alert">Failed to load. Check your connection.</div>
        ) : loading ? (
          <div className="loading" role="status">Loading...</div>
        ) : results.length === 0 ? (
          <div className="loading" role="status">No results found</div>
        ) : (
          <>
            <div className="media-grid">
              {results.map((item) => (
                <MediaCard key={item.id} item={item} mediaType={type} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
