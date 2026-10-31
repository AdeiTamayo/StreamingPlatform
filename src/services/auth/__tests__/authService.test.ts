import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({
  supabase: { auth: authMock },
  requireSupabase: () => ({ auth: authMock }),
}));

import { authService, PASSWORD_RESET_PATH } from '../authService';

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
