import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMulti, searchMovies, searchTV } from '../api/tmdb';
import MediaCard from '../components/MediaCard';
import { getSearchHistory, addSearchHistory } from '../api/storage';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV Shows' },
];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [tab, setTab] = useState('all');
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => { document.title = `Search: ${query} - StreamFlow`; }, [query]);
  useEffect(() => { setHistory(getSearchHistory()); }, []);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    const fetcher = tab === 'all' ? searchMulti : tab === 'movie' ? searchMovies : searchTV;
    fetcher(query, page)
      .then((data) => {
        setResults(data.results || []);
        setTotalPages(data.total_pages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query, page, tab]);

  useEffect(() => { setPage(1); }, [query, tab]);

  useEffect(() => {
    if (query.trim()) {
      addSearchHistory(query.trim());
      setHistory(getSearchHistory());
    }
  }, [query]);

  function handleHistoryClick(q) {
    setSearchParams({ q });
  }

  const filtered = tab === 'all'
    ? results.filter((item) => item.media_type !== 'person')
    : results;

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Search Results for "{query}"</h2>
        <div className="search-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`search-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        {!query && history.length > 0 && (
          <div className="search-history">
            <div className="search-history-title">Recent searches</div>
            <div className="search-history-list">
              {history.map((q) => (
                <button key={q} className="search-history-item" onClick={() => handleHistoryClick(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <div className="loading">Searching...</div>
        ) : filtered.length === 0 ? (
          <div className="loading">No results found</div>
        ) : (
          <>
            <div className="media-grid">
              {filtered.map((item) => (
                <MediaCard key={`${item.media_type || tab}-${item.id}`} item={item} mediaType={tab !== 'all' ? tab : undefined} />
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
