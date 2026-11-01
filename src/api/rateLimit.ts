// Small fixed-window rate limiter for Vercel functions. State lives in the
// memory of one function instance, so it is best-effort: it slows a single
// client down but is not a global limit (instances do not share memory).
// For a real limit use Vercel's Firewall rate limiting rule on /api/*.

export interface RateLimiter {
  /** Returns true if this key may proceed, false if it is over the limit. */
  allow(key: string): boolean;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 5_000 } = options;
  const now = options.now ?? Date.now;
  const hits = new Map<string, { start: number; count: number }>();

  return {
    allow(key: string): boolean {
      const t = now();
      const entry = hits.get(key);
      if (!entry || t - entry.start >= windowMs) {
        hits.delete(key);
        hits.set(key, { start: t, count: 1 });
        // Bound memory: drop the oldest keys first.
        while (hits.size > maxKeys) {
          const oldest = hits.keys().next().value;
          if (oldest === undefined) break;
          hits.delete(oldest);
        }
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
  };
}

/** True for a browser request that another site initiated. */
export function isCrossSiteRequest(secFetchSite: string | undefined): boolean {
  return secFetchSite === 'cross-site';
}
