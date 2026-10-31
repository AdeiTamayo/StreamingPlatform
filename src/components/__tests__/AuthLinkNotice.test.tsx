import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import i18n from '../../i18n';

const link = vi.hoisted(() => ({
  current: { type: null as string | null, errorCode: null as string | null, hasError: false },
  strip: vi.fn(),
}));
vi.mock('../../lib/authLink', () => ({
  get initialAuthLink() {
    return link.current;
  },
  stripAuthParams: link.strip,
}));

const auth = vi.hoisted(() => ({ isAuthenticated: false }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth }));

const toast = vi.hoisted(() => vi.fn());
vi.mock('../useToast', () => ({ useToast: () => toast }));

import AuthLinkNotice from '../AuthLinkNotice';

describe('AuthLinkNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    link.current = { type: null, errorCode: null, hasError: false };
    auth.isAuthenticated = false;
    window.history.replaceState(null, '', '/');
  });

  it('shows a translated message for an expired link and removes the parameters', () => {
    link.current = { type: null, errorCode: 'otp_expired', hasError: true };
    render(<AuthLinkNotice />);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toMatch(/expired or was already used/i);
    expect(toast.mock.calls[0][1]).toMatchObject({ kind: 'error' });
    expect(link.strip).toHaveBeenCalledTimes(1);
  });

  it('uses the generic message for an unknown link error, never the server text', () => {
    link.current = { type: null, errorCode: 'server_error', hasError: true };
    render(<AuthLinkNotice />);
    expect(toast.mock.calls[0][0]).toBe('Something went wrong. Please try again.');
  });

  it('stays silent on the reset page, which renders its own invalid-link state', () => {
    window.history.replaceState(null, '', '/reset-password');
    link.current = { type: null, errorCode: 'otp_expired', hasError: true };
    render(<AuthLinkNotice />);
    expect(toast).not.toHaveBeenCalled();
    expect(link.strip).not.toHaveBeenCalled();
  });

  it('confirms a sign-up link once the user is signed in, and only once', () => {
    link.current = { type: 'signup', errorCode: null, hasError: false };
    const { rerender } = render(<AuthLinkNotice />);
    expect(toast).not.toHaveBeenCalled();

    auth.isAuthenticated = true;
    rerender(<AuthLinkNotice />);
    rerender(<AuthLinkNotice />);

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toBe("Email confirmed. You're signed in.");
  });

  it('does nothing for an ordinary visit', () => {
    auth.isAuthenticated = true;
    render(<AuthLinkNotice />);
    expect(toast).not.toHaveBeenCalled();
  });

  it('is translated', async () => {
    await i18n.changeLanguage('es');
    link.current = { type: 'signup', errorCode: null, hasError: false };
    auth.isAuthenticated = true;
    render(<AuthLinkNotice />);
    expect(toast.mock.calls[0][0]).toBe('Correo confirmado. Has iniciado sesión.');
  });
});
