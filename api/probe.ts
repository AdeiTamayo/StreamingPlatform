import { handleProbeQuery } from '../src/api/providerProbeCore.js';
import { createRateLimiter, isCrossSiteRequest } from '../src/api/rateLimit.js';

type HeaderValue = string | string[] | undefined;

type ProbeRequest = {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  headers?: Record<string, HeaderValue>;
};

type ProbeResponse = {
  status: (code: number) => ProbeResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

const first = (value: HeaderValue) => (Array.isArray(value) ? value[0] : value);

// Per-instance and best-effort; see src/api/rateLimit.ts.
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

function clientKey(headers: ProbeRequest['headers']): string {
  const forwarded = first(headers?.['x-forwarded-for']);
  return forwarded?.split(',')[0].trim() || first(headers?.['x-real-ip']) || 'unknown';
}

export default async function handler(req: ProbeRequest, res: ProbeResponse) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // The app calls this from its own origin; another site's page has no reason
  // to make visitors' browsers hit it.
  if (isCrossSiteRequest(first(req.headers?.['sec-fetch-site']))) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  if (!limiter.allow(clientKey(req.headers))) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const result = await handleProbeQuery(req.query ?? {});
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=600');
  res.status(200).json(result);
}
