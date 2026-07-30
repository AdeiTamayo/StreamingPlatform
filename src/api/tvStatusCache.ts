import CONFIG from '../config';
import { getCached, setCache } from './tmdbCache';
import type { TMDBSeries } from '../types';

export interface TVStatus {
  ended: boolean;
  endYear: string | null;
}

const statusMap = new Map<number, TVStatus>();
const fetching = new Set<number>();
const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function getStatus(id: number): TVStatus | undefined {
  return statusMap.get(id);
}

export async function fetchTVStatus(id: number) {
  if (id <= 0 || statusMap.has(id) || fetching.has(id)) return;
  fetching.add(id);
  try {
    const url = `${CONFIG.TMDB_BASE_URL}/tv/${id}?api_key=${CONFIG.TMDB_API_KEY}`;
    let data = await getCached(url);
    if (!data) {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      data = await res.json();
      await setCache(url, data);
    }
    const series = data as TMDBSeries;
    if (series.status) {
      statusMap.set(id, {
        ended: series.status === 'Ended',
        endYear: series.last_air_date?.slice(0, 4) || null,
      });
      notify();
    }
  } catch {
    // Silently ignore fetch errors
  } finally {
    fetching.delete(id);
  }
}
