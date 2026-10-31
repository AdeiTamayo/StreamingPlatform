import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../../i18n';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const logErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/logger', () => ({ logError: logErrorSpy, logDebug: vi.fn() }));

import LoginForm from '../LoginForm';
import RegisterForm from '../RegisterForm';
import ForgotPasswordForm from '../ForgotPasswordForm';

const GOOD = 'N3w!Password-ok';

function reject(code: string, message: string) {
  return vi.fn().mockRejectedValue({ code, message });
}

describe('auth forms render translated errors, never the raw message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('LoginForm: invalid credentials', async () => {
    const raw = 'Invalid login credentials';
    const err = { code: 'invalid_credentials', message: raw };
    auth.value = { signIn: vi.fn().mockRejectedValue(err) };
    render(<LoginForm onSwitchToRegister={vi.fn()} onSwitchToForgot={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i, { selector: 'input' }), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email or password is incorrect.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(logErrorSpy).toHaveBeenCalledWith('auth.signIn', err);
  });

  it('RegisterForm: sign-ups disabled', async () => {
    const raw = 'Signups not allowed for this instance';
    const err = { code: 'signup_disabled', message: raw };
    auth.value = { signUp: vi.fn().mockRejectedValue(err) };
    render(<RegisterForm onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i, { selector: 'input' }), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i, { selector: 'input' }), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('New sign-ups are turned off right now.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(logErrorSpy).toHaveBeenCalledWith('auth.signUp', err);
  });

  it('ForgotPasswordForm: rate limited', async () => {
    const raw = 'email rate limit exceeded';
    const err = { code: 'over_email_send_rate_limit', message: raw };
    auth.value = { resetPassword: vi.fn().mockRejectedValue(err) };
    render(<ForgotPasswordForm onSwitchToLogin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/^Email$/i), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Reset Link' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Too many attempts. Please wait a moment and try again.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(logErrorSpy).toHaveBeenCalledWith('auth.resetPassword', err);
  });

  it('LoginForm renders the Spanish copy when the language is Spanish', async () => {
    await i18n.changeLanguage('es');
    auth.value = { signIn: reject('invalid_credentials', 'Invalid login credentials') };
    render(<LoginForm onSwitchToRegister={vi.fn()} onSwitchToForgot={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i, { selector: 'input' }), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: /^Iniciar sesión$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('El correo o la contraseña no son correctos.');
    expect(screen.queryByText('Invalid login credentials')).not.toBeInTheDocument();
  });
});
