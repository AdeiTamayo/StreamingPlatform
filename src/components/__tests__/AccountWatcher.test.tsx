import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import i18n from '../../i18n';

const verifySession = vi.hoisted(() => vi.fn());
vi.mock('../../services/auth/authService', () => ({ authService: { verifySession } }));

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('../useToast', () => ({ useToast: () => toast }));

import AccountWatcher, { CHECK_INTERVAL_MS, MIN_CHECK_INTERVAL_MS } from '../AccountWatcher';

let visibility: 'visible' | 'hidden' = 'visible';
const endSession = vi.fn();

function setAuth(over: Record<string, unknown> = {}) {
  auth.value = { isAuthenticated: true, sessionLoss: null, endSession, ...over };
}

async function focus() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
}

describe('AccountWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-31T12:00:00Z') });
    vi.clearAllMocks();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    verifySession.mockResolvedValue('valid');
    setAuth();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks the session when the window regains focus', async () => {
    render(<AccountWatcher />);
    await focus();
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it('checks when the tab becomes visible, but not when it becomes hidden', async () => {
    render(<AccountWatcher />);
    visibility = 'hidden';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(verifySession).not.toHaveBeenCalled();

    visibility = 'visible';
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it('does not check while the tab is hidden, even on focus or the interval', async () => {
    render(<AccountWatcher />);
    visibility = 'hidden';
    await focus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('rate limits checks: a second focus inside the window is ignored', async () => {
    render(<AccountWatcher />);
    await focus();
    await focus();
    expect(verifySession).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MIN_CHECK_INTERVAL_MS + 1);
    });
    await focus();
    expect(verifySession).toHaveBeenCalledTimes(2);
  });

  it('checks on a slow interval while visible', async () => {
    render(<AccountWatcher />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS + 10);
    });
    expect(verifySession).toHaveBeenCalledTimes(1);
  });

  it("ends the session as 'deleted' or 'ended' when the server says so", async () => {
    verifySession.mockResolvedValueOnce('deleted');
    render(<AccountWatcher />);
    await focus();
    expect(endSession).toHaveBeenCalledWith('deleted');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MIN_CHECK_INTERVAL_MS + 1);
    });
    verifySession.mockResolvedValueOnce('ended');
    await focus();
    expect(endSession).toHaveBeenLastCalledWith('ended');
  });

  it('never signs out on a valid result, an unknown result (network error) or a thrown error', async () => {
    render(<AccountWatcher />);
    for (const outcome of ['valid', 'unknown'] as const) {
      verifySession.mockResolvedValueOnce(outcome);
      await focus();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(MIN_CHECK_INTERVAL_MS + 1);
      });
    }
    verifySession.mockRejectedValueOnce(new Error('boom'));
    await focus();
    expect(endSession).not.toHaveBeenCalled();
  });

  it('does nothing while signed out', async () => {
    setAuth({ isAuthenticated: false });
    render(<AccountWatcher />);
    await focus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS);
    });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('stops listening and clears the timer on unmount', async () => {
    const { unmount } = render(<AccountWatcher />);
    unmount();
    await focus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS * 2);
    });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it('does not end the session if it is torn down while a check is in flight', async () => {
    let resolve!: (v: string) => void;
    verifySession.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = render(<AccountWatcher />);
    await focus();
    unmount();
    await act(async () => {
      resolve('deleted');
    });
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe('AccountWatcher notices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuth({ isAuthenticated: false });
  });

  it("tells the user the account no longer exists for a 'deleted' loss", () => {
    setAuth({ isAuthenticated: false, sessionLoss: { reason: 'deleted', id: 1 } });
    render(<AccountWatcher />);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatch(/no longer exists/i);
  });

  it("uses the session-ended wording for an 'ended' loss", () => {
    setAuth({ isAuthenticated: false, sessionLoss: { reason: 'ended', id: 1 } });
    render(<AccountWatcher />);
    expect(toast.mock.calls[0][0]).toMatch(/session is no longer valid/i);
  });

  it('shows one notice per loss, and another for a new loss', () => {
    setAuth({ isAuthenticated: false, sessionLoss: { reason: 'ended', id: 1 } });
    const { rerender } = render(<AccountWatcher />);
    rerender(<AccountWatcher />);
    expect(toast).toHaveBeenCalledTimes(1);

    setAuth({ isAuthenticated: false, sessionLoss: { reason: 'ended', id: 2 } });
    rerender(<AccountWatcher />);
    expect(toast).toHaveBeenCalledTimes(2);
  });

  it('is translated', async () => {
    await i18n.changeLanguage('es');
    setAuth({ isAuthenticated: false, sessionLoss: { reason: 'deleted', id: 1 } });
    render(<AccountWatcher />);
    expect(toast.mock.calls[0][0]).toMatch(/ya no existe/i);
  });

  it('shows nothing when there is no loss', () => {
    render(<AccountWatcher />);
    expect(toast).not.toHaveBeenCalled();
  });
});
