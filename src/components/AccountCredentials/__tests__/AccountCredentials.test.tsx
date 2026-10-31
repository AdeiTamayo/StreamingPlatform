import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../../i18n';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock('../../useToast', () => ({ useToast: () => toastSpy }));

const logErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/logger', () => ({ logError: logErrorSpy, logDebug: vi.fn() }));

import AccountCredentials from '../AccountCredentials';

const OLD = 'Old!Password-1';
const GOOD = 'N3w!Password-ok';

function setAuth(over: Record<string, unknown> = {}) {
  auth.value = {
    changePassword: vi.fn().mockResolvedValue(undefined),
    changeEmail: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
  return auth.value as {
    changePassword: ReturnType<typeof vi.fn>;
    changeEmail: ReturnType<typeof vi.fn>;
  };
}

const openPasswordForm = () => fireEvent.click(screen.getByRole('button', { name: /Change password/i }));
const openEmailForm = () => fireEvent.click(screen.getByRole('button', { name: /Change email/i }));
const current = () => screen.getByLabelText(/^Current password$/i, { selector: 'input' });
const next = () => screen.getByLabelText(/^New password$/i, { selector: 'input' });
const confirm = () => screen.getByLabelText(/^Confirm Password$/i, { selector: 'input' });
const submitPassword = () => fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

function fillPasswords(cur: string, pw: string, conf: string) {
  fireEvent.change(current(), { target: { value: cur } });
  fireEvent.change(next(), { target: { value: pw } });
  fireEvent.change(confirm(), { target: { value: conf } });
}

describe('AccountCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts collapsed and opens one form at a time', () => {
    setAuth();
    render(<AccountCredentials />);
    expect(screen.queryByLabelText(/^Current password$/i)).not.toBeInTheDocument();

    openPasswordForm();
    expect(screen.getByRole('button', { name: /Change password/i })).toHaveAttribute('aria-expanded', 'true');
    expect(current()).toBeInTheDocument();

    openEmailForm();
    expect(screen.queryByLabelText(/^Current password$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^New email address$/i)).toBeInTheDocument();
  });
});

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('changes the password, toasts and collapses on success', async () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(OLD, GOOD, GOOD);
    submitPassword();

    await waitFor(() => expect(a.changePassword).toHaveBeenCalledWith(OLD, GOOD));
    expect(toastSpy).toHaveBeenCalledWith('Your password has been updated.', { kind: 'info' });
    await waitFor(() => expect(screen.queryByLabelText(/^Current password$/i)).not.toBeInTheDocument());
  });

  it('shows a translated message for a wrong current password, never the raw one', async () => {
    const raw = 'Invalid login credentials';
    const err = { code: 'invalid_credentials', message: raw };
    const a = setAuth({ changePassword: vi.fn().mockRejectedValue(err) });
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords('wrong', GOOD, GOOD);
    submitPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(a.changePassword).toHaveBeenCalledTimes(1);
    expect(logErrorSpy).toHaveBeenCalledWith('auth.changePassword', err);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('shows translated copy, not the raw text, for any other server error', async () => {
    const raw = 'database exploded: secret detail';
    setAuth({ changePassword: vi.fn().mockRejectedValue({ code: 'unexpected', message: raw }) });
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(OLD, GOOD, GOOD);
    submitPassword();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
  });

  it('does not call the service for a weak new password', () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(OLD, 'short', 'short');
    submitPassword();

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 12 characters/i);
    expect(a.changePassword).not.toHaveBeenCalled();
  });

  it('does not call the service when the confirmation does not match', () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(OLD, GOOD, GOOD + 'x');
    submitPassword();

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(a.changePassword).not.toHaveBeenCalled();
  });

  it('does not call the service when the new password equals the current one', () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(GOOD, GOOD, GOOD);
    submitPassword();

    expect(screen.getByRole('alert')).toHaveTextContent('Choose a password different from your current one.');
    expect(a.changePassword).not.toHaveBeenCalled();
  });

  it('requires the current password', () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords('', GOOD, GOOD);
    submitPassword();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(a.changePassword).not.toHaveBeenCalled();
  });

  it('disables the inputs while submitting', async () => {
    let release: () => void = () => {};
    setAuth({ changePassword: vi.fn(() => new Promise<void>((res) => { release = res; })) });
    render(<AccountCredentials />);
    openPasswordForm();
    fillPasswords(OLD, GOOD, GOOD);
    submitPassword();

    await waitFor(() => expect(current()).toBeDisabled());
    expect(next()).toBeDisabled();
    expect(confirm()).toBeDisabled();
    release();
    await waitFor(() => expect(screen.queryByLabelText(/^Current password$/i)).not.toBeInTheDocument());
  });

  it('renders the Spanish copy and error when the language is Spanish', async () => {
    await i18n.changeLanguage('es');
    setAuth({ changePassword: vi.fn().mockRejectedValue({ code: 'invalid_credentials', message: 'Invalid login credentials' }) });
    render(<AccountCredentials />);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar contraseña/i }));
    fireEvent.change(screen.getByLabelText(/^Contraseña actual$/i, { selector: 'input' }), { target: { value: 'mala' } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña$/i, { selector: 'input' }), { target: { value: GOOD } });
    fireEvent.change(screen.getByLabelText(/^Confirmar contraseña$/i, { selector: 'input' }), { target: { value: GOOD } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La contraseña actual no es correcta.');
    expect(screen.queryByText('Invalid login credentials')).not.toBeInTheDocument();
  });
});

describe('ChangeEmailForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const emailInput = () => screen.getByLabelText(/^New email address$/i);
  const submitEmail = () => fireEvent.click(screen.getByRole('button', { name: 'Send confirmation' }));

  it('requests the change and tells the user to check both inboxes', async () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openEmailForm();
    fireEvent.change(emailInput(), { target: { value: ' new@example.com ' } });
    submitEmail();

    await waitFor(() => expect(a.changeEmail).toHaveBeenCalledWith('new@example.com'));
    expect(await screen.findByRole('status')).toHaveTextContent(/both your current and your new address/i);
    expect(toastSpy).toHaveBeenCalledWith('Confirmation links sent. Check both inboxes.', { kind: 'info' });
  });

  it('rejects a malformed address without calling the service', () => {
    const a = setAuth();
    render(<AccountCredentials />);
    openEmailForm();
    fireEvent.change(emailInput(), { target: { value: 'not-an-email' } });
    submitEmail();

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(a.changeEmail).not.toHaveBeenCalled();
  });

  it('shows the translated "already registered" copy for email_exists, never the raw message', async () => {
    const raw = 'A user with this email address has already been registered';
    const err = { code: 'email_exists', message: raw };
    setAuth({ changeEmail: vi.fn().mockRejectedValue(err) });
    render(<AccountCredentials />);
    openEmailForm();
    fireEvent.change(emailInput(), { target: { value: 'taken@example.com' } });
    submitEmail();

    expect(await screen.findByRole('alert')).toHaveTextContent('This email is already registered. Try signing in instead.');
    expect(screen.queryByText(raw)).not.toBeInTheDocument();
    expect(logErrorSpy).toHaveBeenCalledWith('auth.changeEmail', err);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('renders the Spanish success copy when the language is Spanish', async () => {
    await i18n.changeLanguage('es');
    setAuth();
    render(<AccountCredentials />);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar correo/i }));
    fireEvent.change(screen.getByLabelText(/^Nuevo correo electrónico$/i), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar confirmación' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Revisa la bandeja de entrada de tu correo actual y del nuevo/i);
  });
});
