import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import i18n from '../../i18n';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock('../../components/useToast', () => ({ useToast: () => toastSpy }));

const logErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('../../utils/logger', () => ({ logError: logErrorSpy, logDebug: vi.fn() }));

const exportSupabaseData = vi.hoisted(() => vi.fn());
vi.mock('../../api/storageBackup', () => ({
  exportSupabaseData,
  importSupabaseData: vi.fn(),
  isSupabaseBackupEmpty: vi.fn(),
}));

import Settings from '../Settings';

const passwordUser = { id: 'u1', email: 'me@example.com', app_metadata: { providers: ['email'] } };
const googleUser = { id: 'g1', email: 'me@gmail.com', app_metadata: { providers: ['google'] } };

function setAuth(over: Record<string, unknown> = {}) {
  auth.value = {
    user: passwordUser,
    signOut: vi.fn(),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn(),
    changeEmail: vi.fn(),
    ...over,
  };
  return auth.value as { deleteAccount: ReturnType<typeof vi.fn> };
}

const openButton = () => screen.getByRole('button', { name: 'Delete account' });
const confirmButton = () => screen.getByRole('button', { name: 'Delete my account' });
const wordInput = () => screen.getByLabelText(/^Type DELETE to confirm$/i, { selector: 'input' });
const passwordInput = () => screen.getByLabelText(/^Current password$/i, { selector: 'input' });

async function renderAndOpen() {
  render(<Settings />);
  fireEvent.click(openButton());
  return screen.findByRole('dialog', { name: 'Delete your account?' });
}

describe('Settings > delete account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers Delete account and Export my data side by side in the Account card', () => {
    setAuth();
    render(<Settings />);
    expect(openButton()).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    expect(exportSupabaseData).toHaveBeenCalledTimes(1);
  });

  it('opens a modal dialog that says plainly what is deleted and focuses Cancel first', async () => {
    setAuth();
    const dialog = await renderAndOpen();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(/account/i);
    expect(dialog).toHaveTextContent(/library/i);
    expect(dialog).toHaveTextContent(/watch history/i);
    expect(dialog).toHaveTextContent(/search history/i);
    expect(dialog).toHaveTextContent(/Continue Watching/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
    expect(screen.getByRole('button', { name: 'Cancel', hidden: false })).toHaveFocus();
  });

  it('keeps the confirm button disabled until the word and the password are both filled', async () => {
    setAuth();
    await renderAndOpen();
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(wordInput(), { target: { value: '' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(wordInput(), { target: { value: 'DELET' } });
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(wordInput(), { target: { value: 'delete ' } });
    expect(confirmButton()).toBeEnabled();
  });

  it('does not call deleteAccount when submitted while the form is incomplete', async () => {
    const a = setAuth();
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.submit(wordInput().closest('form') as HTMLFormElement);
    expect(a.deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes with the typed password and shows a toast on success', async () => {
    const a = setAuth();
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(a.deleteAccount).toHaveBeenCalledWith('Old!Password-1'));
    expect(a.deleteAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith('Your account and data have been deleted.'));
  });

  it('shows the translated wrong-password message and keeps the dialog open', async () => {
    const a = setAuth();
    a.deleteAccount.mockRejectedValue({ message: 'Invalid login credentials', code: 'invalid_credentials' });
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'nope' } });
    fireEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('never renders a raw server message', async () => {
    const a = setAuth();
    a.deleteAccount.mockRejectedValue({
      message: 'Account deletion failed (500): FK violation on secret_table',
      code: 'delete_account_failed',
    });
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    fireEvent.click(confirmButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).not.toHaveTextContent(/secret_table|FK violation/);
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it('maps reauth_required to its own translated copy', async () => {
    const a = setAuth();
    a.deleteAccount.mockRejectedValue({ message: 'x', code: 'reauth_required' });
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    fireEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/Enter your password again/i);
  });

  it('skips the password field for accounts without a password and confirms with the word alone', async () => {
    const a = setAuth({ user: googleUser });
    await renderAndOpen();
    expect(screen.queryByLabelText(/^Current password$/i)).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();

    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());

    await waitFor(() => expect(a.deleteAccount).toHaveBeenCalledWith(undefined));
  });

  it('closes on Escape and returns focus to the Delete account button', async () => {
    setAuth();
    await renderAndOpen();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(openButton()).toHaveFocus();
  });

  it('clears what was typed when the dialog is closed and reopened', async () => {
    setAuth();
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    expect(wordInput()).toHaveValue('');
    expect(passwordInput()).toHaveValue('');
  });

  it('traps Tab inside the dialog', async () => {
    // jsdom has no layout, so offsetParent is always null and the trap's
    // visibility filter would see no focusable elements. Report every element
    // as laid out for this test.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get() {
        return this.parentNode;
      },
    });
    try {
      setAuth({ user: googleUser });
      await renderAndOpen();
      const cancel = screen.getByRole('button', { name: 'Cancel' });
      cancel.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(wordInput()).toHaveFocus();

      wordInput().focus();
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(cancel).toHaveFocus();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
    }
  });

  it('cannot be dismissed with Escape or Cancel while the request is in flight', async () => {
    const a = setAuth();
    let finish: () => void = () => {};
    a.deleteAccount.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    await renderAndOpen();
    fireEvent.change(wordInput(), { target: { value: 'DELETE' } });
    fireEvent.change(passwordInput(), { target: { value: 'Old!Password-1' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(screen.getByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-busy', 'true'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => finish());
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
  });

  it('uses the localized confirmation word in Spanish', async () => {
    const a = setAuth();
    await i18n.changeLanguage('es');
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }));
    const input = await screen.findByLabelText(/^Escribe ELIMINAR para confirmar$/i, { selector: 'input' });
    fireEvent.change(
      screen.getByLabelText(/^Contraseña actual$/i, { selector: 'input' }),
      { target: { value: 'Old!Password-1' } },
    );
    const confirm = screen.getByRole('button', { name: 'Eliminar mi cuenta' });

    fireEvent.change(input, { target: { value: 'DELETE' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'ELIMINAR' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    await waitFor(() => expect(a.deleteAccount).toHaveBeenCalledWith('Old!Password-1'));
  });
});
