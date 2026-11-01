import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authServiceMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('../../services/auth/authService', () => ({
  authService: authServiceMock,
  PASSWORD_RESET_PATH: '/reset-password',
}));
vi.mock('../../utils/dataMigration', () => ({
  dataMigration: { migrateFromLocalStorage: vi.fn().mockResolvedValue(undefined) },
}));

import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';
import { OFFLINE_QUEUE_KEY, SYNC_DROPPED_KEY } from '../../utils/offlineQueue';

function Probe() {
  const { isAuthenticated, sessionLoss, endSession, signOut } = useAuth();
  const location = useLocation();
  return (
    <div>
      <span data-testid="authed">{String(isAuthenticated)}</span>
      <span data-testid="loss">{sessionLoss ? `${sessionLoss.reason}#${sessionLoss.id}` : 'none'}</span>
      <span data-testid="path">{location.pathname}</span>
      <button onClick={() => void endSession('deleted')}>deleted</button>
      <button onClick={() => void endSession('ended')}>ended</button>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}

let emit: (event: string, session: unknown) => void;

async function renderSignedIn() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
  await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
}

describe('AuthContext: session ended from outside', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([{ id: 'op', table: 'watched', method: 'insert', data: {}, timestamp: 1, attempts: 0 }]));
    localStorage.setItem(SYNC_DROPPED_KEY, '3');
    authServiceMock.getSession.mockResolvedValue({ user: { id: 'user-1' }, access_token: 't' });
    authServiceMock.signOut.mockResolvedValue(undefined);
    authServiceMock.onAuthStateChange.mockImplementation(((cb: (e: string, s: unknown) => void) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
  });

  it('flags an unexpected SIGNED_OUT (revoked session, other tab) and goes home', async () => {
    await renderSignedIn();

    act(() => emit('SIGNED_OUT', null));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(screen.getByTestId('loss').textContent).toMatch(/^ended#/);
    expect(screen.getByTestId('path').textContent).toBe('/');
  });

  it('does not flag a SIGNED_OUT that the user caused', async () => {
    authServiceMock.signOut.mockImplementation(async () => {
      emit('SIGNED_OUT', null); // supabase-js emits this while signOut() runs
    });
    await renderSignedIn();

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(screen.getByTestId('loss').textContent).toBe('none');
  });

  it("endSession('deleted') signs out locally, discards the dead account's queue and marker, and flags it", async () => {
    await renderSignedIn();

    fireEvent.click(screen.getByText('deleted'));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(screen.getByTestId('loss').textContent).toMatch(/^deleted#/);
    expect(screen.getByTestId('path').textContent).toBe('/');
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).toBeNull();
    expect(localStorage.getItem(SYNC_DROPPED_KEY)).toBeNull();
  });

  it("endSession('ended') signs out but keeps the queue (the account may still exist)", async () => {
    await renderSignedIn();

    fireEvent.click(screen.getByText('ended'));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(screen.getByTestId('loss').textContent).toMatch(/^ended#/);
    expect(localStorage.getItem(OFFLINE_QUEUE_KEY)).not.toBeNull();
  });

  it('still ends the session locally when the remote sign-out fails (the user is gone)', async () => {
    authServiceMock.signOut.mockRejectedValue({ status: 403, message: 'user not found' });
    await renderSignedIn();

    fireEvent.click(screen.getByText('deleted'));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('false'));
    expect(screen.getByTestId('loss').textContent).toMatch(/^deleted#/);
  });
});
