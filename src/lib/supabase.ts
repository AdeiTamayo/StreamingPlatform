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
