import { requireSupabase, supabase } from '../../lib/supabase';
import { withRetry } from '../../utils/retry';

export interface AuthError {
  message: string;
  code?: string;
}

function toAuthError(err: unknown): AuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    return { message: String((err as { message: unknown }).message), code: (err as { code?: string }).code };
  }
  return { message: String(err) };
}

export const authService = {
  async signUp(email: string, password: string) {
    try {
      const { data, error } = await withRetry(() =>
        requireSupabase().auth.signUp({ email, password }),
      );
      if (error) throw error;
      return { user: data.user, session: data.session };
    } catch (err) {
      throw toAuthError(err);
    }
  },

  async signIn(email: string, password: string) {
    try {
      const { data, error } = await withRetry(() =>
        requireSupabase().auth.signInWithPassword({ email, password }),
      );
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
      const { error } = await withRetry(() =>
        requireSupabase().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/settings`,
        }),
      );
      if (error) throw error;
    } catch (err) {
      throw toAuthError(err);
    }
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
