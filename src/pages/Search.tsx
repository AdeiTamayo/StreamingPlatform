import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { searchMulti, searchMovies, searchTV, getPersonCredits, getMovieGenres, getTVGenres, getCountries, getLanguages } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import Pagination from '../components/Pagination';
import PersonList from '../components/PersonList';
import DatePickerField from '../components/DatePickerField';
import NumberStepper from '../components/NumberStepper';
import TypeToggle from '../components/TypeToggle';
import type { PersonListPerson } from '../components/PersonList';
import { getSearchHistory, addSearchHistory, removeSearchHistory } from '../api/storage';
import { useAbortController } from '../hooks/useAbortController';
import type { TMDBMovie, TMDBSeries, TMDBPersonCredits, TMDBGenre, TMDBCountry, TMDBLanguage, FilterOption } from '../types';
import SearchBar, { SearchSelectField } from '../components/SearchBar';
import styles from './Search.module.css';

const TYPE_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

const MOVIE_SORT_OPTIONS: FilterOption[] = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'primary_release_date.desc', label: 'Release date (newest)' },
  { value: 'primary_release_date.asc', label: 'Release date (oldest)' },
  { value: 'original_title.asc', label: 'Title A–Z' },
];

const TV_SORT_OPTIONS: FilterOption[] = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'first_air_date.desc', label: 'Release date (newest)' },
  { value: 'first_air_date.asc', label: 'Release date (oldest)' },
  { value: 'original_name.asc', label: 'Title A–Z' },
];

const YEAR_OPTIONS: FilterOption[] = [
  { value: '', label: 'Any year' },
  ...Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => new Date().getFullYear() - i).map((y) => ({ value: String(y), label: String(y) })),
];

const PAGE_SIZE = 20;

function isPersonResult(item: unknown): item is { id: number; name: string } {
  const candidate = item as { media_type?: string; name?: unknown };
  return candidate.media_type === 'person' && typeof candidate.name === 'string';
}

function dateOf(item: TMDBMovie | TMDBSeries): string {
  return (item as TMDBMovie).release_date || (item as TMDBSeries).first_air_date || '';
}

function titleOf(item: TMDBMovie | TMDBSeries): string {
  return (item as TMDBMovie).title || (item as TMDBSeries).name || '';
}

function makeComparator(sortBy: string): (a: TMDBMovie | TMDBSeries, b: TMDBMovie | TMDBSeries) => number {
  switch (sortBy) {
    case 'popularity.desc': return (a, b) => (b.popularity || 0) - (a.popularity || 0);
    case 'vote_average.desc': return (a, b) => (b.vote_average || 0) - (a.vote_average || 0);
    case 'primary_release_date.desc':
    case 'first_air_date.desc': return (a, b) => dateOf(b).localeCompare(dateOf(a));
    case 'primary_release_date.asc':
    case 'first_air_date.asc': return (a, b) => dateOf(a).localeCompare(dateOf(b));
    case 'original_title.asc':
    case 'original_name.asc': return (a, b) => titleOf(a).localeCompare(titleOf(b));
    default: return () => 0;
  }
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const personId = searchParams.get('person') || '';
  const [input, setInput] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('all');
  const [results, setResults] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSugg, setActiveSugg] = useState(-1);
  const { getSignal } = useAbortController();

  // Browse-style filters, applied client-side to the search results.
  const [genresMovie, setGenresMovie] = useState<TMDBGenre[]>([]);
  const [genresTv, setGenresTv] = useState<TMDBGenre[]>([]);
  const [countries, setCountries] = useState<TMDBCountry[]>([]);
  const [languages, setLanguages] = useState<TMDBLanguage[]>([]);
  const [country, setCountry] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [releaseDateFrom, setReleaseDateFrom] = useState('');
  const [releaseDateUntil, setReleaseDateUntil] = useState('');
  const [language, setLanguage] = useState('');
  const [voteCount, setVoteCount] = useState('');
  const [voteInput, setVoteInput] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [pageHint, setPageHint] = useState('');

  useEffect(() => {
    if (personId) {
      document.title = query.trim()
        ? `Movies & TV featuring ${query.trim()} - StreamFlow`
        : 'Movies & TV shows - StreamFlow';
    } else if (query.trim()) {
      document.title = `Search: ${query.trim()} - StreamFlow`;
    } else {
      document.title = 'Search - StreamFlow';
    }
  }, [query, personId]);
  useEffect(() => { setHistory(getSearchHistory()); }, []);

  useEffect(() => {
    getMovieGenres().then((data: { genres: TMDBGenre[] }) => setGenresMovie(data.genres || [])).catch(() => {});
    getTVGenres().then((data: { genres: TMDBGenre[] }) => setGenresTv(data.genres || [])).catch(() => {});
    getCountries().then((data) => setCountries(data as TMDBCountry[])).catch(() => {});
    getLanguages().then((data) => setLanguages(data as TMDBLanguage[])).catch(() => {});
  }, []);

  // Debounce the min-votes input so typing doesn't re-filter on every key.
  useEffect(() => {
    const t = setTimeout(() => setVoteCount(voteInput.replace(/\D/g, '').slice(0, 6)), 400);
    return () => clearTimeout(t);
  }, [voteInput]);

  useEffect(() => {
    if (!personId) return;
    setPage(1);
    setLoading(true);
    setError(false);
    getPersonCredits(personId, getSignal())
      .then((data) => {
        const credits = data as TMDBPersonCredits;
        const cast = (credits.cast || []).filter((c) => c.media_type === 'movie' || c.media_type === 'tv');
        const crew = (credits.crew || []).filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && c.department === 'Directing');
        const combined = [...cast, ...crew].filter(
          (item, i, arr) => arr.findIndex((x) => x.id === item.id && x.media_type === item.media_type) === i,
        );
        setResults(combined as unknown as (TMDBMovie | TMDBSeries)[]);
        setTotalPages(1);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [personId, retryKey]);

  const lastFetchKey = useRef<string>('');
  useEffect(() => {
    if (personId) return;
    if (!query.trim()) {
      setResults([]);
      setTotalPages(1);
      return;
    }
    const fetchKey = `${query}|${tab}|${personId}`;
    if (fetchKey !== lastFetchKey.current) {
      lastFetchKey.current = fetchKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }
    setLoading(true);
    setError(false);
    const fetcher = tab === 'all' ? searchMulti : tab === 'movie' ? searchMovies : searchTV;
    fetcher(query, page, getSignal())
      .then((data) => {
        setResults(data.results || []);
        setTotalPages(data.total_pages || 1);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [personId, query, page, tab, retryKey]);

  useEffect(() => {
    if (personId) return;
    if (query.trim()) {
      addSearchHistory(query.trim());
      setHistory(getSearchHistory());
    }
  }, [query, personId]);

  useEffect(() => { setInput(query); }, [query]);

  useEffect(() => {
    if (!personId && !query.trim()) {
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    setPage(1);
  }, [country, genreFilter, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount]);

  function handleSubmit(value: string) {
    const q = value.trim();
    setSearchParams(q ? { q } : {});
  }

  function handleHistoryClick(q: string) {
    setSearchParams({ q });
    inputRef.current?.blur();
  }

  function handleRemoveHistory(q: string) {
    removeSearchHistory(q);
    setHistory(getSearchHistory());
  }

  function handleClearHistory() {
    history.forEach((q) => removeSearchHistory(q));
    setHistory(getSearchHistory());
  }

  const suggestions = (() => {
    const needle = input.trim().toLowerCase();
    const matches = needle
      ? history.filter((q) => q.toLowerCase().includes(needle))
      : history;
    return matches.slice(0, 7);
  })();
  const showSuggestions = searchFocused && suggestions.length > 0;

  useEffect(() => {
    setActiveSugg(-1);
  }, [input, searchFocused, history]);

  const recoverySearches = history
    .filter((q) => q.toLowerCase() !== query.trim().toLowerCase())
    .slice(0, 5);

  function handleSuggestKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSugg((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSugg((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeSugg >= 0 && activeSugg < suggestions.length) {
      e.preventDefault();
      handleHistoryClick(suggestions[activeSugg]);
    } else if (e.key === 'Delete' && activeSugg >= 0 && activeSugg < suggestions.length) {
      e.preventDefault();
      handleRemoveHistory(suggestions[activeSugg]);
    }
  }

  const people: PersonListPerson[] = !personId && tab === 'all'
    ? (results as unknown[]).filter(isPersonResult).map((p) => ({ id: p.id, name: p.name }))
    : [];
  const filteredMedia = personId
    ? tab === 'all'
      ? results
      : results.filter((item) => (item as { media_type?: string }).media_type === tab)
    : tab === 'all'
      ? results.filter((item) => (item as { media_type?: string }).media_type !== 'person')
      : results;

  const genreNames = Array.from(new Set([...genresMovie, ...genresTv].map((g) => g.name))).sort();
  const genreOptions: FilterOption[] = [{ value: '', label: 'All genres' }, ...genreNames.map((name) => ({ value: name, label: name }))];
  const countryOptions: FilterOption[] = [{ value: '', label: 'All countries' }, ...countries.map((c) => ({ value: c.iso_3166_1, label: c.english_name }))];
  const languageOptions: FilterOption[] = [{ value: '', label: 'Original language' }, ...languages.map((l) => ({ value: l.iso_639_1, label: l.english_name }))];
  const sortOptions = tab === 'tv' ? TV_SORT_OPTIONS : MOVIE_SORT_OPTIONS;
  const sortOptionList: FilterOption[] = [{ value: '', label: 'Sort by' }, ...sortOptions];

  const filtersActive = !!(country || genreFilter || year || sortBy || releaseDateFrom || releaseDateUntil || language || voteCount);

  function genreIdFor(name: string, mediaType: string): number | undefined {
    const list = mediaType === 'tv' ? genresTv : genresMovie;
    return list.find((g) => g.name === name)?.id;
  }

  const refinedMedia = (() => {
    if (!filtersActive) return filteredMedia;
    const list = filteredMedia.filter((item) => {
      const mt = (item as { media_type?: string }).media_type || tab;
      if (country && !(((item as { origin_country?: string[] }).origin_country) || []).includes(country)) return false;
      if (language && item.original_language !== language) return false;
      const date = dateOf(item);
      if (year && date.slice(0, 4) !== year) return false;
      if (releaseDateFrom && (!date || date < releaseDateFrom)) return false;
      if (releaseDateUntil && (!date || date > releaseDateUntil)) return false;
      if (voteCount && (item.vote_count || 0) < Number(voteCount)) return false;
      if (genreFilter) {
        const gid = genreIdFor(genreFilter, mt);
        if (gid == null || !(item.genre_ids || []).includes(gid)) return false;
      }
      return true;
    });
    if (sortBy) list.sort(makeComparator(sortBy));
    return list;
  })();

  const isEmpty = refinedMedia.length === 0 && people.length === 0;
  const refinedEmpty = refinedMedia.length === 0;
  const displayTotalPages = personId
    ? Math.max(1, Math.ceil(refinedMedia.length / PAGE_SIZE))
    : filtersActive && results.length > 0
      ? Math.max(1, Math.round(totalPages * (refinedMedia.length / results.length)))
      : totalPages;
  const safePage = Math.min(page, displayTotalPages);
  const visible = personId ? refinedMedia.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) : refinedMedia;

  useEffect(() => {
    if (personId || !filtersActive || loading || error) return;
    if (refinedEmpty && page > 1) {
      setPage(page - 1);
      setPageHint(`No matches on page ${page}. Showing an earlier page.`);
    } else if (pageHint && (!refinedEmpty || page === 1)) {
      setPageHint('');
    }
  }, [personId, filtersActive, loading, error, refinedEmpty, page, pageHint]);

  const activeFilters = [
    country ? { key: 'country', label: `Country: ${countryOptions.find((o) => o.value === country)?.label || country}` } : null,
    genreFilter ? { key: 'genre', label: `Genre: ${genreFilter}` } : null,
    year ? { key: 'year', label: `Year: ${year}` } : null,
    sortBy ? { key: 'sortBy', label: `Sort: ${sortOptionList.find((o) => o.value === sortBy)?.label || sortBy}` } : null,
    releaseDateFrom ? { key: 'from', label: `From: ${releaseDateFrom}` } : null,
    releaseDateUntil ? { key: 'until', label: `Until: ${releaseDateUntil}` } : null,
    language ? { key: 'language', label: `Language: ${languageOptions.find((o) => o.value === language)?.label || language}` } : null,
    voteCount ? { key: 'votes', label: `Min votes: ${voteCount}` } : null,
  ].filter((filter): filter is { key: string; label: string } => filter !== null);

  function removeFilter(key: string) {
    switch (key) {
      case 'country': setCountry(''); break;
      case 'genre': setGenreFilter(''); break;
      case 'year': setYear(''); break;
      case 'sortBy': setSortBy(''); break;
      case 'from': setReleaseDateFrom(''); break;
      case 'until': setReleaseDateUntil(''); break;
      case 'language': setLanguage(''); break;
      case 'votes': setVoteCount(''); setVoteInput(''); break;
      default: break;
    }
    setPage(1);
  }

  function clearFilters() {
    setCountry('');
    setGenreFilter('');
    setYear('');
    setSortBy('');
    setReleaseDateFrom('');
    setReleaseDateUntil('');
    setLanguage('');
    setVoteCount('');
    setVoteInput('');
    setPage(1);
  }

  const dateRangeInvalid = !!releaseDateFrom && !!releaseDateUntil && releaseDateFrom > releaseDateUntil;

  const suggestionsDropdown = showSuggestions ? (
    <div className={styles.searchSuggest}>
      <div className={styles.searchSuggestLabel} id="search-suggest-label">Recent searches</div>
      <div className={styles.searchSuggestBody}>
        <ul
          role="listbox"
          aria-labelledby="search-suggest-label"
          id="search-suggest-list"
          className={styles.searchSuggestList}
        >
          {suggestions.map((q, qi) => (
            <li
              key={q}
              role="option"
              id={`search-sugg-${qi}`}
              aria-selected={qi === activeSugg}
              className={`${styles.searchSuggestItem} ${qi === activeSugg ? styles.suggActive : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleHistoryClick(q)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15.5 14" />
              </svg>
              <span>{q}</span>
            </li>
          ))}
        </ul>
        <div className={styles.searchSuggestRemoveCol}>
          {suggestions.map((q) => (
            <button
              key={`remove-${q}`}
              type="button"
              className={styles.searchSuggestRemove}
              aria-label={`Remove "${q}" from search history`}
              title="Remove from history"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleRemoveHistory(q)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="page">
      <SearchBar
        query={input}
        onQueryChange={setInput}
        onSearch={handleSubmit}
        searchPlaceholder="Search movies, TV shows..."
        countryValue={country}
        onCountryChange={(value) => { setCountry(value); setPage(1); }}
        countryOptions={countryOptions}
        genreValue={genreFilter}
        onGenreChange={(value) => { setGenreFilter(value); setPage(1); }}
        genreOptions={genreOptions}
        sortValue={sortBy}
        onSortChange={(value) => { setSortBy(value); setPage(1); }}
        sortOptions={sortOptionList}
        showMore={showMore}
        onToggleShowMore={() => setShowMore((s) => !s)}
        activeFilters={activeFilters}
        onRemoveFilter={removeFilter}
        onClearFilters={clearFilters}
        isSearchContext={true}
        title={personId ? (query ? `Movies & TV featuring "${query}"` : 'Movies & TV shows') : query ? `Search Results for "${query}"` : 'Search'}
        subtitle="Discover something new"
        inputRef={inputRef}
        onInputFocus={() => setSearchFocused(true)}
        onInputBlur={() => setSearchFocused(false)}
        onInputKeyDown={handleSuggestKeyDown}
        combobox
        ariaExpanded={showSuggestions}
        ariaControls="search-suggest-list"
        ariaActiveDescendant={activeSugg >= 0 ? `search-sugg-${activeSugg}` : undefined}
        searchOverlay={suggestionsDropdown}
      >
        <div className="field">
          <span className="field-label">Release from</span>
          <DatePickerField label="From" value={releaseDateFrom} placeholder="Select start date" onChange={(value) => { setReleaseDateFrom(value); setPage(1); }} />
        </div>
        <div className="field">
          <span className="field-label">Release until</span>
          <DatePickerField label="Until" value={releaseDateUntil} placeholder="Select end date" onChange={(value) => { setReleaseDateUntil(value); setPage(1); }} />
        </div>
        <SearchSelectField label="Year" value={year} options={YEAR_OPTIONS} onChange={(value) => { setYear(value); setPage(1); }} />
        <SearchSelectField label="Language" value={language} options={languageOptions} onChange={(value) => { setLanguage(value); setPage(1); }} />
        <div className="field">
          <label className="field-label" htmlFor="search-min-votes">Minimum votes</label>
          <NumberStepper
            id="search-min-votes"
            label="minimum votes"
            value={voteInput}
            onChange={setVoteInput}
            step={100}
            placeholder="Any amount"
          />
        </div>
        {dateRangeInvalid && <p className="filter-error" role="alert">Start date must be on or before the end date.</p>}
      </SearchBar>

      {!(isEmpty && !loading && !error) && (
        <div className={styles.searchFilterHeader}>
          <TypeToggle
            value={tab}
            options={TYPE_TABS}
            onChange={(value) => { setTab(value); setPage(1); }}
            ariaLabel="Search categories"
          />
        </div>
      )}

      {!query && !searchFocused && history.length > 0 && (
        <div className={styles.searchHistory}>
          <div className={styles.searchHistoryHeader}>
            <div className={styles.searchHistoryTitle}>Recent searches</div>
            <button type="button" className={styles.searchHistoryClear} onClick={handleClearHistory}>Clear all</button>
          </div>
          <div className={styles.searchHistoryList}>
            {history.map((q) => (
              <span key={q} className={styles.searchHistoryChip}>
                <button type="button" className={styles.searchHistoryLabel} onClick={() => handleHistoryClick(q)}>{q}</button>
                <button
                  type="button"
                  className={styles.searchHistoryRemove}
                  aria-label={`Remove "${q}" from search history`}
                  title="Remove from history"
                  onClick={() => handleRemoveHistory(q)}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {pageHint && <p className="page-hint" role="status">{pageHint}</p>}
      {error ? (
        <div className="empty-state" role="alert">
          <h3>Search failed</h3>
          <p>Check your connection and try again.</p>
          <div className="empty-state-actions">
            <button type="button" className={styles.searchRetry} onClick={() => setRetryKey((n) => n + 1)}>
              Retry
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className={styles.searchStatus} role="status">Searching...</div>
      ) : !personId && !query.trim() ? (
        <div className={styles.searchStatus}>Type above to search movies and TV shows</div>
      ) : isEmpty ? (
        filtersActive && results.length > 0 ? (
          <div className="empty-state" role="status">
            <h3>No matches for these filters</h3>
            <p>Try removing a filter or widening the search.</p>
            <div className="empty-state-actions">
              <button type="button" className="empty-state-action" onClick={clearFilters}>Clear filters</button>
            </div>
          </div>
        ) : (
          <div className={styles.noResults}>
            <span className={styles.noResultsIcon} aria-hidden="true">
              <svg
                width="30"
                height="30"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" />
              </svg>
            </span>
            <div className={styles.noResultsEyebrow}>Search complete</div>
            <h3 className={styles.noResultsTitle}>
              {personId ? (
                'No credits found'
              ) : (
                <>
                  No results for{' '}
                  <span className={styles.noResultsQuery}>
                    &ldquo;{query}&rdquo;
                  </span>
                </>
              )}
            </h3>
            <p className={styles.noResultsText}>
              {personId
                ? 'Try a different person or explore one of these starting points.'
                : 'Try a different title, check the spelling, or explore one of these starting points.'}
            </p>
            <div className={styles.noResultsActions}>
              <Link
                to="/"
                className={`${styles.noResultsAction} ${styles.noResultsActionPrimary}`}
              >
                Browse Trending
              </Link>
              <Link to="/movies" className={styles.noResultsAction}>
                Movies
              </Link>
              <Link to="/tv" className={styles.noResultsAction}>
                TV Shows
              </Link>
            </div>
            {recoverySearches.length > 0 && (
              <div className={styles.searchRecovery}>
                <div className={styles.searchRecoveryHead}>
                  <div className={styles.searchRecoveryTitle}>
                    Recent searches
                  </div>
                  <button
                    type="button"
                    className={styles.searchRecoveryClear}
                    onClick={handleClearHistory}
                  >
                    Clear history
                  </button>
                </div>
                <ul className={styles.searchRecoveryList}>
                  {recoverySearches.map((q) => (
                    <li key={q} className={styles.searchRecoveryRow}>
                      <button
                        type="button"
                        className={styles.searchRecoveryLabel}
                        onClick={() => handleHistoryClick(q)}
                        title={`Search again for "${q}"`}
                      >
                        <svg
                          className={styles.searchRecoveryIcon}
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>{q}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.searchRecoveryRemove}
                        aria-label={`Remove "${q}" from search history`}
                        title="Remove from history"
                        onClick={() => handleRemoveHistory(q)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      ) : (
        <>
          {visible.length > 0 && (
            <div className="media-grid">
              {visible.map((item) => (
                <MediaCard key={`${(item as { media_type?: string }).media_type || tab}-${item.id}`} item={item} mediaType={tab !== 'all' ? tab as 'movie' | 'tv' : undefined} />
              ))}
            </div>
          )}
          {people.length > 0 && (
            <div className={styles.searchPeople}>
              <h3 className={styles.searchPeopleTitle}>People</h3>
              <PersonList people={people} />
            </div>
          )}
          {displayTotalPages > 1 && (
            <Pagination
              page={safePage}
              totalPages={displayTotalPages}
              onChange={setPage}
              label={`Page ${safePage} of ${displayTotalPages}`}
            />
          )}
        </>
      )}
    </div>
  );
}
