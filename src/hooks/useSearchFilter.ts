import { useState, useEffect, useRef } from 'react';
import { useAbortController } from './useAbortController';
import type { TMDBPaginatedResponse, TMDBMovie, TMDBSeries } from '../types';

type FetchFn = (page: number, filters: Record<string, string | undefined>, signal: AbortSignal) => Promise<TMDBPaginatedResponse<TMDBMovie | TMDBSeries>>;

export default function useSearchFilter(fetchFn: FetchFn, deps: Record<string, string> = {}) {
  const [results, setResults] = useState<(TMDBMovie | TMDBSeries)[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const fetchRef = useRef<ReturnType<typeof setTimeout>>(null);
  const requestIdRef = useRef(0);
  const fetchFnRef = useRef<FetchFn>(fetchFn);
  fetchFnRef.current = fetchFn;
  const { getSignal } = useAbortController();

  const { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount } = deps;
  const filterKey = `${query}||${genre}||${country}||${year}||${sortBy}||${releaseDateFrom}||${releaseDateUntil}||${language}||${voteCount}`;
  const prevFilterKey = useRef(filterKey);

  useEffect(() => {
    if (filterKey !== prevFilterKey.current) {
      prevFilterKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey]);

  useEffect(() => {
    if (fetchRef.current) clearTimeout(fetchRef.current);
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(false);
    // Abort any still-in-flight request immediately so a slow old-filter
    // response can never overwrite the newer results.
    getSignal();
    fetchRef.current = setTimeout(() => {
      fetchFnRef.current(page, { query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount }, getSignal())
        .then((data) => {
          if (requestId !== requestIdRef.current) return;
          setResults(data.results || []);
          setTotalPages(data.total_pages || 1);
        })
        .catch((err: Error) => {
          if (err?.name === 'AbortError') return;
          if (requestId !== requestIdRef.current) return;
          setError(true);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
    }, query?.trim() ? 400 : 0);
    return () => { if (fetchRef.current) clearTimeout(fetchRef.current); };
  }, [page, filterKey, query, genre, country, year, sortBy, releaseDateFrom, releaseDateUntil, language, voteCount, getSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return { results, page, setPage, totalPages, loading, error };
}
