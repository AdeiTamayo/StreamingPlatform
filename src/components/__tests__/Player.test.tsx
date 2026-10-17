import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import Player from '../Player';

describe('Player runtime prop changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseCallbacks = () => ({ onProgress: vi.fn(), onEnded: vi.fn() });

  it('does not reset playback when runtimeMinutes resolves late', () => {
    const { onProgress, onEnded } = baseCallbacks();
    const props = {
      src: 'https://vidsrc.to/embed/movie/550',
      title: 'Test',
      onProgress,
      onEnded,
      startAt: 100,
    };
    const { rerender } = render(<Player {...props} runtimeMinutes={null} />);

    // Grace period elapses, wall-clock fallback ticks: 100 -> 110.
    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onProgress).toHaveBeenLastCalledWith(110, 0);

    // Runtime becomes known mid-playback (season details arrive). The reset
    // effect must not re-run: playback continues from 110 -> 120.
    rerender(<Player {...props} runtimeMinutes={57} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onProgress).toHaveBeenLastCalledWith(120, 0);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('still resets playback when the video src changes', () => {
    const { onProgress, onEnded } = baseCallbacks();
    const props = {
      title: 'Test',
      onProgress,
      onEnded,
      startAt: 100,
      runtimeMinutes: 57,
    };
    const { rerender } = render(<Player {...props} src="https://vidsrc.to/embed/movie/550" />);
    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onProgress).toHaveBeenLastCalledWith(110, 0);

    // New video: state restarts at startAt, so the first tick after the new
    // grace period reports 110 again (100 + 10) instead of continuing 120.
    rerender(<Player {...props} src="https://vidsrc.to/embed/movie/551" />);
    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onProgress.mock.calls.filter((c) => c[0] === 110)).toHaveLength(2);
    expect(onProgress).toHaveBeenLastCalledWith(110, 0);
  });
});
