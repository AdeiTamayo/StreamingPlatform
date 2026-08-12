import { requireSupabase } from '../lib/supabase';

const OFFLINE_QUEUE_KEY = 'supabase_offline_queue';
export { OFFLINE_QUEUE_KEY };
const MAX_QUEUE_SIZE = 200;
const MAX_OP_ATTEMPTS = 5;
const RETRY_INTERVAL_MS = 60_000;

export interface QueuedOperation {
  id: string;
  table: string;
  method: 'insert' | 'update' | 'upsert' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
  attempts: number;
}

function getQueue(): QueuedOperation[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedOperation[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueWrite(table: string, method: QueuedOperation['method'], data: Record<string, unknown>): void {
  const queue = getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    table,
    method,
    data,
    timestamp: Date.now(),
    attempts: 0,
  });
  if (queue.length > MAX_QUEUE_SIZE) {
    queue.splice(0, queue.length - MAX_QUEUE_SIZE);
  }
  saveQueue(queue);
}

async function processOperation(op: QueuedOperation): Promise<boolean> {
  try {
    switch (op.method) {
      case 'insert':
      case 'upsert': {
        const { error } = await requireSupabase().from(op.table as never)[op.method](op.data as never);
        if (error) throw error;
        return true;
      }
      case 'update': {
        const { id, userId, ...rest } = op.data as Record<string, unknown>;
        if (id == null && userId == null) return false;
        let query: any = requireSupabase().from(op.table as never).update(rest as never);
        if (id != null) {
          query = query.eq('id', id as string);
        } else if (userId != null) {
          query = query.eq('user_id', userId as string);
        }
        const { error } = await query;
        if (error) throw error;
        return true;
      }
      case 'delete': {
        const d = op.data as Record<string, unknown>;
        if (d.id == null && d.userId == null) return false;
        let query: any = requireSupabase().from(op.table as never).delete();
        if (d.id != null) {
          query = query.eq('id', d.id as string);
        } else {
          query = query.eq('user_id', d.userId as string);
          if (d.mediaType != null) query = query.eq('media_type', d.mediaType as string);
          if (d.tmdbId != null) query = query.eq('tmdb_id', d.tmdbId as number);
          if (d.seriesOnly === true) {
            query = query.is('season', null).is('episode', null);
          } else if (d.mediaType === 'tv' || d.season != null) {
            if (d.season != null) query = query.eq('season', d.season as number);
            if (d.episode != null) query = query.eq('episode', d.episode as number);
          }
        }
        const { error } = await query;
        if (error) throw error;
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

export async function syncOfflineQueue(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    const success = await processOperation(op);
    if (!success) {
      op.attempts += 1;
      if (op.attempts <= MAX_OP_ATTEMPTS) {
        remaining.push(op);
      }
    }
  }

  try {
    saveQueue(remaining);
  } catch {
    // Queue write failed (e.g. quota) - leave the previous queue intact
  }
}

let syncInited = false;

export function initOfflineQueueSync(): void {
  if (syncInited || typeof window === 'undefined') return;
  syncInited = true;
  window.addEventListener('online', () => {
    syncOfflineQueue().catch(() => {});
  });
  setInterval(() => {
    syncOfflineQueue().catch(() => {});
  }, RETRY_INTERVAL_MS);
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
