import type { TFunction } from 'i18next';

export const MIN_PASSWORD_LENGTH = 12;

export function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

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
