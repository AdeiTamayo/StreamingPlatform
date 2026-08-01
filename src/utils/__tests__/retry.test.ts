import { describe, expect, it, vi } from 'vitest';
import { withRetry, RetryError } from '../retry';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries until the call succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws RetryError with attempt count after exhausting attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const err = await withRetry(fn, { baseDelayMs: 1, maxAttempts: 3 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RetryError);
    expect((err as RetryError).attempts).toBe(3);
    expect((err as RetryError).cause).toBeInstanceOf(Error);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('clamps maxAttempts to the 1-10 range', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await withRetry(fn, { baseDelayMs: 1, maxAttempts: 99 }).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(10);

    const fn2 = vi.fn().mockRejectedValue(new Error('boom'));
    await withRetry(fn2, { baseDelayMs: 1, maxAttempts: 0 }).catch(() => {});
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});
