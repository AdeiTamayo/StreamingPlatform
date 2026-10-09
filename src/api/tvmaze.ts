// TVMaze: free, keyless source of exact episode air instants.
//
// TMDB only stores a bare `air_date` (YYYY-MM-DD, no time or zone), so a US
// primetime episode looks "released" from 00:00 - hours before it can
// exist. TVMaze exposes the real broadcast instant per episode (`airstamp`,
// an ISO datetime with offset, e.g. 21:00 ET Sunday =
// 2019-05-20T01:00:00+00:00 = 03:00 Monday in Spain). Notification timing
// compares against that instant; anything outside a ±48h window keeps the
// cheap date comparison so we only hit the network at the boundary where
// the timezone actually matters.

const TVMAZE_BASE = 'https://api.tvmaze.com';
const TIMEOUT_MS = 8000;

// Only resolve an exact instant near the day boundary - far-future and
// long-past episodes agree under date logic anyway.
const BOUNDARY_WINDOW_MS = 48 * 60 * 60 * 1000;

const SHOW_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 24 * 60 * 60 * 1000;

function showCacheKey(imdbId: string): string {
  return `tvmaze:show:${imdbId}`;
}

function epCacheKey(tvmazeId: number, season: number, episode: number): string {
  return `tvmaze:ep:${tvmazeId}:${season}:${episode}`;
}

interface ShowCacheEntry {
  fetchedAt: number;
  tvmazeId: number | null;
}

interface EpCacheEntry {
  fetchedAt: number;
  airstamp: number | null;
}

function readShowEntry(imdbId: string): ShowCacheEntry | null {
  try {
    const raw = localStorage.getItem(showCacheKey(imdbId));
    if (!raw) return null;
    const entry = JSON.parse(raw) as ShowCacheEntry;
    if (!entry || typeof entry.fetchedAt !== 'number') return null;
    if (entry.tvmazeId !== null && typeof entry.tvmazeId !== 'number') return null;
    const ttl = entry.tvmazeId == null ? NOT_FOUND_TTL_MS : SHOW_CACHE_TTL_MS;
    if (Date.now() - entry.fetchedAt > ttl) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeShowEntry(imdbId: string, tvmazeId: number | null): void {
  try {
    localStorage.setItem(showCacheKey(imdbId), JSON.stringify({ fetchedAt: Date.now(), tvmazeId }));
  } catch {
    // Best-effort cache only.
  }
}

function readEpEntry(tvmazeId: number, season: number, episode: number): EpCacheEntry | null {
  try {
    const raw = localStorage.getItem(epCacheKey(tvmazeId, season, episode));
    if (!raw) return null;
    const entry = JSON.parse(raw) as EpCacheEntry;
    if (!entry || typeof entry.fetchedAt !== 'number') return null;
    if (entry.airstamp !== null && typeof entry.airstamp !== 'number') return null;
    const ttl = entry.airstamp == null ? NOT_FOUND_TTL_MS : EP_CACHE_TTL_MS;
    if (Date.now() - entry.fetchedAt > ttl) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeEpEntry(tvmazeId: number, season: number, episode: number, airstamp: number | null): void {
  try {
    localStorage.setItem(epCacheKey(tvmazeId, season, episode), JSON.stringify({ fetchedAt: Date.now(), airstamp }));
  } catch {
    // Best-effort cache only.
  }
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TVMaze error: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

const inflightShow = new Map<string, Promise<number | null>>();
const inflightEp = new Map<string, Promise<number | null>>();

// TVMaze show id for a TMDB/IMDb id, or null when TVMaze has no match.
// Results (including misses) are cached.
export async function lookupTvMazeShowId(imdbId: string, signal?: AbortSignal): Promise<number | null> {
  if (!imdbId?.trim()) return null;
  const cached = readShowEntry(imdbId);
  if (cached) return cached.tvmazeId;

  const existing = inflightShow.get(imdbId);
  if (existing) return existing;

  const promise = (async () => {
    const data = (await fetchJson(`${TVMAZE_BASE}/lookup/shows?imdb=${encodeURIComponent(imdbId)}`, signal)) as {
      id?: unknown;
    } | null;
    const tvmazeId = typeof data?.id === 'number' ? data.id : null;
    writeShowEntry(imdbId, tvmazeId);
    return tvmazeId;
  })().finally(() => {
    inflightShow.delete(imdbId);
  });
  inflightShow.set(imdbId, promise);
  return promise;
}

// Exact air instant (epoch ms) for one episode, or null when unknown.
// Cached per episode; schedule shifts are re-picked-up after the TTL.
export async function getEpisodeAirInstant(
  imdbId: string,
  season: number,
  episode: number,
  signal?: AbortSignal,
): Promise<number | null> {
  const tvmazeId = await lookupTvMazeShowId(imdbId, signal);
  if (tvmazeId == null) return null;

  const cached = readEpEntry(tvmazeId, season, episode);
  if (cached) return cached.airstamp;

  const key = `${tvmazeId}:${season}:${episode}`;
  const existing = inflightEp.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const data = (await fetchJson(
      `${TVMAZE_BASE}/shows/${tvmazeId}/episodebynumber?season=${season}&number=${episode}`,
      signal,
    )) as { airstamp?: unknown } | null;
    const parsed = typeof data?.airstamp === 'string' ? Date.parse(data.airstamp) : NaN;
    const airstamp = Number.isNaN(parsed) ? null : parsed;
    writeEpEntry(tvmazeId, season, episode, airstamp);
    return airstamp;
  })().finally(() => {
    inflightEp.delete(key);
  });
  inflightEp.set(key, promise);
  return promise;
}

export interface EpisodeReleaseInput {
  imdbId?: string | null;
  season?: number | null;
  episode?: number | null;
  airDate: string;
}

// Has this episode actually aired? Uses the exact broadcast instant near
// the day boundary (where timezones flip the answer) and the cheap date
// comparison everywhere else. Unknown instants fall back to date logic,
// never to "not released".
export async function isEpisodeReleased(
  input: EpisodeReleaseInput,
  now: number = Date.now(),
  signal?: AbortSignal,
): Promise<boolean> {
  const airDateMs = new Date(input.airDate).getTime();
  if (Number.isNaN(airDateMs)) return false;

  const nearBoundary = Math.abs(airDateMs - now) < BOUNDARY_WINDOW_MS;
  if (
    nearBoundary &&
    input.imdbId &&
    input.season != null &&
    input.episode != null
  ) {
    try {
      const instant = await getEpisodeAirInstant(input.imdbId, input.season, input.episode, signal);
      if (instant != null) return instant <= now;
    } catch {
      // Aborted or provider down - fall through to date logic below.
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    }
  }
  return airDateMs <= now;
}
