import { useState, useEffect, useRef } from 'react';

export default function useSearchFilter(fetchFn, deps = {}) {
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef(null);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil } = deps;
  const filterKey = `${query}||${genre}||${country}||${year}||${sortBy}||${releaseDateFrom}||${releaseDateUntil}`;
  const prevFilterKey = useRef(filterKey);

  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      prevFilterKey.current = filterKey;
      setPage(1);
      return;
    }
  }, [filterKey]);

  useEffect(() => {
    if (fetchRef.current) clearTimeout(fetchRef.current);
    fetchRef.current = setTimeout(() => {
      setLoading(true);
      fetchFnRef.current(page, { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil })
        .then((data) => {
          setResults(data.results || []);
          setTotalPages(data.total_pages || 1);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    }, query?.trim() ? 400 : 0);
    return () => { if (fetchRef.current) clearTimeout(fetchRef.current); };
  }, [page, filterKey]);

  return { results, page, setPage, totalPages, loading };
}
