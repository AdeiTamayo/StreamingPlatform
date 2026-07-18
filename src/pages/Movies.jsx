import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getPopularMovies, getMovieGenres, getCountries, discover, searchMovies } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import FilterBar from '../components/FilterBar';
import FilterDropdown from '../components/FilterDropdown';
import DatePickerField from '../components/DatePickerField';

const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

const sortOptions = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'primary_release_date.desc', label: 'Release date (newest)' },
  { value: 'primary_release_date.asc', label: 'Release date (oldest)' },
  { value: 'original_title.asc', label: 'Title A-Z' },
];

const yearOptions = [{ value: '', label: 'Any year' }, ...years.map((y) => ({ value: String(y), label: String(y) }))];
const sortOptionList = [{ value: '', label: 'Sort by' }, ...sortOptions];

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [genres, setGenres] = useState([]);
  const [countries, setCountries] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateUntil, setReleaseDateUntil] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  const countryOptions = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const genreOptions = [{ value: '', label: 'All genres' }, ...genres.map((g) => ({ value: String(g.id), label: g.name }))];

  useEffect(() => {
    getMovieGenres().then((data) => setGenres(data.genres || [])).catch(() => { });
    getCountries().then(setCountries).catch(() => { });
  }, []);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setLoading(true);
      if (query.trim()) {
        searchMovies(query.trim(), page)
          .then((data) => setMovies(data.results || []))
          .catch(console.error)
          .finally(() => setLoading(false));
      } else {
        const hasFilters = genre || country || year || sortBy || releaseDateFrom || releaseDateUntil;
        const fetcher = hasFilters ? discover('movie', { genreId: genre || undefined, country: country || undefined, year: year || undefined, sortBy: sortBy || undefined, releaseDateGte: releaseDateFrom || undefined, releaseDateLte: releaseDateUntil || undefined }, page) : getPopularMovies(page);
        fetcher.then((data) => setMovies(data.results || [])).catch(console.error).finally(() => setLoading(false));
      }
    }, query.trim() ? 400 : 0);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [page, genre, country, year, sortBy, query, releaseDateFrom, releaseDateUntil]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">Movies</h2>
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
            placeholder="Search movies..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="media-grid">
              {movies.map((movie) => (
                <MediaCard key={movie.id} item={movie} mediaType="movie" />
              ))}
            </div>
            <div className="pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span>Page {page}</span>
              <button onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
