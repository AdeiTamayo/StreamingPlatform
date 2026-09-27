import { requireSupabase } from '../lib/supabase';
import { logError } from './logger';

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

// Tables dropped as local-only (progress, settings by migration 003,
// notifications by 004). Ops queued for them before the upgrade can never
// succeed - drop them immediately instead of burning retry attempts.
const DROPPED_TABLES = new Set(['progress', 'settings', 'notifications']);

async function processOperation(op: QueuedOperation): Promise<boolean> {
  try {
    if (DROPPED_TABLES.has(op.table)) return true;
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
          if (d.query != null) {
            // Single search-history removal - match case-insensitively like
            // the repository does, with LIKE wildcards escaped.
            const escaped = String(d.query).replace(/[\\%_]/g, (m) => `\\${m}`);
            query = query.ilike('query', escaped);
          }
          if (d.seriesOnly === true) {
            query = query.is('season', null).is('episode', null);
          } else if (op.table === 'watch_later') {
            // Series/movie-level rows have season/episode null; per-episode
            // rows have both set. Isolating them keeps removing a series
            // from Watch Later from wiping its saved episodes (and vice versa).
            if (d.season != null) query = query.eq('season', d.season as number);
            else query = query.is('season', null);
            if (d.episode != null) query = query.eq('episode', d.episode as number);
            else query = query.is('episode', null);
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

// The user the queue is currently syncing as. Set from the storage layer
// (importing storage here would create a module cycle). Ops stamped with a
// different user_id are left untouched so one user's pending writes are never
// replayed under another session - they sync when their owner signs back in.
let syncUserId: string | null = null;

export function setSyncUserId(userId: string | null): void {
  syncUserId = userId;
}

function isForeignOp(op: QueuedOperation): boolean {
  const owner = op.data.user_id ?? op.data.userId;
  return typeof owner === 'string' && syncUserId != null && owner !== syncUserId;
}

let syncRunning = false;
let syncRequested = false;

export async function syncOfflineQueue(): Promise<void> {
  // Coalesce concurrent triggers (login + online event + interval) instead
  // of replaying the same ops twice.
  if (syncRunning) {
    syncRequested = true;
    return;
  }
  syncRunning = true;
  try {
    do {
      syncRequested = false;
      await runSyncPass();
    } while (syncRequested);
  } finally {
    syncRunning = false;
  }
}

async function runSyncPass(): Promise<void> {
  const queue = getQueue();
  if (queue.length === 0) return;

  // Ids this pass resolved (synced or permanently dropped). Anything else
  // enqueued concurrently keeps its place via the merge below.
  const resolved = new Set<string>();
  const attempts = new Map<string, number>();

  for (const op of queue) {
    // Never replay another user's writes under this session; leave them
    // queued without burning attempts.
    if (isForeignOp(op)) continue;
    const success = await processOperation(op);
    if (success) {
      resolved.add(op.id);
    } else {
      const next = op.attempts + 1;
      if (next > MAX_OP_ATTEMPTS) {
        // Permanently dropping - log it so local/remote divergence is
        // visible instead of silent.
        logError('offlineQueue.drop', { table: op.table, method: op.method, attempts: next } as unknown as Error);
        resolved.add(op.id);
      } else {
        attempts.set(op.id, next);
      }
    }
  }

  // Merge, don't overwrite: ops enqueued while this pass was awaiting the
  // network must survive. Failed ops keep their bumped attempt counts.
  const current = getQueue();
  const merged: QueuedOperation[] = [];
  for (const op of current) {
    if (resolved.has(op.id)) continue;
    const next = attempts.get(op.id);
    if (next != null) op.attempts = next;
    merged.push(op);
  }

  try {
    saveQueue(merged);
  } catch {
    // Queue write failed (e.g. quota) - in-memory attempt bumps are lost and
    // the next pass retries from the persisted state.
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
