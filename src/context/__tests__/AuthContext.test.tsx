import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authServiceMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  changeEmail: vi.fn(),
}));

vi.mock('../../services/auth/authService', () => ({
  authService: authServiceMock,
  PASSWORD_RESET_PATH: '/reset-password',
}));

import { AuthProvider } from '../AuthContext';
import { useAuth } from '../../hooks/useAuth';

function Probe() {
  const { isAuthenticated, signOut } = useAuth();
  const location = useLocation();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="path">{location.pathname}</span>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}

function renderSignedIn() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AuthContext signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.getSession.mockResolvedValue({ user: { id: 'user-1' } });
    authServiceMock.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('clears local auth state and navigates home when the remote sign-out fails', async () => {
    authServiceMock.signOut.mockRejectedValue({ message: 'network down' });
    renderSignedIn();
    expect(await screen.findByText('true')).toBeInTheDocument();

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
  });

  it('clears local auth state and navigates home on a successful sign-out', async () => {
    authServiceMock.signOut.mockResolvedValue(undefined);
    renderSignedIn();
    expect(await screen.findByText('true')).toBeInTheDocument();

    fireEvent.click(screen.getByText('sign out'));

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('false'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
  });
});

describe('AuthContext password recovery', () => {
  function RecoveryProbe() {
    const { isPasswordRecovery, isAuthenticated, endPasswordRecovery, signOut } = useAuth();
    const location = useLocation();
    return (
      <div>
        <span data-testid="recovery">{String(isPasswordRecovery)}</span>
        <span data-testid="authed">{String(isAuthenticated)}</span>
        <span data-testid="where">{location.pathname}</span>
        <button onClick={endPasswordRecovery}>end</button>
        <button onClick={() => void signOut()}>out</button>
      </div>
    );
  }

  let emit: (event: string, session: unknown) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.getSession.mockResolvedValue(null);
    authServiceMock.signOut.mockResolvedValue(undefined);
    authServiceMock.onAuthStateChange.mockImplementation(((cb: (e: string, s: unknown) => void) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
  });

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <RecoveryProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('flags recovery and moves to the reset route on PASSWORD_RECOVERY', async () => {
    renderAt('/');
    await waitFor(() => expect(authServiceMock.onAuthStateChange).toHaveBeenCalled());

    act(() => emit('PASSWORD_RECOVERY', { user: { id: 'u1' } }));

    await waitFor(() => expect(screen.getByTestId('recovery').textContent).toBe('true'));
    expect(screen.getByTestId('where').textContent).toBe('/reset-password');
    expect(screen.getByTestId('authed').textContent).toBe('true');
  });

  it('does not flag recovery for a normal SIGNED_IN event', async () => {
    renderAt('/');
    await waitFor(() => expect(authServiceMock.onAuthStateChange).toHaveBeenCalled());

    act(() => emit('SIGNED_IN', { user: { id: 'u1' } }));

    await waitFor(() => expect(screen.getByTestId('authed').textContent).toBe('true'));
    expect(screen.getByTestId('recovery').textContent).toBe('false');
  });

  it('clears the flag on endPasswordRecovery and on sign-out', async () => {
    renderAt('/');
    await waitFor(() => expect(authServiceMock.onAuthStateChange).toHaveBeenCalled());

    act(() => emit('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    await waitFor(() => expect(screen.getByTestId('recovery').textContent).toBe('true'));
    fireEvent.click(screen.getByText('end'));
    expect(screen.getByTestId('recovery').textContent).toBe('false');

    act(() => emit('PASSWORD_RECOVERY', { user: { id: 'u1' } }));
    await waitFor(() => expect(screen.getByTestId('recovery').textContent).toBe('true'));
    fireEvent.click(screen.getByText('out'));
    await waitFor(() => expect(screen.getByTestId('recovery').textContent).toBe('false'));
  });
});

describe('AuthContext credentials', () => {
  let emit: (event: string, session: unknown) => void;

  function CredentialsProbe() {
    const { user, changePassword, changeEmail } = useAuth();
    return (
      <div>
        <span data-testid="email">{user?.email ?? 'none'}</span>
        <button onClick={() => void changePassword('old', 'new')}>pw</button>
        <button onClick={() => void changeEmail('x@y.co')}>em</button>
      </div>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    authServiceMock.getSession.mockResolvedValue({ user: { id: 'u1', email: 'old@example.com' } });
    authServiceMock.changePassword.mockResolvedValue(undefined);
    authServiceMock.changeEmail.mockResolvedValue(undefined);
    authServiceMock.onAuthStateChange.mockImplementation(((cb: (e: string, s: unknown) => void) => {
      emit = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
  });

  function renderProbe() {
    return render(
      <MemoryRouter initialEntries={['/settings']}>
        <AuthProvider>
          <CredentialsProbe />
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('refreshes the user on USER_UPDATED so the displayed email follows the session', async () => {
    renderProbe();
    expect(await screen.findByText('old@example.com')).toBeInTheDocument();

    act(() => emit('USER_UPDATED', { user: { id: 'u1', email: 'new@example.com' } }));

    await waitFor(() => expect(screen.getByTestId('email').textContent).toBe('new@example.com'));
  });

  it('delegates changePassword and changeEmail to the service', async () => {
    renderProbe();
    await screen.findByText('old@example.com');

    fireEvent.click(screen.getByText('pw'));
    fireEvent.click(screen.getByText('em'));

    await waitFor(() => expect(authServiceMock.changePassword).toHaveBeenCalledWith('old', 'new'));
    expect(authServiceMock.changeEmail).toHaveBeenCalledWith('x@y.co');
  });
});
