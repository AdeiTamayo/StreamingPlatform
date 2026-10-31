import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authServiceMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  deleteAccount: vi.fn(),
}));

vi.mock('../../services/auth/authService', () => ({
  authService: authServiceMock,
  PASSWORD_RESET_PATH: '/reset-password',
}));

vi.mock('../../utils/dataMigration', () => ({
  dataMigration: { migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined) },
}));

const clearTMDBCacheMock = vi.hoisted(() => vi.fn());
vi.mock('../../api/tmdbCache', () => ({ clearTMDBCache: clearTMDBCacheMock }));

// Spies that delegate to the real implementations, so the tests above can check
// real storage behaviour while the isolation test below can pin each call.
const spies = vi.hoisted(() => ({
  clearAllData: vi.fn(),
  clearOfflineQueue: vi.fn(),
  clearDroppedMarker: vi.fn(),
}));
vi.mock('../../api/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/storage')>();
  spies.clearAllData.mockImplementation(actual.clearAllData);
  return { ...actual, clearAllData: spies.clearAllData };
});
vi.mock('../../utils/offlineQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/offlineQueue')>();
  spies.clearOfflineQueue.mockImplementation(actual.clearOfflineQueue);
  spies.clearDroppedMarker.mockImplementation(actual.clearDroppedMarker);
  return {
    ...actual,
    clearOfflineQueue: spies.clearOfflineQueue,
    clearDroppedMarker: spies.clearDroppedMarker,
  };
});

import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';
import { OFFLINE_QUEUE_KEY, SYNC_DROPPED_KEY } from '../../utils/offlineQueue';
import { DATA_OWNER_KEY, getCurrentUserId } from '../../api/storage';

let result: { error?: unknown; done?: boolean } = {};

function Probe() {
  const { isAuthenticated, deleteAccount } = useAuth();
  const location = useLocation();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="path">{location.pathname}</span>
      <button
        onClick={() => {
          result = {};
          deleteAccount('Old!Password-1').then(
            () => (result = { done: true }),
            (error) => (result = { error }),
          );
        }}
      >
        delete
      </button>
    </div>
  );
}

function seedLocalData() {
  localStorage.setItem('watched:movie-1', '{"watched":true}');
  localStorage.setItem('progress:movie-1', '{"seconds":120}');
  localStorage.setItem('search_history', '["matrix"]');
  localStorage.setItem(OFFLINE_QUEUE_KEY, '[{"id":"1"}]');
  localStorage.setItem(SYNC_DROPPED_KEY, '{"count":2,"lastAt":1}');
}

async function renderSignedIn() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
  expect(await screen.findByText('true')).toBeInTheDocument();
  seedLocalData();
}

describe('AuthContext deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    result = {};
    authServiceMock.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    authServiceMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    authServiceMock.signOut.mockResolvedValue(undefined);
    clearTMDBCacheMock.mockResolvedValue(undefined);
  });

  it('clears local data, signs out and navigates home after a successful deletion', async () => {
    authServiceMock.deleteAccount.mockResolvedValue(undefined);
    await renderSignedIn();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(result.done).toBe(true));
    expect(authServiceMock.deleteAccount).toHaveBeenCalledWith('Old!Password-1');
    expect(localStorage.getItem('watched:movie-1')).toBeNull();
    expect(localStorage.getItem('progress:movie-1')).toBeNull();
    expect(localStorage.getItem('search_history')).toBeNull();
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
    expect(localStorage.getItem(SYNC_DROPPED_KEY)).toBeNull();
    expect(localStorage.getItem(DATA_OWNER_KEY)).toBeNull();
    expect(clearTMDBCacheMock).toHaveBeenCalled();
    expect(authServiceMock.signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
  });

  it('still finishes locally when the remote sign-out fails because the user no longer exists', async () => {
    authServiceMock.deleteAccount.mockResolvedValue(undefined);
    authServiceMock.signOut.mockRejectedValue({ message: 'User from sub claim in JWT does not exist' });
    await renderSignedIn();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(result.done).toBe(true));
    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    expect(localStorage.getItem('watched:movie-1')).toBeNull();
  });

  it('leaves the user signed in and the data untouched when the deletion fails', async () => {
    authServiceMock.deleteAccount.mockRejectedValue({ message: 'x', code: 'delete_account_failed' });
    await renderSignedIn();

    fireEvent.click(screen.getByText('delete'));

    await waitFor(() => expect(result.error).toMatchObject({ code: 'delete_account_failed' }));
    expect(screen.getByTestId('auth').textContent).toBe('true');
    expect(screen.getByTestId('path').textContent).toBe('/settings');
    expect(authServiceMock.signOut).not.toHaveBeenCalled();
    expect(clearTMDBCacheMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('watched:movie-1')).toBe('{"watched":true}');
    expect(localStorage.getItem('progress:movie-1')).toBe('{"seconds":120}');
    expect(localStorage.getItem('search_history')).toBe('["matrix"]');
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBe('[{"id":"1"}]');
    expect(localStorage.getItem(SYNC_DROPPED_KEY)).toBe('{"count":2,"lastAt":1}');
  });

  it('runs every local cleanup step itself, after the server confirmed and with no user id set', async () => {
    authServiceMock.deleteAccount.mockResolvedValue(undefined);
    await renderSignedIn();
    expect(getCurrentUserId()).toBe('user-1');

    // Isolate the explicit calls: the real clearAllData would also clear the
    // queue and the TMDB cache, hiding a missing call.
    let userIdDuringClear: string | null | undefined;
    spies.clearAllData.mockImplementationOnce(async () => {
      userIdDuringClear = getCurrentUserId();
    });

    fireEvent.click(screen.getByText('delete'));
    await waitFor(() => expect(result.done).toBe(true));

    expect(spies.clearAllData).toHaveBeenCalledTimes(1);
    // No signed-in user id while wiping: nothing may be sent to (or queued for)
    // a cloud account that no longer exists.
    expect(userIdDuringClear).toBeNull();
    expect(clearTMDBCacheMock).toHaveBeenCalledTimes(1);
    expect(spies.clearOfflineQueue).toHaveBeenCalledTimes(1);
    expect(spies.clearDroppedMarker).toHaveBeenCalledTimes(1);
    expect(authServiceMock.signOut).toHaveBeenCalledTimes(1);

    const order = (fn: { mock: { invocationCallOrder: number[] } }) => fn.mock.invocationCallOrder[0];
    const serverCall = order(authServiceMock.deleteAccount);
    expect(serverCall).toBeLessThan(order(spies.clearAllData));
    expect(serverCall).toBeLessThan(order(clearTMDBCacheMock));
    expect(serverCall).toBeLessThan(order(spies.clearOfflineQueue));
    expect(serverCall).toBeLessThan(order(spies.clearDroppedMarker));
    expect(serverCall).toBeLessThan(order(authServiceMock.signOut));
  });
});
