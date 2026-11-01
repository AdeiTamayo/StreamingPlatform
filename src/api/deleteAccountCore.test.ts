import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleDeleteAccount,
  REAUTH_WINDOW_MS,
  type AdminClient,
  type AdminUser,
  type DeleteAccountDeps,
} from './deleteAccountCore';

const NOW = Date.parse('2026-10-31T12:00:00Z');
const ORIGIN = 'https://app.example.com';
const iso = (ms: number) => new Date(ms).toISOString();

function makeUser(over: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'token-user',
    last_sign_in_at: iso(NOW - 60_000),
    app_metadata: { providers: ['email'] },
    ...over,
  };
}

function makeDeps(over: { user?: AdminUser | null; getUserError?: unknown } = {}) {
  const user = over.user === undefined ? makeUser() : over.user;
  const getUser = vi.fn(async () => ({
    data: user ? { user } : { user: null },
    error: over.getUserError ?? null,
  }));
  const deleteUser = vi.fn(async (_id: string): Promise<{ error: unknown }> => ({ error: null }));
  const signOut = vi.fn(
    async (_jwt: string, _scope?: 'global' | 'local' | 'others'): Promise<{ error: unknown }> => ({ error: null }),
  );
  const admin: AdminClient = { auth: { getUser, admin: { deleteUser, signOut } } };
  const logError = vi.fn();
  const deps: DeleteAccountDeps = {
    admin,
    deploymentOrigin: ORIGIN,
    now: () => NOW,
    logError,
  };
  return { deps, getUser, deleteUser, signOut, logError };
}

const valid = { method: 'POST', authorization: 'Bearer good.jwt.token', origin: ORIGIN };

describe('handleDeleteAccount', () => {
  let h: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    h = makeDeps();
  });

  it('answers GET with 405 and Allow: POST, without touching the admin client', async () => {
    const res = await handleDeleteAccount({ ...valid, method: 'GET' }, h.deps);
    expect(res.status).toBe(405);
    expect(res.headers.Allow).toBe('POST');
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects other methods and a missing method with 405', async () => {
    expect((await handleDeleteAccount({ ...valid, method: 'DELETE' }, h.deps)).status).toBe(405);
    expect((await handleDeleteAccount({ ...valid, method: undefined }, h.deps)).status).toBe(405);
  });

  it('rejects a missing Authorization header with 401', async () => {
    const res = await handleDeleteAccount({ ...valid, authorization: undefined }, h.deps);
    expect(res.status).toBe(401);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a non-Bearer or empty-token Authorization header with 401', async () => {
    for (const authorization of ['Basic abc', 'good.jwt.token', 'Bearer', 'Bearer ']) {
      const res = await handleDeleteAccount({ ...valid, authorization }, h.deps);
      expect(res.status).toBe(401);
    }
    expect(h.getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 401', async () => {
    h = makeDeps({ user: null, getUserError: { message: 'invalid JWT' } });
    const res = await handleDeleteAccount(valid, h.deps);
    expect(res.status).toBe(401);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a token that resolves to no user with 401', async () => {
    h = makeDeps({ user: null });
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(401);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('rejects a foreign Origin with 403 before looking the user up', async () => {
    const res = await handleDeleteAccount({ ...valid, origin: 'https://evil.example.net' }, h.deps);
    expect(res.status).toBe(403);
    expect(h.getUser).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('refuses any Origin when the deployment origin is unknown', async () => {
    h.deps.deploymentOrigin = null;
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(403);
  });

  it('accepts a request without an Origin header (same-origin fetch from a non-browser client)', async () => {
    const res = await handleDeleteAccount({ ...valid, origin: undefined }, h.deps);
    expect(res.status).toBe(204);
  });

  it('requires a fresh sign-in for password accounts: stale last_sign_in_at gives 403 reauth_required', async () => {
    h = makeDeps({ user: makeUser({ last_sign_in_at: iso(NOW - REAUTH_WINDOW_MS - 1_000) }) });
    const res = await handleDeleteAccount(valid, h.deps);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'reauth_required' });
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it('treats a missing or unparseable last_sign_in_at as stale for password accounts', async () => {
    for (const last_sign_in_at of [null, undefined, 'not-a-date']) {
      h = makeDeps({ user: makeUser({ last_sign_in_at }) });
      const res = await handleDeleteAccount(valid, h.deps);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'reauth_required' });
    }
  });

  it('accepts a sign-in just inside the freshness window', async () => {
    h = makeDeps({ user: makeUser({ last_sign_in_at: iso(NOW - REAUTH_WINDOW_MS + 1_000) }) });
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(204);
  });

  it('fails safe: no provider information means the freshness check applies', async () => {
    h = makeDeps({ user: makeUser({ app_metadata: null, last_sign_in_at: iso(NOW - 3_600_000) }) });
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(403);
  });

  it('skips the freshness check for accounts without a password (Google only)', async () => {
    h = makeDeps({
      user: makeUser({
        app_metadata: { providers: ['google'] },
        last_sign_in_at: iso(NOW - 24 * 3_600_000),
      }),
    });
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(204);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
  });

  it('still requires freshness when a Google account also has a password identity', async () => {
    h = makeDeps({
      user: makeUser({
        app_metadata: { providers: ['google', 'email'] },
        last_sign_in_at: iso(NOW - 3_600_000),
      }),
    });
    expect((await handleDeleteAccount(valid, h.deps)).status).toBe(403);
  });

  it('deletes exactly once with the token user id and returns 204', async () => {
    const res = await handleDeleteAccount(valid, h.deps);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
    expect(h.getUser).toHaveBeenCalledWith('good.jwt.token');
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
    expect(h.deleteUser).toHaveBeenCalledWith('token-user');
  });

  it('ignores a different user id smuggled in the body or the query', async () => {
    const hostile = {
      ...valid,
      body: { id: 'victim-user', user_id: 'victim-user' },
      query: { id: 'victim-user', user_id: 'victim-user' },
    };
    const res = await handleDeleteAccount(hostile, h.deps);
    expect(res.status).toBe(204);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
    expect(h.deleteUser).toHaveBeenCalledWith('token-user');
    expect(h.deleteUser).not.toHaveBeenCalledWith('victim-user');
  });

  it('returns a generic 500 without the underlying message when deleteUser fails', async () => {
    h.deleteUser.mockResolvedValue({ error: { message: 'FK violation on secret_table row 42' } });
    const res = await handleDeleteAccount(valid, h.deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res)).not.toMatch(/FK violation|secret_table|row 42/);
    expect(h.logError).toHaveBeenCalledWith(
      'delete-account.deleteUser',
      expect.objectContaining({ message: expect.stringContaining('FK violation') }),
    );
  });

  it('returns a generic 500 when deleteUser throws', async () => {
    h.deleteUser.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5'));
    const res = await handleDeleteAccount(valid, h.deps);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });

  it('sends Cache-Control: no-store on every response', async () => {
    h.deleteUser.mockResolvedValueOnce({ error: { message: 'x' } });
    const responses = [
      await handleDeleteAccount({ ...valid, method: 'GET' }, h.deps),
      await handleDeleteAccount({ ...valid, authorization: undefined }, h.deps),
      await handleDeleteAccount({ ...valid, origin: 'https://evil.example.net' }, h.deps),
      await handleDeleteAccount(valid, h.deps), // 500
      await handleDeleteAccount(valid, h.deps), // 204
    ];
    expect(responses.map((r) => r.status)).toEqual([405, 401, 403, 500, 204]);
    for (const r of responses) expect(r.headers['Cache-Control']).toBe('no-store');
  });
});

describe('handleDeleteAccount session revocation', () => {
  it("revokes every session of the caller (global scope, the caller's own token) before deleting", async () => {
    const h = makeDeps();
    const res = await handleDeleteAccount(valid, h.deps);

    expect(res.status).toBe(204);
    expect(h.signOut).toHaveBeenCalledTimes(1);
    expect(h.signOut).toHaveBeenCalledWith('good.jwt.token', 'global');
    expect(h.signOut.mock.invocationCallOrder[0]).toBeLessThan(h.deleteUser.mock.invocationCallOrder[0]);
  });

  it('still deletes the account when revoking sessions returns an error, and logs it server-side only', async () => {
    const h = makeDeps();
    h.signOut.mockResolvedValue({ error: { message: 'SECRET revoke detail' } });

    const res = await handleDeleteAccount(valid, h.deps);

    expect(res.status).toBe(204);
    expect(h.deleteUser).toHaveBeenCalledWith('token-user');
    expect(h.logError).toHaveBeenCalledWith('delete-account.revokeSessions', expect.anything());
    expect(JSON.stringify(res)).not.toContain('SECRET');
  });

  it('still deletes the account when revoking sessions throws', async () => {
    const h = makeDeps();
    h.signOut.mockRejectedValue(new Error('SECRET network'));

    const res = await handleDeleteAccount(valid, h.deps);

    expect(res.status).toBe(204);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(res)).not.toContain('SECRET');
  });

  it('does not revoke anything for a request that is refused', async () => {
    const refused = [
      { ...valid, method: 'GET' },
      { ...valid, authorization: undefined },
      { ...valid, origin: 'https://evil.example' },
    ];
    for (const req of refused) {
      const h = makeDeps();
      await handleDeleteAccount(req, h.deps);
      expect(h.signOut).not.toHaveBeenCalled();
    }
    const stale = makeDeps({ user: makeUser({ last_sign_in_at: iso(NOW - REAUTH_WINDOW_MS - 1000) }) });
    expect((await handleDeleteAccount(valid, stale.deps)).status).toBe(403);
    expect(stale.signOut).not.toHaveBeenCalled();
  });
});
