import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: authMock },
  requireSupabase: () => ({ auth: authMock }),
}));

import {
  authService,
  PASSWORD_RESET_PATH,
  ACCOUNT_SETTINGS_PATH,
  DELETE_ACCOUNT_PATH,
  SIGNUP_REDIRECT_PATH,
} from '../authService';

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

describe('authService deleteAccount', () => {
  const passwordUser = {
    id: 'u1',
    email: 'me@example.com',
    app_metadata: { providers: ['email'] },
  };
  const googleUser = {
    id: 'g1',
    email: 'me@gmail.com',
    app_metadata: { providers: ['google'] },
  };
  let fetchMock: ReturnType<typeof vi.fn>;

  function sessionFor(user: unknown, token = 'old-token') {
    authMock.getSession.mockResolvedValue({
      data: { session: { user, access_token: token } },
      error: null,
    });
  }
  const response = (status: number, body?: unknown) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === undefined) throw new Error('no body');
        return body;
      },
    }) as Response;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionFor(passwordUser);
    authMock.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'fresh-token' } },
      error: null,
    });
    fetchMock = vi.fn().mockResolvedValue(response(204));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('re-authenticates first, then posts with the fresh access token', async () => {
    await authService.deleteAccount('Old!Password-1');
    expect(authMock.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'Old!Password-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(DELETE_ACCOUNT_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer fresh-token' },
    });
    expect(authMock.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it('sends no body and no user id: the server takes it from the token', async () => {
    await authService.deleteAccount('Old!Password-1');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(DELETE_ACCOUNT_PATH).toBe('/api/delete-account');
  });

  it('does not call the server when the password is wrong', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', code: 'invalid_credentials', name: 'AuthApiError' },
    });
    await expect(authService.deleteAccount('wrong')).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not call the server when a password account supplies no password', async () => {
    await expect(authService.deleteAccount()).rejects.toMatchObject({ code: 'invalid_credentials' });
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects with a session-expired error when nobody is signed in', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(authService.deleteAccount('x')).rejects.toMatchObject({
      code: 'session_not_found',
      name: 'AuthSessionMissingError',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the password step for Google-only accounts and uses the session token', async () => {
    sessionFor(googleUser, 'google-token');
    await authService.deleteAccount();
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(DELETE_ACCOUNT_PATH, {
      method: 'POST',
      headers: { Authorization: 'Bearer google-token' },
    });
  });

  it('maps 403 reauth_required to a coded error', async () => {
    fetchMock.mockResolvedValue(response(403, { error: 'reauth_required' }));
    await expect(authService.deleteAccount('Old!Password-1')).rejects.toMatchObject({
      code: 'reauth_required',
    });
  });

  it('maps any other failure to a generic code and never carries the server text', async () => {
    for (const res of [
      response(500, { error: 'FK violation on secret_table' }),
      response(403, { error: 'forbidden_origin' }),
      response(401, { error: 'unauthorized' }),
      response(502),
    ]) {
      fetchMock.mockResolvedValue(res);
      const err = await authService.deleteAccount('Old!Password-1').catch((e) => e);
      expect(err).toMatchObject({ code: 'delete_account_failed' });
      expect(JSON.stringify(err)).not.toMatch(/secret_table|forbidden_origin|unauthorized/);
    }
  });

  it('turns a network failure into a coded error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(authService.deleteAccount('Old!Password-1')).rejects.toMatchObject({
      message: 'Failed to fetch',
    });
  });
});

describe('authService sign-up confirmation email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.signUp.mockResolvedValue({ data: { user: { id: 'u' }, session: null }, error: null });
  });

  it('asks Supabase to send the confirmation link back to the current origin', async () => {
    await authService.signUp('a@b.co', 'N3w!Password-ok');
    expect(authMock.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'N3w!Password-ok',
      options: { emailRedirectTo: `${window.location.origin}${SIGNUP_REDIRECT_PATH}` },
    });
    expect(SIGNUP_REDIRECT_PATH).toBe('/');
  });

  it('still hides whether an address is already registered', async () => {
    authMock.signUp.mockResolvedValue({ data: null, error: { message: 'User already registered', code: 'user_already_exists' } });
    await expect(authService.signUp('a@b.co', 'x')).resolves.toEqual({ user: null, session: null });
  });
});
