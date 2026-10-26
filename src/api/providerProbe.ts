import { SOURCE_KEYS, type MediaType } from './sources';

export interface ProviderAvailability {
  /** true = provider has the title, false = provider reports it missing, null = no usable signal. */
  available: boolean | null;
  /** First provider that confirms it has the title, if any. */
  best: string | null;
}

interface AvailabilityRequest {
  source: string;
  mediaType: MediaType;
  id: string;
  season?: number;
  episode?: number;
}

// Browser-side half of the probe. The provider pages do not send CORS headers,
// so the same-origin /api/probe function reads them server-side instead.
export async function probeProviderAvailability(
  { source, mediaType, id, season, episode }: AvailabilityRequest,
  signal?: AbortSignal,
): Promise<ProviderAvailability> {
  const query = new URLSearchParams({ source, type: mediaType, id, scan: '1' });
  if (mediaType === 'tv') {
    query.set('season', String(season ?? 1));
    query.set('episode', String(episode ?? 1));
  }

  try {
    const response = await fetch(`/api/probe?${query.toString()}`, {
      headers: { accept: 'application/json' },
      signal: signal ?? AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { available: null, best: null };
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
      return { available: null, best: null };
    }
    const data: unknown = await response.json();
    const available = (data as { available?: unknown } | null)?.available;
    const best = (data as { best?: unknown } | null)?.best;
    return {
      available: available === true ? true : available === false ? false : null,
      best: typeof best === 'string' && SOURCE_KEYS.includes(best) ? best : null,
    };
  } catch {
    return { available: null, best: null };
  }
}
