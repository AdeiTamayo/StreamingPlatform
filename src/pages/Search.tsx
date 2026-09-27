import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMulti, searchMovies, searchTV, getPersonCredits } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import Pagination from '../components/Pagination';
import { getSearchHistory, addSearchHistory, removeSearchHistory } from '../api/storage';
import { useAbortController } from '../hooks/useAbortController';
import type { TMDBMovie, TMDBSeries, TMDBPersonCredits } from '../types';
import styles from './Search.module.css';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV Shows' },
];

// TMDB pages are 20 items; person credits use the same page size client-side.
const PAGE_SIZE = 20;

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
  const [history, setHistory] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const { getSignal } = useAbortController();

  useEffect(() => { document.title = `Search: ${query} - StreamFlow`; }, [query]);
  useEffect(() => { setHistory(getSearchHistory()); }, []);

  useEffect(() => {
    if (!personId) return;
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
  }, [personId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (personId) return; // person credits are owned by the personId effect
    if (!query.trim()) {
      setResults([]);
      setTotalPages(1);
      return;
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
  }, [personId, query, page, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [query, tab, personId]);

  useEffect(() => {
    if (personId) return;
    if (query.trim()) {
      addSearchHistory(query.trim());
      setHistory(getSearchHistory());
    }
  }, [query, personId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setInput(query); }, [query]);

  useEffect(() => {
    if (!personId && !query.trim()) {
      inputRef.current?.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = input.trim();
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

  // Suggestions shown while the search bar is focused: the most recent
  // searches, filtered by what is typed. Capped so the dropdown stays small.
  const suggestions = (() => {
    const needle = input.trim().toLowerCase();
    const matches = needle
      ? history.filter((q) => q.toLowerCase().includes(needle))
      : history;
    return matches.slice(0, 7);
  })();
  const showSuggestions = searchFocused && suggestions.length > 0;

  const filtered = personId
    ? tab === 'all'
      ? results
      : results.filter((item) => (item as { media_type?: string }).media_type === tab)
    : tab === 'all'
      ? results.filter((item) => (item as { media_type?: string }).media_type !== 'person')
      : results;
  // Person credits come back unpaginated - slice them client-side to match
  // the page size the query search gets from TMDB.
  const displayTotalPages = personId ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : totalPages;
  const safePage = Math.min(page, displayTotalPages);
  const visible = personId ? filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE) : filtered;

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">{personId ? `Movies & TV featuring "${query}"` : query ? `Search Results for "${query}"` : 'Search'}</h2>
        <div className={styles.searchBoxWrap}>
          <form className={styles.searchForm} role="search" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="search"
              className={styles.searchInput}
              placeholder="Search movies, TV shows..."
              aria-label="Search"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            <button type="submit" className={styles.searchSubmitBtn}>Search</button>
          </form>
          {showSuggestions && (
            <div className={styles.searchSuggest} role="listbox" aria-label="Recent searches">
              <div className={styles.searchSuggestLabel}>Recent searches</div>
              {suggestions.map((q) => (
                <div key={q} className={styles.searchSuggestRow}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className={styles.searchSuggestItem}
                    // mousedown fires before blur: prevent the default so the
                    // input keeps focus and the click is not swallowed.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleHistoryClick(q)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15.5 14" />
                    </svg>
                    <span>{q}</span>
                  </button>
                  <button
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
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.searchTabs} aria-label="Search categories">
          {TABS.map((t) => (
            <button key={t.key} aria-pressed={tab === t.key} className={`${styles.searchTab} ${tab === t.key ? styles.active : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {!query && !searchFocused && history.length > 0 && (
          <div className={styles.searchHistory}>
            <div className={styles.searchHistoryTitle}>Recent searches</div>
            <div className={styles.searchHistoryList}>
              {history.map((q) => (
                <span key={q} className={styles.searchHistoryChip}>
                  <button className={styles.searchHistoryLabel} onClick={() => handleHistoryClick(q)}>{q}</button>
                  <button
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
        {error ? (
          <div className="loading" role="alert">Search failed. Check your connection.</div>
        ) : loading ? (
          <div className="loading" role="status">Searching...</div>
        ) : filtered.length === 0 ? (
          <div className="loading" role="status">No results found</div>
        ) : (
          <>
            <div className="media-grid">
              {visible.map((item) => (
                <MediaCard key={`${(item as { media_type?: string }).media_type || tab}-${item.id}`} item={item} mediaType={tab !== 'all' ? tab as 'movie' | 'tv' : undefined} />
              ))}
            </div>
            {displayTotalPages > 1 && (
              <Pagination
                page={safePage}
                totalPages={displayTotalPages}
                onChange={setPage}
                label={`Page ${safePage} of ${displayTotalPages}${filtered.length === 0 && results.length > 0 ? ' (no results on this page)' : ''}`}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
