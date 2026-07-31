import { requireSupabase } from '../lib/supabase';

const OFFLINE_QUEUE_KEY = 'supabase_offline_queue';

export interface QueuedOperation {
  id: string;
  table: string;
  method: 'insert' | 'update' | 'upsert' | 'delete';
  data: Record<string, unknown>;
  timestamp: number;
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
  });
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
        const { id, ...rest } = op.data;
        const { error } = await requireSupabase()
          .from(op.table as never)
          .update(rest as never)
          .eq('id', id as string);
        if (error) throw error;
        return true;
      }
      case 'delete': {
        const d = op.data as Record<string, unknown>;
        let query: any = requireSupabase().from(op.table as never).delete();
        if (d.id != null) {
          query = query.eq('id', d.id as string);
        } else if (d.userId != null) {
          query = query
            .eq('user_id', d.userId as string)
            .eq('media_type', d.mediaType as string)
            .eq('tmdb_id', d.tmdbId as number);
          if (d.mediaType === 'tv') {
            if (d.season != null) query = query.eq('season', d.season as number);
            if (d.episode != null) query = query.eq('episode', d.episode as number);
          }
        } else {
          return false;
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
      remaining.push(op);
    }
  }

  saveQueue(remaining);
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
