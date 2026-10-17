import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authServiceMock = vi.hoisted(() => ({
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signIn: vi.fn(),
  signUp: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../../services/auth/authService', () => ({ authService: authServiceMock }));

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
