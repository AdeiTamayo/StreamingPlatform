import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: authMock },
  requireSupabase: () => ({ auth: authMock }),
}));

import { authService, PASSWORD_RESET_PATH, ACCOUNT_SETTINGS_PATH } from '../authService';

describe('authService password recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.resetPasswordForEmail.mockResolvedValue({ error: null });
    authMock.updateUser.mockResolvedValue({ data: {}, error: null });
    authMock.signOut.mockResolvedValue({ error: null });
  });

  it('sends the reset email with a redirect to the set-new-password route', async () => {
    await authService.resetPassword('a@b.co');
    expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: `${window.location.origin}${PASSWORD_RESET_PATH}`,
    });
    expect(PASSWORD_RESET_PATH).toBe('/reset-password');
  });

  it('updates the password, then signs out the other sessions', async () => {
    await authService.updatePassword('N3w!Password-ok');
    expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'N3w!Password-ok' });
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(authMock.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      authMock.signOut.mock.invocationCallOrder[0],
    );
  });

  it('rejects with the code preserved and does not sign out others when the update fails', async () => {
    authMock.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'same', code: 'same_password', name: 'AuthApiError' },
    });
    await expect(authService.updatePassword('x')).rejects.toMatchObject({
      code: 'same_password',
      name: 'AuthApiError',
    });
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it('still reports success when signing out the other sessions fails', async () => {
    authMock.signOut.mockRejectedValue(new Error('network'));
    await expect(authService.updatePassword('N3w!Password-ok')).resolves.toBeUndefined();
  });
});

describe('authService changePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', email: 'me@example.com' } } },
      error: null,
    });
    authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    authMock.updateUser.mockResolvedValue({ data: {}, error: null });
    authMock.signOut.mockResolvedValue({ error: null });
  });

  it('re-authenticates with the session email and current password before updating', async () => {
    await authService.changePassword('Old!Password-1', 'N3w!Password-ok');
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'Old!Password-1',
    });
    expect(authMock.updateUser).toHaveBeenCalledWith({ password: 'N3w!Password-ok' });
    expect(authMock.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      authMock.updateUser.mock.invocationCallOrder[0],
    );
  });

  it('signs out the other sessions after the update', async () => {
    await authService.changePassword('Old!Password-1', 'N3w!Password-ok');
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(authMock.updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      authMock.signOut.mock.invocationCallOrder[0],
    );
  });

  it('does not update or sign out others when the current password is wrong', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', name: 'AuthApiError' },
    });
    await expect(authService.changePassword('wrong', 'N3w!Password-ok')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
    expect(authMock.updateUser).not.toHaveBeenCalled();
    expect(authMock.signOut).not.toHaveBeenCalled();
  });

  it('rejects with a session-expired error and never tries to sign in when there is no session', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authService.changePassword('a', 'b')).rejects.toMatchObject({
      code: 'session_not_found',
      name: 'AuthSessionMissingError',
    });
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(authMock.updateUser).not.toHaveBeenCalled();
  });

  it('still resolves when signing out the other sessions fails', async () => {
    authMock.signOut.mockRejectedValue(new Error('network'));
    await expect(authService.changePassword('Old!Password-1', 'N3w!Password-ok')).resolves.toBeUndefined();
  });
});

describe('authService changeEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  it('requests the change with an emailRedirectTo back to Settings', async () => {
    await authService.changeEmail('new@example.com');
    expect(ACCOUNT_SETTINGS_PATH).toBe('/settings');
    expect(authMock.updateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
  });

  it('rejects with the code preserved (e.g. email_exists)', async () => {
    authMock.updateUser.mockResolvedValue({
      data: null,
      error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
    });
    await expect(authService.changeEmail('taken@example.com')).rejects.toMatchObject({
      code: 'email_exists',
    });
  });
});
