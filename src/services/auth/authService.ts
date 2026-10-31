import { requireSupabase, supabase } from '../../lib/supabase';
import { hasPasswordIdentity } from '../../utils/authProviders';

export interface AuthError {
  message: string;
  code?: string;
  /** Error class name (e.g. AuthSessionMissingError), which carries no `code`. */
  name?: string;
}

function toAuthError(err: unknown): AuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    const source = err as { message: unknown; code?: string; name?: string };
    return { message: String(source.message), code: source.code, name: source.name };
  }
  return { message: String(err) };
}

// Server route that deletes the signed-in account (api/delete-account.ts).
// Needs the service-role key, which must never reach the browser.
export const DELETE_ACCOUNT_PATH = '/api/delete-account';

// Path the password-reset email links to. It must be listed under
// Authentication > URL Configuration > Redirect URLs in the Supabase project,
// otherwise Supabase falls back to the Site URL (the recovery event is still
// handled there, but the user lands on the home page first).
// Where the sign-up confirmation email lands. Must be in the Supabase
// Redirect URLs allow-list for every origin the app runs on.
export const SIGNUP_REDIRECT_PATH = '/';
export const PASSWORD_RESET_PATH = '/reset-password';

// Path the email-change confirmation link returns to (must be on the Supabase
// Redirect URLs allow-list, like PASSWORD_RESET_PATH).
export const ACCOUNT_SETTINGS_PATH = '/settings';

function errorText(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

function isAccountExistsError(err: unknown): boolean {
  const code = err && typeof err === 'object' && 'code' in err
    ? String((err as { code?: unknown }).code)
    : '';
  return code === 'user_already_exists' || /already registered|already exists/i.test(errorText(err));
}

function isUserNotFoundError(err: unknown): boolean {
  return /user not found|no user found/i.test(errorText(err));
}

export const authService = {
  // Auth calls are never retried: failures here are credential/user errors,
  // not blips, and retrying them delays feedback and burns rate limits.
  async signUp(email: string, password: string) {
    try {
      // Without emailRedirectTo Supabase links to the project's Site URL, which
      // is often still localhost. Return to whichever origin the user
      // registered from (local, preview or production).
      const { data, error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}${SIGNUP_REDIRECT_PATH}` },
      });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (err) {
      // Do not disclose whether an address is already registered. The form
      // shows the same "check your email" state either way.
      if (isAccountExistsError(err)) return { user: null, session: null };
      throw toAuthError(err);
    }
  },

  async signIn(email: string, password: string) {
    try {
      const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async signOut() {
    try {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async resetPassword(email: string) {
    try {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${PASSWORD_RESET_PATH}`,
      });
      if (error) throw error;
    } catch (err) {
      // Same response for unknown addresses: the UI must not become an email
      // enumeration oracle.
      if (isUserNotFoundError(err)) return;
      throw toAuthError(err);
    }
  },

  /**
   * Sets a new password for the signed-in (recovery) session. Other devices are
   * signed out afterwards: whoever had the old password, or a stolen session,
   * must not stay logged in after the owner resets it. That step is best
   * effort - the password change itself already succeeded, so a failure there
   * must not be reported as a failed reset.
   */
  async updatePassword(newPassword: string) {
    const client = requireSupabase();
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
    } catch (err) {
      throw toAuthError(err);
    }
    try {
      await client.auth.signOut({ scope: 'others' });
    } catch {
      // keep the successful reset
    }
  },

  /**
   * Changes the password of the signed-in user. The current password is
   * verified first with a fresh sign-in, so a stolen but still-open session
   * cannot change the password on its own. The second half is updatePassword,
   * which also signs out the other sessions (best effort).
   */
  async changePassword(currentPassword: string, newPassword: string) {
    const session = await authService.getSession();
    const email = session?.user?.email;
    if (!email) {
      throw toAuthError({
        message: 'Auth session missing!',
        name: 'AuthSessionMissingError',
        code: 'session_not_found',
      });
    }
    try {
      const { error } = await requireSupabase().auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (error) throw error;
    } catch (err) {
      // A wrong current password arrives as code invalid_credentials.
      throw toAuthError(err);
    }
    await authService.updatePassword(newPassword);
  },

  /**
   * Requests an email change. Supabase sends a confirmation link (to both the
   * old and the new address when "Secure email change" is on) and the address
   * only changes once it is confirmed, so the session still holds the old
   * email when this resolves.
   */
  async changeEmail(newEmail: string) {
    try {
      const { error } = await requireSupabase().auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: `${window.location.origin}${ACCOUNT_SETTINGS_PATH}` },
      );
      if (error) throw error;
    } catch (err) {
      throw toAuthError(err);
    }
  },

  /**
   * Permanently deletes the signed-in account and, through the database's
   * ON DELETE CASCADE, every cloud row it owns. Accounts with a password
   * re-authenticate first (which also refreshes last_sign_in_at, the freshness
   * the server demands); accounts without one (Google) confirm in the UI only.
   * Local data is cleared by the caller (AuthContext.deleteAccount) once this
   * resolves, so a failure here leaves the session and the data untouched.
   */
  async deleteAccount(currentPassword?: string) {
    const session = await authService.getSession();
    const user = session?.user;
    if (!session || !user) {
      throw toAuthError({
        message: 'Auth session missing!',
        name: 'AuthSessionMissingError',
        code: 'session_not_found',
      });
    }

    let accessToken = session.access_token;
    if (hasPasswordIdentity(user)) {
      if (!user.email || !currentPassword) {
        throw toAuthError({
          message: 'Invalid login credentials',
          name: 'AuthApiError',
          code: 'invalid_credentials',
        });
      }
      try {
        const { data, error } = await requireSupabase().auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });
        if (error) throw error;
        // Use the token this sign-in just issued: its user.last_sign_in_at is
        // what the server checks.
        accessToken = data.session?.access_token ?? accessToken;
      } catch (err) {
        throw toAuthError(err);
      }
    }

    let response: Response;
    try {
      response = await fetch(DELETE_ACCOUNT_PATH, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      throw toAuthError(err);
    }
    if (response.ok) return;

    let serverCode = '';
    if (response.status === 403) {
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string') serverCode = body.error;
      } catch {
        // unreadable body: treated as a generic failure below
      }
    }
    // The server's text is never surfaced; only the code picks the copy.
    throw {
      message: `Account deletion failed (${response.status})`,
      code: serverCode === 'reauth_required' ? 'reauth_required' : 'delete_account_failed',
    } satisfies AuthError;
  },

  async getSession() {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    // Local-only mode: nothing to subscribe to, return a no-op listener so
    // callers never crash on an unconfigured Supabase.
    if (!supabase) {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  },
};
