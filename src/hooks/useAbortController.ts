import { useRef, useEffect, useCallback } from 'react';

export function useAbortController() {
  const controllerRef = useRef<AbortController | null>(null);

  const getSignal = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return controllerRef.current.signal;
  }, []);

  const abort = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  return { getSignal, abort };
}
