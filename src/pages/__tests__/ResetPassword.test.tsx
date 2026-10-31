import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18n from '../../i18n';

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => auth.value }));

const toastSpy = vi.hoisted(() => vi.fn());
vi.mock('../../components/useToast', () => ({ useToast: () => toastSpy }));

import ResetPassword from '../ResetPassword';

const GOOD = 'N3w!Password-ok';

function setAuth(over: Record<string, unknown> = {}) {
  auth.value = {
    isPasswordRecovery: true,
    loading: false,
    updatePassword: vi.fn().mockResolvedValue(undefined),
    endPasswordRecovery: vi.fn(),
    openAuthModal: vi.fn(),
    ...over,
  };
  return auth.value as {
    updatePassword: ReturnType<typeof vi.fn>;
    endPasswordRecovery: ReturnType<typeof vi.fn>;
    openAuthModal: ReturnType<typeof vi.fn>;
  };
}

function renderPage(entry = '/reset-password') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const newPw = () => screen.getByLabelText(/^New password$/i, { selector: 'input' });
const confirmPw = () => screen.getByLabelText(/^Confirm Password$/i, { selector: 'input' });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));

describe('ResetPassword page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the form during a recovery session and saves a valid new password', async () => {
    const a = setAuth();
    renderPage();
    fireEvent.change(newPw(), { target: { value: GOOD } });
    fireEvent.change(confirmPw(), { target: { value: GOOD } });
    submit();

    await waitFor(() => expect(a.updatePassword).toHaveBeenCalledWith(GOOD));
    expect(await screen.findByText('home')).toBeInTheDocument();
    expect(toastSpy).toHaveBeenCalledWith('Your password has been updated.', { kind: 'info' });
  });

  it('rejects a weak password without calling the server', () => {
    const a = setAuth();
    renderPage();
    fireEvent.change(newPw(), { target: { value: 'short' } });
    fireEvent.change(confirmPw(), { target: { value: 'short' } });
    submit();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(a.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation without calling the server', () => {
    const a = setAuth();
    renderPage();
    fireEvent.change(newPw(), { target: { value: GOOD } });
    fireEvent.change(confirmPw(), { target: { value: GOOD + 'x' } });
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.');
    expect(a.updatePassword).not.toHaveBeenCalled();
  });

  it('shows a translated message, not the raw server text, when the update fails', async () => {
    setAuth({
      updatePassword: vi.fn().mockRejectedValue({ code: 'same_password', message: 'RAW SERVER TEXT' }),
    });
    renderPage();
    fireEvent.change(newPw(), { target: { value: GOOD } });
    fireEvent.change(confirmPw(), { target: { value: GOOD } });
    submit();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Choose a password different from your current one.');
    expect(alert).not.toHaveTextContent('RAW SERVER TEXT');
    expect(screen.queryByText('home')).not.toBeInTheDocument();
  });

  it('lets the user skip, ending the recovery state', () => {
    const a = setAuth();
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(a.endPasswordRecovery).toHaveBeenCalled();
    expect(screen.getByText('home')).toBeInTheDocument();
  });

  it('renders in Spanish', async () => {
    setAuth();
    await i18n.changeLanguage('es');
    renderPage();
    expect(screen.getByRole('heading', { name: 'Establece una nueva contraseña' })).toBeInTheDocument();
  });

  it('explains an expired link immediately when the URL carries an error', () => {
    setAuth({ isPasswordRecovery: false });
    renderPage('/reset-password#error=access_denied&error_code=otp_expired');
    expect(screen.getByRole('heading', { name: "This link can't be used" })).toBeInTheDocument();
  });

  it('waits for the recovery event on a recovery link, then times out to the invalid state', () => {
    vi.useFakeTimers();
    setAuth({ isPasswordRecovery: false });
    renderPage('/reset-password#access_token=a&type=recovery');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "This link can't be used" })).not.toBeInTheDocument();

    // Still waiting partway through the grace window (a valid link's event
    // arrives asynchronously; the invalid message must not flash first).
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.getByRole('heading', { name: "This link can't be used" })).toBeInTheDocument();
  });

  it('shows the invalid state when opened directly without a recovery session', () => {
    const a = setAuth({ isPasswordRecovery: false });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Request a new link' }));
    expect(a.openAuthModal).toHaveBeenCalled();
  });
});
