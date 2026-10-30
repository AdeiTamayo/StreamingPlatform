import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import SyncDropNotice from '../SyncDropNotice';
import { ToastContext } from '../useToast';
import { SYNC_DROPPED_EVENT, SYNC_DROPPED_KEY } from '../../utils/offlineQueue';

function renderNotice(toast: ReturnType<typeof vi.fn>) {
  return render(
    <ToastContext.Provider value={toast as never}>
      <SyncDropNotice />
    </ToastContext.Provider>,
  );
}

describe('SyncDropNotice', () => {
  beforeEach(() => localStorage.removeItem(SYNC_DROPPED_KEY));

  it('stays quiet when nothing was dropped', () => {
    const toast = vi.fn();
    renderNotice(toast);
    expect(toast).not.toHaveBeenCalled();
  });

  it('warns when writes are dropped while the app is open', () => {
    const toast = vi.fn();
    renderNotice(toast);
    act(() => {
      window.dispatchEvent(new CustomEvent(SYNC_DROPPED_EVENT, { detail: { count: 1 } }));
    });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatch(/could not be synced/i);
    expect(toast.mock.calls[0][1]).toMatchObject({ kind: 'error' });
  });

  it('warns on startup when an earlier session left unsynced changes', () => {
    localStorage.setItem(SYNC_DROPPED_KEY, JSON.stringify({ count: 3, lastAt: 1 }));
    const toast = vi.fn();
    renderNotice(toast);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', () => {
    const toast = vi.fn();
    const { unmount } = renderNotice(toast);
    unmount();
    window.dispatchEvent(new CustomEvent(SYNC_DROPPED_EVENT, { detail: { count: 1 } }));
    expect(toast).not.toHaveBeenCalled();
  });
});
