export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /**
   * Return false to give up immediately. The original error is rethrown
   * unwrapped (not as a RetryError) so callers can still inspect codes.
   * Defaults to `!isPermanentError(err)`.
   */
  shouldRetry?: (err: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry'>> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

// Postgres/PostgREST codes that will fail identically on every attempt:
// unique/not-null/FK violations, RLS denial, missing table/column, bad input.
const PERMANENT_PG_CODES = new Set([
  '23505', // unique_violation
  '23502', // not_null_violation
  '23503', // foreign_key_violation
  '23514', // check_violation
  '42501', // insufficient_privilege (RLS denial)
  '42P01', // undefined_table
  '42703', // undefined_column
  '22P02', // invalid_text_representation
]);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * True when retrying cannot change the outcome. Supabase resolves most query
 * failures as `{ error }` objects, so callers throw those inside the retried
 * callback - this is what keeps permanent errors from burning backoff time.
 */
export function isPermanentError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (typeof err === 'object' && err !== null && (err as { permanent?: unknown }).permanent === true) {
    return true;
  }
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' && PERMANENT_PG_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(delay, maxDelayMs);
  // Add +/-25% jitter so retrying clients don't all fire in lockstep.
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.round(capped * jitter);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.min(Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_OPTIONS.maxAttempts)), 10);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_OPTIONS.baseDelayMs;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs;
  const shouldRetry = options.shouldRetry ?? ((err: unknown) => !isPermanentError(err));

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Permanent failure: rethrow the original error unwrapped so callers
      // can match on its code (e.g. unique violations).
      if (!shouldRetry(err)) throw err;
      if (attempt === maxAttempts) {
        throw new RetryError(
          `Operation failed after ${maxAttempts} attempts`,
          attempt,
          err,
        );
      }
      const delay = calculateDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }

  throw new RetryError('Unreachable', maxAttempts, null);
}
