import { getTVDetail } from './tmdb';
import type { TMDBSeries } from '../types';

export interface TVStatus {
  ended: boolean;
  endYear: string | null;
}

const STATUS_MAX = 100;
const FETCH_TIMEOUT_MS = 8000;

const statusMap = new Map<number, TVStatus>();
const fetching = new Set<number>();
const listeners = new Map<number, Set<() => void>>();

export function subscribe(id: number, fn: () => void) {
  let set = listeners.get(id);
  if (!set) {
    set = new Set();
    listeners.set(id, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(id);
  };
}

function notify(id: number) {
  listeners.get(id)?.forEach((fn) => fn());
}

export function getStatus(id: number): TVStatus | undefined {
  return statusMap.get(id);
}

function remember(id: number, status: TVStatus) {
  statusMap.set(id, status);
  // LRU eviction - Map keeps insertion order, so evicting the first key
  // drops the least recently added entry.
  if (statusMap.size > STATUS_MAX) {
    const oldest = statusMap.keys().next().value;
    if (oldest !== undefined) statusMap.delete(oldest);
  }
}

export async function fetchTVStatus(id: number) {
  if (id <= 0 || statusMap.has(id) || fetching.has(id)) return;
  fetching.add(id);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Reuses the TMDB client so v3 keys and v4 Bearer tokens both work.
    const data = await getTVDetail(id, controller.signal);
    const series = data as TMDBSeries;
    if (series.status) {
      remember(id, {
        ended: series.status === 'Ended',
        endYear: series.last_air_date?.slice(0, 4) || null,
      });
      notify(id);
    }
  } catch {
    // Silently ignore fetch errors (including timeouts/aborts)
  } finally {
    clearTimeout(timeout);
    fetching.delete(id);
  }
}
