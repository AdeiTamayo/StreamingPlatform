import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMulti, searchMovies, searchTV, getPersonCredits } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import Pagination from '../components/Pagination';
import { getSearchHistory, addSearchHistory } from '../api/storage';
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
  }

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
        <form className={styles.searchForm} role="search" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="search"
            className={styles.searchInput}
            placeholder="Search movies, TV shows..."
            aria-label="Search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className={styles.searchSubmitBtn}>Search</button>
        </form>
        <div className={styles.searchTabs} aria-label="Search categories">
          {TABS.map((t) => (
            <button key={t.key} aria-pressed={tab === t.key} className={`${styles.searchTab} ${tab === t.key ? styles.active : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {!query && history.length > 0 && (
          <div className={styles.searchHistory}>
            <div className={styles.searchHistoryTitle}>Recent searches</div>
            <div className={styles.searchHistoryList}>
              {history.map((q) => (
                <button key={q} className={styles.searchHistoryItem} onClick={() => handleHistoryClick(q)}>{q}</button>
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
