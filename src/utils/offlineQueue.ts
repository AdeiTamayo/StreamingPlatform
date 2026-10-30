import { requireSupabase } from '../lib/supabase';
import { logError } from './logger';
import { isPermanentError } from './retry';

const OFFLINE_QUEUE_KEY = 'supabase_offline_queue';
export { OFFLINE_QUEUE_KEY };
// Sized for a long offline session (marking several seasons watched queues one
// op per episode). ~250 bytes per op keeps this well inside the localStorage
// quota; if it is ever exceeded the loss is recorded, never silent.
const MAX_QUEUE_SIZE = 1000;
const MAX_OP_ATTEMPTS = 5;
const RETRY_INTERVAL_MS = 60_000;

// Persisted record of writes that were dropped without reaching the server
// (queue overflow, retries exhausted, or a permanent server rejection). While
// it is present the local library may hold rows the cloud never received, so
// the sign-in reconcile must not delete local data, and the UI warns the user.
// It is cleared only after a successful full re-upload (dataMigration.resync).
export const SYNC_DROPPED_KEY = 'supabase_sync_dropped';
export const SYNC_DROPPED_EVENT = 'streamflow:sync-dropped';

export interface DroppedMarker {
  count: number;
  lastAt: number;
}

export function getDroppedMarker(): DroppedMarker | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SYNC_DROPPED_KEY) || 'null');
    if (raw && typeof raw.count === 'number' && raw.count > 0) {
      return { count: raw.count, lastAt: typeof raw.lastAt === 'number' ? raw.lastAt : 0 };
    }
  } catch {
    // corrupt marker: fall through. Treat a present-but-unreadable value as
    // dirty rather than silently losing the warning.
    if (localStorage.getItem(SYNC_DROPPED_KEY)) return { count: 1, lastAt: 0 };
  }
  return null;
}

export function getDroppedCount(): number {
  return getDroppedMarker()?.count ?? 0;
}

export function clearDroppedMarker(): void {
  try {
    localStorage.removeItem(SYNC_DROPPED_KEY);
  } catch {
    // storage unavailable - nothing more to do
  }
}

function recordDropped(count: number): void {
  if (count <= 0) return;
  try {
    const prev = getDroppedCount();
    localStorage.setItem(
      SYNC_DROPPED_KEY,
      JSON.stringify({ count: prev + count, lastAt: Date.now() }),
    );
  } catch (err) {
    logError('offlineQueue.markDropped', err);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SYNC_DROPPED_EVENT, { detail: { count } }));
  }
}

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
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    // Only trust arrays - a hand-edited/imported non-array value would throw
    // on every push below.
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedOperation[]): void {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Appends an op to the queue. Never throws (quota/corruption are logged, not
 * propagated) and reports whether the op was actually persisted - callers that
 * treat "queued" as a fallback success path need to know when even that failed.
 */
export function enqueueWrite(table: string, method: QueuedOperation['method'], data: Record<string, unknown>): boolean {
  const queue = getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    table,
    method,
    data,
    timestamp: Date.now(),
    attempts: 0,
  });
  const overflow = Math.max(0, queue.length - MAX_QUEUE_SIZE);
  if (overflow > 0) queue.splice(0, overflow);
  try {
    saveQueue(queue);
  } catch (err) {
    logError('offlineQueue.enqueue', err);
    return false;
  }
  // Recorded only once the queue is saved, so a failed save is not reported as
  // both "not queued" and "dropped".
  if (overflow > 0) {
    logError('offlineQueue.overflow', { dropped: overflow });
    recordDropped(overflow);
  }
  return true;
}

// Tables dropped as local-only (settings, notifications). Ops queued for them
// before the upgrade can never succeed - drop them immediately instead of
// burning retry attempts.
const DROPPED_TABLES = new Set(['settings', 'notifications']);

// Minimal contract of the Supabase filter-builder chains used below. The
// table name is dynamic (a queued string), so the call site is asserted
// once at the boundary - everything downstream of that stays typed instead
// of `any`.
interface FilterChain extends Promise<{ data: unknown; error: { code?: string } | null }> {
  eq(column: string, value: unknown): FilterChain;
  is(column: string, value: unknown): FilterChain;
  ilike(column: string, value: unknown): FilterChain;
  in(column: string, value: unknown[]): FilterChain;
}

// 'done'      synced, or already in the desired state - remove from the queue.
// 'retry'     transient failure (offline, 5xx, timeout) - keep and try again.
// 'permanent' can never succeed (RLS denial, bad data, malformed op) - retrying
//             only burns attempts, so it is dropped immediately and recorded.
type OpOutcome = 'done' | 'retry' | 'permanent';

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

async function processOperation(op: QueuedOperation): Promise<OpOutcome> {
  try {
    if (DROPPED_TABLES.has(op.table)) return 'done';
    switch (op.method) {
      case 'insert':
      case 'upsert': {
        if (op.table === 'progress') {
          const d = op.data as Record<string, unknown>;
          if ((d.media_type !== 'movie' && d.media_type !== 'tv') || !Number.isFinite(Number(d.tmdb_id))) return 'done';
        }
        const { error } = await requireSupabase().from(op.table as never)[op.method](op.data as never);
        if (error) throw error;
        return 'done';
      }
      case 'update': {
        const { id, userId, ...rest } = op.data as Record<string, unknown>;
        if (id == null && userId == null) return 'permanent';
        let query = requireSupabase().from(op.table as never).update(rest as never) as unknown as FilterChain;
        if (id != null) {
          query = query.eq('id', id as string);
        } else if (userId != null) {
          query = query.eq('user_id', userId as string);
        }
        const { error } = await query;
        if (error) throw error;
        return 'done';
      }
      case 'delete': {
        const d = op.data as Record<string, unknown>;
        if (d.id == null && d.userId == null) return 'permanent';
        let query = requireSupabase().from(op.table as never).delete() as unknown as FilterChain;
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
          if (d.allTracks === true) {
            // Whole-title removal: delete every season/episode row too, so no
            // filters are added beyond user/media/tmdb_id.
          } else if (d.seriesOnly === true) {
            query = query.is('season', null).is('episode', null);
          } else if (op.table === 'watch_later' || op.table === 'progress') {
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
        return 'done';
      }
      default:
        return 'permanent';
    }
  } catch (err) {
    // Unique violation on a write: the row is already there, which is exactly
    // the state the op wanted. Retrying would fail identically five times.
    if ((op.method === 'insert' || op.method === 'upsert') && errorCode(err) === '23505') {
      return 'done';
    }
    return isPermanentError(err) ? 'permanent' : 'retry';
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
  // No session: replaying would fail RLS on every op and burn attempts until
  // they're permanently dropped. Leave the queue untouched - it syncs when
  // the owner signs back in.
  if (syncUserId == null) return;

  const queue = getQueue();
  if (queue.length === 0) return;

  // Ids this pass resolved (synced or permanently dropped). Anything else
  // enqueued concurrently keeps its place via the merge below.
  const resolved = new Set<string>();
  const attempts = new Map<string, number>();
  let dropped = 0;

  for (const op of queue) {
    // Never replay another user's writes under this session; leave them
    // queued without burning attempts.
    if (isForeignOp(op)) continue;
    const outcome = await processOperation(op);
    if (outcome === 'done') {
      resolved.add(op.id);
    } else if (outcome === 'permanent') {
      logError('offlineQueue.rejected', { table: op.table, method: op.method });
      resolved.add(op.id);
      dropped++;
    } else {
      const next = op.attempts + 1;
      if (next > MAX_OP_ATTEMPTS) {
        // Permanently dropping - log it so local/remote divergence is
        // visible instead of silent.
        logError('offlineQueue.drop', { table: op.table, method: op.method, attempts: next });
        resolved.add(op.id);
        dropped++;
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
  // One notification per pass, however many ops were dropped.
  recordDropped(dropped);
}

let syncInited = false;
let retryTimer: ReturnType<typeof setInterval> | undefined;
let onlineListener: (() => void) | undefined;

export function initOfflineQueueSync(): void {
  if (syncInited || typeof window === 'undefined') return;
  syncInited = true;
  onlineListener = () => {
    syncOfflineQueue().catch(() => {});
  };
  window.addEventListener('online', onlineListener);
  retryTimer = setInterval(() => {
    syncOfflineQueue().catch(() => {});
  }, RETRY_INTERVAL_MS);
}

/**
 * Stops the background retry loop and detaches the online listener. Safe to
 * call when sync was never initialised. Exists so tests (and any future
 * teardown path) do not leave a timer running for the life of the tab.
 */
export function disposeOfflineQueueSync(): void {
  if (onlineListener) {
    window.removeEventListener('online', onlineListener);
    onlineListener = undefined;
  }
  if (retryTimer !== undefined) {
    clearInterval(retryTimer);
    retryTimer = undefined;
  }
  syncInited = false;
}

export function getQueueSize(): number {
  return getQueue().length;
}

export function getPendingOperations(): QueuedOperation[] {
  return getQueue();
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
