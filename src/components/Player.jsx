import { useEffect, useRef, useCallback } from 'react';

// How long to wait for the first postMessage before assuming this
// embed session isn't sending events, and falling back to a wall-clock guess.
const POSTMESSAGE_GRACE_MS = 15_000;

// If real messages were arriving but then stop, how long to wait
// before treating the stream as stalled and re-arming the fallback.
const POSTMESSAGE_STALE_MS = 20_000;

const FALLBACK_POLL_MS = 10_000;
const COMPLETION_RATIO = 0.9;

export default function Player({ src, title, onProgress, onEnded, runtimeMinutes }) {
  const iframeRef = useRef(null);
  const savedOnProgress = useRef(onProgress);
  const savedOnEnded = useRef(onEnded);
  savedOnProgress.current = onProgress;
  savedOnEnded.current = onEnded;

  // Mutable playback state - kept out of React state so ticks/messages
  // don't cause re-renders.
  const state = useRef({ currentTime: 0, duration: 0, ended: false });

  const fallbackIntervalRef = useRef(null);
  const graceTimerRef = useRef(null);
  const staleTimerRef = useRef(null);

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

    fallbackIntervalRef.current = setInterval(() => {
      state.current.currentTime += 10;
      savedOnProgress.current?.(state.current.currentTime, state.current.duration);

      if (runtimeMinutes) {
        const runtimeSeconds = runtimeMinutes * 60;
        if (state.current.currentTime >= runtimeSeconds) markEnded();
      }
    }, FALLBACK_POLL_MS);
  }, [runtimeMinutes, markEnded]);

  const armStaleWatchdog = useCallback(() => {
    if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    staleTimerRef.current = setTimeout(startWallClockFallback, POSTMESSAGE_STALE_MS);
  }, [startWallClockFallback]);

  // --- postMessage listener ---
  useEffect(() => {
    let expectedOrigin = null;
    try {
      expectedOrigin = new URL(src).origin;
    } catch {
      // malformed src - fall through to source-based check only
    }

    const DEBUG_KEY = 'player_debug';

    function logDebug(msg) {
      try {
        const prev = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
        prev.push({ ts: Date.now(), msg });
        if (prev.length > 50) prev.splice(0, prev.length - 50);
        localStorage.setItem(DEBUG_KEY, JSON.stringify(prev));
      } catch { /* storage full or blocked */ }
    }

    function handleMessage(e) {
      const isSameWindow = e.source === iframeRef.current?.contentWindow;
      logDebug(`msg origin=${e.origin} sameWindow=${isSameWindow} type=${typeof e.data} data=${JSON.stringify(e.data)?.slice(0, 200)}`);

      // Only blocking check: message must come from this exact iframe window.
      // Robust to internal redirects (vidsrc.fyi -> whatever actually hosts
      // the player) since the window object survives navigation.
      if (!isSameWindow) return;

      // Origin is logged, not enforced — the embed may redirect internally.
      if (expectedOrigin && e.origin !== expectedOrigin) {
        logDebug(`origin mismatch src=${expectedOrigin} actual=${e.origin}`);
      }

      // Some embeds send e.data as a JSON string, not an object.
      let payload = e.data;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { logDebug('json parse failed'); return; }
      }

      if (payload?.type !== 'PLAYER_EVENT') return;

      const { event, currentTime, duration } = payload.data ?? {};
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
          savedOnProgress.current?.(currentTime, state.current.duration);
        }

        // Duration-based completion check, in case "complete" never fires
        // (some players stop emitting events right at the very end).
        if (state.current.duration > 0) {
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
    <div className="player-wrapper">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media"
        allowFullScreen
        className="player-iframe"
      />
    </div>
  );
}