import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchMulti } from '../api/tmdb';
import MediaCard from '../components/MediaCard';

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = `Search: ${query} - StreamFlow`; }, [query]);

  useEffect(() => {
    if (!query.trim()) return;
    setLoading(true);
    searchMulti(query, page)
      .then((data) => {
        setResults(data.results || []);
        setTotalPages(data.total_pages || 1);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [query, page]);

  useEffect(() => { setPage(1); }, [query]);

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Search Results for "{query}"</h2>
        {loading ? (
          <div className="loading">Searching...</div>
        ) : results.length === 0 ? (
          <div className="loading">No results found</div>
        ) : (
          <>
            <div className="media-grid">
              {results.filter((item) => item.media_type !== 'person').map((item) => (
                <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
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
