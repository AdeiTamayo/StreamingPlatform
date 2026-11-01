// Server-side logic for GET /api/omdb. The OMDb key lives only in the server
// environment (OMDB_API_KEY, no VITE_ prefix) and is injected by the wrapper
// (api/omdb.ts); this file never reads process.env, so it can be unit tested
// and is safe from the browser bundle. The browser sends only a validated
// query; the key never leaves the server.

export type OmdbMediaType = 'movie' | 'series' | 'episode';

export interface OmdbQuery {
  i?: string;
  t?: string;
  y?: string;
  type?: string;
}

export interface OmdbResponse {
  status: number;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface OmdbDeps {
  apiKey: string | undefined;
  fetch?: typeof fetch;
  logError?: (context: string, err: unknown) => void;
}

const OMDB_TIMEOUT_MS = 6_000;
// A rating changes slowly; let the CDN absorb repeat lookups and protect the
// free-tier daily quota.
const SUCCESS_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
const MISS_CACHE = 'public, max-age=600, s-maxage=3600';

const TYPES: readonly string[] = ['movie', 'series', 'episode'];
const IMDB_ID = /^tt\d{1,10}$/;
const YEAR = /^\d{4}$/;
const MAX_TITLE_LENGTH = 200;

function respond(
  status: number,
  body: Record<string, unknown>,
  cache = 'no-store',
): OmdbResponse {
  return { status, headers: { 'Cache-Control': cache }, body };
}

/** The only fields the app reads; everything else OMDb returns is dropped. */
function pick(data: Record<string, unknown>): Record<string, unknown> {
  const ratings = Array.isArray(data.Ratings)
    ? (data.Ratings as { Source?: unknown; Value?: unknown }[])
        .filter((r) => r?.Source === 'Rotten Tomatoes' && typeof r.Value === 'string')
        .map((r) => ({ Source: 'Rotten Tomatoes', Value: r.Value }))
    : [];
  return {
    imdbRating: typeof data.imdbRating === 'string' ? data.imdbRating : undefined,
    imdbVotes: typeof data.imdbVotes === 'string' ? data.imdbVotes : undefined,
    Ratings: ratings,
  };
}

export async function handleOmdbQuery(query: OmdbQuery, deps: OmdbDeps): Promise<OmdbResponse> {
  const logError = deps.logError ?? (() => {});
  const doFetch = deps.fetch ?? fetch;

  if (!deps.apiKey) return respond(503, { error: 'not_configured' });

  if (!query.type || !TYPES.includes(query.type)) return respond(400, { error: 'bad_request' });

  const params = new URLSearchParams({ type: query.type });
  if (query.i !== undefined) {
    if (!IMDB_ID.test(query.i) || query.t !== undefined) return respond(400, { error: 'bad_request' });
    params.set('i', query.i);
  } else {
    const title = query.t?.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) return respond(400, { error: 'bad_request' });
    if (query.y !== undefined && query.y !== '' && !YEAR.test(query.y)) {
      return respond(400, { error: 'bad_request' });
    }
    params.set('t', title);
    if (query.y) params.set('y', query.y);
  }
  // Appended last and only here: the client can never supply or override it.
  params.set('apikey', deps.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OMDB_TIMEOUT_MS);
  try {
    const res = await doFetch(`https://www.omdbapi.com/?${params}`, { signal: controller.signal });
    if (res.status === 401) return respond(429, { error: 'limited' });
    if (!res.ok) return respond(502, { error: 'upstream_failed' });

    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.Error === 'string' && /limit/i.test(data.Error)) {
      return respond(429, { error: 'limited' });
    }
    if (data.Response === 'False' || typeof data.Error === 'string') {
      // Definitive "not found": safe for the CDN and the client to remember.
      return respond(200, { Ratings: [] }, MISS_CACHE);
    }
    return respond(200, pick(data), SUCCESS_CACHE);
  } catch (err) {
    // The URL (and therefore the key) is never part of what gets logged.
    logError('omdb.fetch', (err as Error)?.name ?? 'error');
    return respond(502, { error: 'upstream_failed' });
  } finally {
    clearTimeout(timer);
  }
}
