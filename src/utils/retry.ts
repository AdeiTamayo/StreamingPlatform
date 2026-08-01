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
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
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
