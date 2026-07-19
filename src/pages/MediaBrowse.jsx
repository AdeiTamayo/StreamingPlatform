import { useState, useEffect, useCallback } from 'react';
import { getPopularMovies, getPopularTV, getMovieGenres, getTVGenres, getCountries, discover, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import FilterBar from '../components/FilterBar';
import FilterDropdown from '../components/FilterDropdown';
import DatePickerField from '../components/DatePickerField';
import useSearchFilter from '../hooks/useSearchFilter';

const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

const movieSortOptions = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'primary_release_date.desc', label: 'Release date (newest)' },
  { value: 'primary_release_date.asc', label: 'Release date (oldest)' },
  { value: 'original_title.asc', label: 'Title A-Z' },
];

const tvSortOptions = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'first_air_date.desc', label: 'Release date (newest)' },
  { value: 'first_air_date.asc', label: 'Release date (oldest)' },
  { value: 'original_name.asc', label: 'Name A-Z' },
];

const yearOptions = [{ value: '', label: 'Any year' }, ...years.map((y) => ({ value: String(y), label: String(y) }))];

export default function MediaBrowse({ type }) {
  const isMovie = type === 'movie';
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
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
    genreFn().then((data) => setGenres(data.genres || [])).catch(() => {});
    getCountries().then(setCountries).catch(() => {});
  }, [isMovie]);

  const sortOptions = isMovie ? movieSortOptions : tvSortOptions;
  const sortOptionList = [{ value: '', label: 'Sort by' }, ...sortOptions];
  const countryOptions = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const genreOptions = [{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))];

  const fetchFn = useCallback((page, { query: q, genre: g, country: c, year: y, sortBy: s, releaseDateFrom: rdf, releaseDateUntil: rdu }) => {
    if (q?.trim()) {
      return (isMovie ? searchMovies : searchTV)(q.trim(), page);
    }
    const hasFilters = g || c || y || s || rdf || rdu;
    if (hasFilters) {
      return discover(type, { genreId: g || undefined, country: c || undefined, year: y || undefined, sortBy: s || undefined, releaseDateGte: rdf || undefined, releaseDateLte: rdu || undefined }, page);
    }
    return (isMovie ? getPopularMovies : getPopularTV)(page);
  }, [isMovie, type]);

  const { results, page, setPage, totalPages, loading } = useSearchFilter(fetchFn, { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil });

  return (
    <div className="page">
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">{isMovie ? 'Movies' : 'TV Shows'}</h2>
          <FilterBar
            countryValue={country}
            genreValue={genre}
            showMore={showMore}
            onToggleShowMore={() => setShowMore((s) => !s)}
            onCountryChange={(value) => { setCountry(value); setPage(1); }}
            onGenreChange={(value) => { setGenre(value); setPage(1); }}
            countryOptions={countryOptions}
            genreOptions={genreOptions}
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
        {loading ? (
          <div className="loading">Loading...</div>
        ) : results.length === 0 ? (
          <div className="loading">No results found</div>
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
                <span>Page {page}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
