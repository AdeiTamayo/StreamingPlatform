import { useEffect, useRef, useCallback, memo } from 'react';
import { getPlayerOrigins } from '../api/vidsrc';
import { logDebug } from '../utils/logger';
import styles from './Player.module.css';

// How long to wait for the first postMessage before assuming this
// embed session isn't sending events, and falling back to a wall-clock guess.
const POSTMESSAGE_GRACE_MS = 15_000;

// If real messages were arriving but then stop, how long to wait
// before treating the stream as stalled and re-arming the fallback.
const POSTMESSAGE_STALE_MS = 20_000;

const FALLBACK_POLL_MS = 10_000;
const COMPLETION_RATIO = 0.9;

// Absolute ceiling for the wall-clock estimate when no duration info exists:
// a dead embed must still eventually end instead of counting forever.
const FALLBACK_MAX_SECONDS = 3 * 60 * 60;

const KNOWN_PLAYER_ORIGINS = new Set(getPlayerOrigins());

interface PlayerProps {
  src: string;
  title: string;
  /** Playback (probably) started - record the title in Continue Watching. */
  onWatching: () => void;
  onEnded: () => void;
  runtimeMinutes: number | null;
}

interface PlayerState {
  currentTime: number;
  duration: number;
  ended: boolean;
}

const Player = memo(function Player({ src, title, onWatching, onEnded, runtimeMinutes }: PlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedOnWatching = useRef(onWatching);
  const savedOnEnded = useRef(onEnded);

  // Keep latest callbacks without re-subscribing listeners on every render.
  useEffect(() => {
    savedOnWatching.current = onWatching;
  }, [onWatching]);
  useEffect(() => {
    savedOnEnded.current = onEnded;
  }, [onEnded]);

  // Mutable playback state - kept out of React state so ticks/messages
  // don't cause re-renders. Only used to guess completion; never persisted.
  const state = useRef<PlayerState>({ currentTime: 0, duration: 0, ended: false });

  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval>>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Read through a ref so a runtime that resolves late (episodes load while
  // playing) doesn't change startWallClockFallback's identity and re-run the
  // reset effect below, which would wipe playback state mid-play.
  const runtimeMinutesRef = useRef(runtimeMinutes);
  useEffect(() => {
    runtimeMinutesRef.current = runtimeMinutes;
  }, [runtimeMinutes]);

  const clearFallbackTimers = useCallback(() => {
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    fallbackIntervalRef.current = null;
    graceTimerRef.current = null;
    staleTimerRef.current = null;
  }, []);

  const markEnded = useCallback(() => {
    if (state.current.ended) return;
    state.current.ended = true;
    clearFallbackTimers();
    savedOnEnded.current?.();
  }, [clearFallbackTimers]);

  // Last-resort wall-clock estimate. Stops itself the instant a real
  // message arrives, because handleMessage calls clearFallbackTimers()
  // synchronously before doing anything else.
  const startWallClockFallback = useCallback(() => {
    if (fallbackIntervalRef.current || state.current.ended) return;

    // The embed is (presumably) autoplaying, so the title is now being watched.
    savedOnWatching.current?.();

    fallbackIntervalRef.current = setInterval(() => {
      state.current.currentTime += 10;

      const runtime = runtimeMinutesRef.current;
      if (runtime) {
        const runtimeSeconds = runtime * 60;
        if (state.current.currentTime >= runtimeSeconds) markEnded();
      } else if (state.current.currentTime >= FALLBACK_MAX_SECONDS) {
        markEnded();
      }
    }, FALLBACK_POLL_MS);
  }, [markEnded]);

  const armStaleWatchdog = useCallback(() => {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(startWallClockFallback, POSTMESSAGE_STALE_MS);
  }, [startWallClockFallback]);

  // --- postMessage listener ---
  useEffect(() => {
    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = new URL(src).origin;
    } catch {
      // malformed src - fall through to source-based check only
    }

    // Events we act on - anything else from the embed is ignored so a
    // chatty or hostile frame can't drive playback state.
    const KNOWN_EVENTS = new Set(['time', 'play', 'pause', 'complete', 'ended', 'seek', 'seeked', 'buffering']);

    const allowedOrigins = new Set(KNOWN_PLAYER_ORIGINS);
    if (expectedOrigin) allowedOrigins.add(expectedOrigin);

    function handleMessage(e: MessageEvent) {
      const isSameWindow = e.source === iframeRef.current?.contentWindow;
      if (!isSameWindow) return;

      // Late ticks after completion must not re-open the watching entry.
      if (state.current.ended) return;

      // The frame may navigate internally (vidsrc.fyi -> the actual player
      // host), but it must stay on a known player origin. A hostile frame
      // that takes over the iframe cannot drive watch state.
      if (!allowedOrigins.has(e.origin)) {
        logDebug(`origin rejected actual=${e.origin}`);
        return;
      }

      // Some embeds send e.data as a JSON string, not an object.
      let payload = e.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { return; }
      }

      if (payload?.type !== 'PLAYER_EVENT') return;

      const data = payload.data;
      if (data == null || typeof data !== 'object') return;
      const { event, currentTime, duration } = data as {
        event?: unknown;
        currentTime?: unknown;
        duration?: unknown;
      };
      if (typeof event !== 'string' || !KNOWN_EVENTS.has(event)) return;
      if (currentTime !== undefined && (!Number.isFinite(currentTime) || (currentTime as number) < 0)) return;
      // Sanity cap: nothing real runs longer than 24h; faulty values must
      // not poison progress or trigger completion.
      if (duration !== undefined && (!Number.isFinite(duration) || (duration as number) < 0 || (duration as number) > 86400)) return;

      logDebug(`PLAYER_EVENT event=${event} currentTime=${currentTime} duration=${duration}`);

      // Real telemetry arrived - stop guessing, and watch for it going stale.
      clearFallbackTimers();
      armStaleWatchdog();

      if (typeof duration === 'number' && duration > 0) {
        state.current.duration = duration;
      }

      if (event === 'time' || event === 'play' || event === 'pause') {
        if (typeof currentTime === 'number') {
          state.current.currentTime = currentTime;
        }
        if (event === 'time' || event === 'play') savedOnWatching.current?.();

        // Duration-based completion check, in case "complete" never fires
        // (some players stop emitting events right at the very end). Only
        // 'time' ticks count - a seek near the end followed by pause must
        // not mark the video complete.
        if (event === 'time' && state.current.duration > 0) {
          const ratio = state.current.currentTime / state.current.duration;
          if (ratio >= COMPLETION_RATIO) markEnded();
        }
      } else if (event === 'complete' || event === 'ended') {
        markEnded();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [src, markEnded, clearFallbackTimers, armStaleWatchdog]);

  // --- reset state + arm grace period whenever the video changes ---
  useEffect(() => {
    state.current = { currentTime: 0, duration: 0, ended: false };
    clearFallbackTimers();

    // Give the embed a window to start sending real events before
    // resorting to the wall-clock guess.
    graceTimerRef.current = setTimeout(startWallClockFallback, POSTMESSAGE_GRACE_MS);

    return clearFallbackTimers;
  }, [src, clearFallbackTimers, startWallClockFallback]);

  return (
    <div className={styles.playerWrapper}>
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
        className="player-iframe"
      />
    </div>
  );
});

export default Player;
