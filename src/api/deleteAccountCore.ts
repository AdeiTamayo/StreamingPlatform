import { hasPasswordIdentity } from '../utils/authProviders';

// Server-side logic for POST /api/delete-account. It lives in src/ so it can be
// unit tested, but it never touches the service-role key itself: the Vercel
// wrapper (api/delete-account.ts) builds the admin client and injects it. Do not
// import a Supabase service client from here or from anything the browser
// bundle reaches.

/** A fresh login is required for password accounts: sign-in no older than this. */
export const REAUTH_WINDOW_MS = 5 * 60_000;

export interface DeleteAccountRequest {
  method?: string;
  authorization?: string;
  origin?: string;
}

export interface DeleteAccountResponse {
  status: number;
  headers: Record<string, string>;
  body?: { error: string };
}

export interface AdminUser {
  id: string;
  last_sign_in_at?: string | null;
  app_metadata?: { providers?: unknown; provider?: unknown } | null;
}

/** The slice of the Supabase admin client this handler uses. */
export interface AdminClient {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: AdminUser | null } | null;
      error: unknown;
    }>;
    admin: {
      /** Revokes the user's sessions (refresh tokens) on the Auth server. */
      signOut(jwt: string, scope?: 'global' | 'local' | 'others'): Promise<{ error: unknown }>;
      deleteUser(id: string): Promise<{ error: unknown }>;
    };
  };
}

export interface DeleteAccountDeps {
  admin: AdminClient;
  /**
   * Origin of this deployment (e.g. https://app.example.com), taken from the
   * request's own host by the wrapper. When null, any request that carries an
   * Origin header is refused.
   */
  deploymentOrigin: string | null;
  now?: () => number;
  /** Server-side logging only; details never reach the response. */
  logError?: (context: string, err: unknown) => void;
}

function respond(
  status: number,
  error?: string,
  extraHeaders: Record<string, string> = {},
): DeleteAccountResponse {
  const headers = { 'Cache-Control': 'no-store', ...extraHeaders };
  return error ? { status, headers, body: { error } } : { status, headers };
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match ? match[1] : null;
}

export async function handleDeleteAccount(
  req: DeleteAccountRequest,
  deps: DeleteAccountDeps,
): Promise<DeleteAccountResponse> {
  const now = deps.now ?? Date.now;
  const logError = deps.logError ?? (() => {});

  if (req.method !== 'POST') {
    return respond(405, 'method_not_allowed', { Allow: 'POST' });
  }

  const jwt = bearerToken(req.authorization);
  if (!jwt) return respond(401, 'unauthorized');

  // A cross-site page can make the browser send this POST; the Authorization
  // header makes that unlikely, and this check closes the gap.
  if (req.origin !== undefined && req.origin !== deps.deploymentOrigin) {
    return respond(403, 'forbidden_origin');
  }

  let user: AdminUser | null;
  try {
    const { data, error } = await deps.admin.auth.getUser(jwt);
    if (error || !data?.user) return respond(401, 'unauthorized');
    user = data.user;
  } catch (err) {
    logError('delete-account.getUser', err);
    return respond(500, 'delete_failed');
  }

  // Password accounts must have signed in moments ago, so a stolen but
  // still-open session cannot delete the account on its own.
  if (hasPasswordIdentity(user)) {
    const signedInAt = user.last_sign_in_at ? Date.parse(user.last_sign_in_at) : NaN;
    if (!Number.isFinite(signedInAt) || now() - signedInAt > REAUTH_WINDOW_MS) {
      return respond(403, 'reauth_required');
    }
  }

  // Revoke every session first, so other devices lose their refresh tokens
  // even if something goes wrong while the user row is being removed. An
  // already-issued access token cannot be revoked and stays accepted until it
  // expires; the client's session check is what ends it sooner. A failure here
  // must not block the deletion the user asked for.
  try {
    const { error } = await deps.admin.auth.admin.signOut(jwt, 'global');
    if (error) logError('delete-account.revokeSessions', error);
  } catch (err) {
    logError('delete-account.revokeSessions', err);
  }

  try {
    // The id comes only from the verified token. Nothing in the request body
    // or query is ever read.
    const { error } = await deps.admin.auth.admin.deleteUser(user.id);
    if (error) {
      logError('delete-account.deleteUser', error);
      return respond(500, 'delete_failed');
    }
  } catch (err) {
    logError('delete-account.deleteUser', err);
    return respond(500, 'delete_failed');
  }

  return respond(204);
}
