import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { subscribe, getStatus, fetchTVStatus } from '../api/tvStatusCache';

export function useTVStatus(id: number) {
  useEffect(() => {
    fetchTVStatus(id);
  }, [id]);

  return useSyncExternalStore(subscribe, () => (id > 0 ? getStatus(id) : undefined));
}
