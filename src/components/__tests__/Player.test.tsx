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

  const baseCallbacks = () => ({ onWatching: vi.fn(), onEnded: vi.fn() });

  it('flags the title as watching when the wall-clock fallback starts', () => {
    const { onWatching, onEnded } = baseCallbacks();
    const props = {
      src: 'https://vidsrc.to/embed/movie/550',
      title: 'Test',
      onWatching,
      onEnded,
    };
    render(<Player {...props} runtimeMinutes={null} />);

    // Nothing happens during the postMessage grace period.
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('does not reset playback when runtimeMinutes resolves late', () => {
    const { onWatching, onEnded } = baseCallbacks();
    const props = {
      src: 'https://vidsrc.to/embed/movie/550',
      title: 'Test',
      onWatching,
      onEnded,
    };
    const { rerender } = render(<Player {...props} runtimeMinutes={null} />);

    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(1);

    // Runtime becomes known mid-playback (season details arrive). The reset
    // effect must not re-run, so the same session keeps going.
    rerender(<Player {...props} runtimeMinutes={57} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(1);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('starts a fresh playback when the video src changes', () => {
    const { onWatching, onEnded } = baseCallbacks();
    const props = {
      title: 'Test',
      onWatching,
      onEnded,
      runtimeMinutes: 57,
    };
    const { rerender } = render(<Player {...props} src="https://vidsrc.to/embed/movie/550" />);
    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(1);

    rerender(<Player {...props} src="https://vidsrc.to/embed/movie/551" />);
    act(() => {
      vi.advanceTimersByTime(15_000 + 10_000);
    });
    expect(onWatching).toHaveBeenCalledTimes(2);
    expect(onEnded).not.toHaveBeenCalled();
  });
});
