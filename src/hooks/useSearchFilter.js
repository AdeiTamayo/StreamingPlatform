import { useState, useEffect, useRef } from 'react';

export default function useSearchFilter(fetchFn, deps = {}) {
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef(null);

  const { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil } = deps;

  useEffect(() => {
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => {
      setLoading(true);
      fetchFn(page, { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil })
        .then((data) => {
          setResults(data.results || []);
          setTotalPages(data.total_pages || 1);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, query?.trim() ? 400 : 0);
    return () => { if (searchRef.current) clearTimeout(searchRef.current); };
  }, [page, query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, fetchFn]);

  useEffect(() => { setPage(1); }, [query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil]);

  return { results, page, setPage, totalPages, loading };
}
