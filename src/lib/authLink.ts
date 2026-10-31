// What an auth email link (sign-up confirmation, reset, email change) carried
// when it opened the app. supabase-js reads the URL fragment during start-up
// and removes it, so the page has to record it first: this module is imported
// before anything that creates the client (see src/main.tsx).

export interface AuthLinkInfo {
  /** Supabase link type, e.g. "signup" or "recovery". */
  type: string | null;
  /** Error code when the link was rejected, e.g. "otp_expired". */
  errorCode: string | null;
  /** True when the link came back with an error instead of a session. */
  hasError: boolean;
}

function paramsOf(raw: string): URLSearchParams {
  return new URLSearchParams(raw.replace(/^[#?]/, ''));
}

export function parseAuthLink(hash: string, search = ''): AuthLinkInfo {
  const h = paramsOf(hash);
  const q = paramsOf(search);
  const get = (name: string) => h.get(name) ?? q.get(name);
  const errorCode = get('error_code');
  const hasError = h.has('error') || q.has('error') || errorCode != null || h.has('error_description') || q.has('error_description');
  return { type: get('type'), errorCode, hasError };
}

export const initialAuthLink: AuthLinkInfo =
  typeof window === 'undefined'
    ? { type: null, errorCode: null, hasError: false }
    : parseAuthLink(window.location.hash, window.location.search);

/** Removes the auth parameters from the address bar without reloading. */
export function stripAuthParams(): void {
  try {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  } catch {
    // history unavailable: leaving the fragment in place is harmless
  }
}
