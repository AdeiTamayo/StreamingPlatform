import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getPopularTV, getTVGenres, getCountries, discover, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import FilterBar from '../components/FilterBar';

const years = Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i);

const sortOptions = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'first_air_date.desc', label: 'Release date (newest)' },
  { value: 'first_air_date.asc', label: 'Release date (oldest)' },
  { value: 'original_name.asc', label: 'Name A-Z' },
];

const yearOptions = [{ value: '', label: 'Any year' }, ...years.map((y) => ({ value: String(y), label: String(y) }))];

export default function TVShows() {
  const [shows, setShows] = useState([]);
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
  const sortOptionList = [{ value: '', label: 'Sort by' }, ...sortOptions];

  useEffect(() => {
    getTVGenres().then((data) => setGenres(data.genres || [])).catch(() => { });
    getCountries().then(setCountries).catch(() => { });
  }, []);

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setLoading(true);
      if (query.trim()) {
        searchTV(query.trim(), page)
          .then((data) => setShows(data.results || []))
          .catch(console.error)
          .finally(() => setLoading(false));
      } else {
        const hasFilters = genre || country || year || sortBy || releaseDateFrom || releaseDateUntil;
        const fetcher = hasFilters ? discover('tv', { genreId: genre || undefined, country: country || undefined, year: year || undefined, sortBy: sortBy || undefined, releaseDateGte: releaseDateFrom || undefined, releaseDateLte: releaseDateUntil || undefined }, page) : getPopularTV(page);
        fetcher.then((data) => setShows(data.results || [])).catch(console.error).finally(() => setLoading(false));
      }
    }, query.trim() ? 400 : 0);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [page, genre, country, year, sortBy, query, releaseDateFrom, releaseDateUntil]);

  return (
    <div className="page">
      <Link to="/" className="home-link">Home</Link>
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">TV Shows</h2>
          <FilterBar
            countryValue={country}
            genreValue={genre}
            yearValue={year}
            sortValue={sortBy}
            releaseDateFrom={releaseDateFrom}
            releaseDateUntil={releaseDateUntil}
            showMore={showMore}
            onToggleShowMore={() => setShowMore((s) => !s)}
            onCountryChange={(value) => { setCountry(value); setPage(1); }}
            onGenreChange={(value) => { setGenre(value); setPage(1); }}
            onYearChange={(value) => { setYear(value); setPage(1); }}
            onSortChange={(value) => { setSortBy(value); setPage(1); }}
            onReleaseDateFromChange={(value) => { setReleaseDateFrom(value); setPage(1); }}
            onReleaseDateUntilChange={(value) => { setReleaseDateUntil(value); setPage(1); }}
            countryOptions={countryOptions}
            genreOptions={genreOptions}
            yearOptions={yearOptions}
            sortOptions={sortOptionList}
          />
        </div>
        <div className="search-bar">
          <input
            className="search-input"
            type="text"
            placeholder="Search TV shows..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
        </div>
        {loading ? (
          <div className="loading">Loading...</div>
        ) : (
          <>
            <div className="media-grid">
              {shows.map((show) => (
                <MediaCard key={show.id} item={show} mediaType="tv" />
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
