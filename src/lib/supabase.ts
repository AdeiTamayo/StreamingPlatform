import { createClient } from '@supabase/supabase-js';
import { RetryError } from '../utils/retry';
import type { Database } from '../types/database';

function createClientIfConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = createClientIfConfigured();

export function requireSupabase() {
  if (!supabase) {
    // Marked permanent: no amount of retrying will configure the client, so
    // withRetry must fail fast instead of burning backoff.
    throw Object.assign(
      new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'),
      { permanent: true },
    );
  }
  return supabase;
}

// PostgREST caps a response (Supabase default: 1,000 rows), so a plain
// select('*') silently truncates larger libraries. Callers that treat the
// result as the complete set (sync reconcile, backups) must page instead.
const PAGE_SIZE = 1000;
const MAX_PAGED_ROWS = 50_000;

interface PageResult<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

/**
 * Downloads every row by walking `.range()` pages. `fetchPage` must request an
 * exact count (`select('*', { count: 'exact' })`) and use a deterministic order
 * (a unique tiebreaker such as `id`), otherwise rows can repeat or be skipped
 * between pages. Offsets advance by the rows actually returned, so a server cap
 * smaller than PAGE_SIZE still yields the full set. Throws on any page error:
 * a partial result is never returned.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
  maxRows = MAX_PAGED_ROWS,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const res = await fetchPage(rows.length, rows.length + pageSize - 1);
    if (res.error) throw res.error;
    const page = res.data ?? [];
    rows.push(...page);
    if (page.length === 0) break;
    if (res.count != null) {
      if (rows.length >= res.count) break;
    } else if (page.length < pageSize) {
      break;
    }
    if (rows.length >= maxRows) throw new Error('Too many rows to download');
  }
  return rows;
}

// Postgres unique-violation (duplicate row). Repositories use it to tell
// "already exists" apart from real failures without resorting to `any`.
// Unwraps RetryError so it also works when the error came out of withRetry.
export function isUniqueViolation(err: unknown): boolean {
  const target =
    err instanceof RetryError && err.cause != null ? err.cause : err;
  return (
    typeof target === 'object' &&
    target !== null &&
    'code' in target &&
    (target as { code?: unknown }).code === '23505'
  );
}
