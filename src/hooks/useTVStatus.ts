import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { subscribe, getStatus, fetchTVStatus } from '../api/tvStatusCache';

export function useTVStatus(id: number) {
  useEffect(() => {
    fetchTVStatus(id);
  }, [id]);

  // Only re-render when this id's status actually changes.
  return useSyncExternalStore(
    (onStoreChange) => subscribe(id, onStoreChange),
    () => (id > 0 ? getStatus(id) : undefined),
  );
}
