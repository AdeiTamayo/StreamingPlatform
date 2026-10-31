import type { TFunction } from 'i18next';

export const MIN_PASSWORD_LENGTH = 12;

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Mirrors the server-side policy documented in README. The server remains the
// authority; this is fast feedback, not a security boundary. The optional
// translator keeps the pure helper usable (and testable) without i18n; the
// forms always pass one so the message follows the selected language.
export function validatePassword(password: string, t?: TFunction): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return t
      ? t('auth.errors.passwordLength', { count: MIN_PASSWORD_LENGTH })
      : `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return t
      ? t('auth.errors.passwordLetters')
      : 'Password must include both uppercase and lowercase letters.';
  }
  if (!/[0-9]/.test(password)) {
    return t ? t('auth.errors.passwordNumber') : 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return t ? t('auth.errors.passwordSymbol') : 'Password must include at least one symbol.';
  }
  return null;
}

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  name?: unknown;
  status?: unknown;
}

/**
 * Maps a Supabase/network auth error to translated copy. Raw server messages
 * are English-only and can expose implementation detail, so anything not
 * recognised falls back to a generic translated message instead.
 */
export function getLocalizedAuthError(err: unknown, t: TFunction): string {
  const e = (err && typeof err === 'object' ? err : {}) as ErrorLike;
  const code = typeof e.code === 'string' ? e.code : '';
  const name = typeof e.name === 'string' ? e.name : '';
  const message = typeof e.message === 'string' ? e.message : '';

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return t('auth.errors.invalidCredentials');
  }
  if (code === 'email_not_confirmed') return t('auth.errors.emailNotConfirmed');
  if (code === 'user_already_exists') return t('auth.errors.emailTaken');
  if (code === 'email_address_invalid') return t('auth.errors.emailInvalid');
  if (code === 'signup_disabled') return t('auth.errors.signupDisabled');
  if (code === 'same_password' || /different from the old password/i.test(message)) {
    return t('auth.errors.samePassword');
  }
  if (code === 'weak_password') return t('auth.errors.weakPassword');
  if (
    code === 'over_request_rate_limit' ||
    code === 'over_email_send_rate_limit' ||
    e.status === 429
  ) {
    return t('auth.errors.rateLimited');
  }
  if (
    code === 'session_not_found' ||
    code === 'session_expired' ||
    code === 'otp_expired' ||
    name === 'AuthSessionMissingError' ||
    /session missing/i.test(message)
  ) {
    return t('auth.errors.sessionExpired');
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return t('auth.errors.network');
  }
  return t('auth.errors.generic');
}
