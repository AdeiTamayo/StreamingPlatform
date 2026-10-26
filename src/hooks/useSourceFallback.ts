import { useEffect, useRef } from 'react';
import type { MediaType } from '../api/sources';
import { probeProviderAvailability } from '../api/providerProbe';

interface SourceFallbackOptions {
  /** Only probe while the real player is on screen (not the trailer, not loading). */
  active: boolean;
  mediaType: MediaType;
  id: string | undefined;
  source: string;
  season?: number;
  episode?: number;
  onSwitch: (source: string) => void;
  onSwitched?: (from: string, to: string) => void;
  /** Every provider we can read reported the title missing. */
  onNoSource?: () => void;
}

/**
 * Asks /api/probe whether the current provider has the requested title. When
 * it does not, the same call scans the other providers and returns the first
 * one that confirms it has the title, so a broken provider does not strand the
 * user on a "media not found" screen. The saved preference is left alone: the
 * switch only affects this playback session.
 */
export function useSourceFallback({
  active,
  mediaType,
  id,
  source,
  season,
  episode,
  onSwitch,
  onSwitched,
  onNoSource,
}: SourceFallbackOptions) {
  const probedRef = useRef('');
  const onSwitchRef = useRef(onSwitch);
  const onSwitchedRef = useRef(onSwitched);
  const onNoSourceRef = useRef(onNoSource);

  useEffect(() => {
    onSwitchRef.current = onSwitch;
    onSwitchedRef.current = onSwitched;
    onNoSourceRef.current = onNoSource;
  });

  const contentKey = `${mediaType}:${id ?? ''}:${season ?? ''}:${episode ?? ''}`;
  useEffect(() => {
    if (!active || !id) return;
    const probeKey = `${contentKey}:${source}`;
    if (probedRef.current === probeKey) return;
    probedRef.current = probeKey;
    let cancelled = false;

    probeProviderAvailability({ source, mediaType, id, season, episode }).then((result) => {
      if (cancelled) return;

      if (result.best && result.best !== source) {
        onSwitchRef.current(result.best);
        onSwitchedRef.current?.(source, result.best);
        return;
      }

      if (result.available === false && !result.best) onNoSourceRef.current?.();
    });

    return () => {
      cancelled = true;
    };
  }, [active, mediaType, id, season, episode, source, contentKey]);
}
