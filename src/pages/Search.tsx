import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMulti, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getSearchHistory, addSearchHistory } from '../api/storage';
import { useAbortController } from '../hooks/useAbortController';
import type { TMDBMovie, TMDBSeries } from '../types';
import styles from './Search.module.css';

const TABS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV Shows' },
];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
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
  }, [query, page, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [query, tab]);

  useEffect(() => {
    if (query.trim()) {
      addSearchHistory(query.trim());
      setHistory(getSearchHistory());
    }
  }, [query]);

  function handleHistoryClick(q: string) {
    setSearchParams({ q });
  }

  const filtered = tab === 'all'
    ? results.filter((item) => (item as { media_type?: string }).media_type !== 'person')
    : results;

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Search Results for "{query}"</h2>
        <div className={styles.searchTabs} role="tablist" aria-label="Search categories">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={`${styles.searchTab} ${tab === t.key ? styles.active : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
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
              {filtered.map((item) => (
                <MediaCard key={`${(item as { media_type?: string }).media_type || tab}-${item.id}`} item={item} mediaType={tab !== 'all' ? tab as 'movie' | 'tv' : undefined} />
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
