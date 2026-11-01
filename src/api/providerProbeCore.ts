import {
  DEFAULT_SOURCE,
  SOURCE_KEYS,
  SOURCES,
  getMovieEmbedUrl,
  getTVEmbedUrl,
  type MediaType,
} from './sources.js';

export interface ProbeParams {
  source?: string;
  type?: string;
  id?: string;
  season?: string;
  episode?: string;
}

export interface ProbeResult {
  /** true = the provider page proves the title exists, false = it proves it does not, null = no signal. */
  available: boolean | null;
}

export interface ProbeScanResult extends ProbeResult {
  /** First provider, in preference order, that reports the title exists. */
  best: string | null;
}

// A scan checks providers in parallel, so its worst case is one timeout, not
// one per provider. 6 s keeps it inside Vercel's 10 s function limit.
const PROBE_TIMEOUT_MS = 6_000;
const CACHE_TTL_MS = 10 * 60_000;
// The cache key includes caller-chosen ids, so without a cap a client could
// grow it until the instance runs out of memory.
export const CACHE_MAX_ENTRIES = 500;
const MAX_ID_DIGITS = 10;
const MAX_EPISODE_DIGITS = 4;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// These providers expose the same player shell for every id, so a page fetch
// cannot tell whether the title exists.
const NO_SIGNAL_SOURCES = new Set(['2embedskin', 'embos']);

const cache = new Map<string, { at: number; result: ProbeResult }>();
// Identical concurrent probes share one upstream request.
const inFlight = new Map<string, Promise<ProbeResult>>();

function remember(key: string, result: ProbeResult): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), result });
  // Map iterates in insertion order, so the first key is the oldest.
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Test hook: forget cached and in-flight probes. */
export function resetProbeState(): void {
  cache.clear();
  inFlight.clear();
}

interface Page {
  status: number;
  html: string;
}

function isPositiveInt(value: string | undefined, maxDigits = MAX_ID_DIGITS): boolean {
  return value != null && value.length <= maxDigits && /^\d+$/.test(value) && Number(value) > 0;
}

function titleOf(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

async function fetchPage(url: string, accept = 'text/html,application/xhtml+xml'): Promise<Page | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = await response.text();
    return { status: response.status, html };
  } catch {
    // A network error or timeout says nothing about the catalogue - treat it
    // as "no signal" instead of switching the user to another provider.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function probeUrl(source: string, type: MediaType, id: string, season?: number, episode?: number): string {
  // 2embed's embed page is only a wrapper with the title. The actual sources
  // are rendered into the inner player page, so read that instead.
  if (source === '2embed') {
    return type === 'movie'
      ? `https://www.2embed.stream/movie/${id}`
      : `https://www.2embed.stream/tv/${id}/${season}/${episode}`;
  }
  return type === 'movie'
    ? getMovieEmbedUrl(id, source)
    : getTVEmbedUrl(id, season as number, episode as number, source);
}

function evaluate(source: string, type: MediaType, page: Page): boolean | null {
  const { status, html } = page;

  if (source === 'vidsrc') {
    // vidsrc.fyi is a shell: for movies it currently points at
    // https://vsembed.ru/embed/movie// (empty id) for every request, while TV
    // paths do carry the id. Read the inner frame to tell the two apart.
    const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!match) return status >= 400 ? false : null;
    let pathname: string;
    try {
      pathname = new URL(match[1], 'https://vidsrc.fyi').pathname;
    } catch {
      return null;
    }
    const segment = type === 'movie'
      ? /\/embed\/movie\/(.*)$/.exec(pathname)?.[1]
      : /\/embed\/tv\/(.*)$/.exec(pathname)?.[1];
    if (segment == null) return null;
    return segment.replace(/\/+/g, '').length > 0;
  }

  if (source === '2embed') {
    // Missing ids get "Failed Fetching Data" and no stream links. Valid ones
    // render signed upcloud .m3u8 sources into the page.
    if (status === 404 || status === 410) return false;
    if (status >= 500) return null;
    if (/failed fetching data/i.test(titleOf(html))) return false;
    return /#file\.m3u8|upcloud\.2embed\.stream/.test(html);
  }

  if (source === 'nontongo') {
    // Cloudflare answers 403/429 from datacentre IPs and the site currently
    // 404s wholesale, so only a clean 200 with watch links proves a title.
    if (status >= 400) return null;
    const title = titleOf(html);
    if (!title) return null;
    if (!/nontongo/i.test(title)) return null;
    return /nontongo\.win\/watch\//.test(html);
  }

  return null;
}

async function probeVsembed(type: MediaType, id: string, season?: number, episode?: number): Promise<boolean | null> {
  // The player resolves its media through this JSON API (CORS *). It returns
  // status_code 200 with file data for a real title and 404 for a missing one.
  const query = new URLSearchParams({ type, tmdb: id });
  if (type === 'tv') {
    query.set('season', String(season));
    query.set('episode', String(episode));
  }
  const page = await fetchPage(`https://data.vidsrc.sh/api.php?${query}`, 'application/json');
  if (!page) return null;
  if (page.status === 404) return false;
  if (page.status >= 400) return null;
  try {
    const code = Number((JSON.parse(page.html) as { status_code?: string | number }).status_code);
    if (code === 200) return true;
    if (code === 404) return false;
    return null;
  } catch {
    return null;
  }
}

export async function probeProvider(params: ProbeParams): Promise<ProbeResult> {
  const type: MediaType | null = params.type === 'movie' || params.type === 'tv' ? params.type : null;
  if (!type || !isPositiveInt(params.id)) return { available: null };

  const source = params.source && Object.hasOwn(SOURCES, params.source) ? params.source : DEFAULT_SOURCE;
  if (NO_SIGNAL_SOURCES.has(source)) return { available: null };

  let season: number | undefined;
  let episode: number | undefined;
  if (type === 'tv') {
    if (!isPositiveInt(params.season, MAX_EPISODE_DIGITS) || !isPositiveInt(params.episode, MAX_EPISODE_DIGITS)) return { available: null };
    season = Number(params.season);
    episode = Number(params.episode);
  }

  const id = params.id as string;
  const cacheKey = `${source}:${type}:${id}:${season ?? 0}:${episode ?? 0}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const run = (async (): Promise<ProbeResult> => {
    const available = source === 'vsembed'
      ? await probeVsembed(type, id, season, episode)
      : await fetchPage(probeUrl(source, type, id, season, episode))
        .then((page) => (page ? evaluate(source, type, page) : null));
    const result: ProbeResult = { available };
    // Do not cache "unknown": a transient network failure should be retried.
    if (result.available !== null) remember(cacheKey, result);
    return result;
  })().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, run);
  return run;
}

export async function probeBestSource(params: ProbeParams): Promise<ProbeScanResult> {
  const current = await probeProvider(params);
  const currentSource = params.source && Object.hasOwn(SOURCES, params.source) ? params.source : DEFAULT_SOURCE;
  if (current.available === true) return { ...current, best: currentSource };

  // The current provider is missing or unknown; ask the others at the same
  // time (a sequential scan could take one timeout per provider) and take the
  // first one, in preference order, that confirms the title. Unknown providers
  // are skipped because they cannot prove it.
  const others = SOURCE_KEYS.filter((source) => source !== currentSource);
  const results = await Promise.all(others.map((source) => probeProvider({ ...params, source })));
  const index = results.findIndex((result) => result.available === true);
  return { available: current.available, best: index === -1 ? null : others[index] };
}

export function handleProbeQuery(
  query: Record<string, string | string[] | undefined>,
): Promise<ProbeResult | ProbeScanResult> {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const params: ProbeParams = {
    source: first(query.source),
    type: first(query.type),
    id: first(query.id),
    season: first(query.season),
    episode: first(query.episode),
  };
  const scan = first(query.scan);
  return scan === '1' || scan === 'true' ? probeBestSource(params) : probeProvider(params);
}
