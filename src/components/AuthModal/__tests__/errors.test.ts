import { describe, it, expect } from 'vitest';
import { MIN_PASSWORD_LENGTH, getLocalizedAuthError, isValidEmail, validatePassword } from '../errors';

describe('validatePassword', () => {
  it('accepts a password that satisfies the policy', () => {
    expect(validatePassword('Str0ng!Password')).toBeNull();
  });

  it('rejects passwords shorter than the minimum', () => {
    expect(validatePassword('Aa1!'.padEnd(MIN_PASSWORD_LENGTH - 1, 'x'))).toContain('at least');
  });

  it('requires upper and lower case letters', () => {
    expect(validatePassword('lowercase1!long')).toContain('uppercase and lowercase');
    expect(validatePassword('UPPERCASE1!LONG')).toContain('uppercase and lowercase');
  });

  it('requires a number', () => {
    expect(validatePassword('NoNumber!LongPassword')).toContain('number');
  });

  it('requires a symbol', () => {
    expect(validatePassword('NoSymbol1LongPassword')).toContain('symbol');
  });
});

describe('isValidEmail', () => {
  it('accepts a normal address', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('user@example')).toBe(false);
    expect(isValidEmail('user example.com')).toBe(false);
  });
});

describe('getLocalizedAuthError', () => {
  const t = ((key: string) => key) as unknown as Parameters<typeof getLocalizedAuthError>[1];

  it.each([
    [{ code: 'same_password', message: 'x' }, 'auth.errors.samePassword'],
    [{ message: 'New password should be different from the old password.' }, 'auth.errors.samePassword'],
    [{ code: 'weak_password', message: 'x' }, 'auth.errors.weakPassword'],
    [{ code: 'over_request_rate_limit', message: 'x' }, 'auth.errors.rateLimited'],
    [{ status: 429, message: 'x' }, 'auth.errors.rateLimited'],
    [{ code: 'otp_expired', message: 'x' }, 'auth.errors.sessionExpired'],
    [{ name: 'AuthSessionMissingError', message: 'Auth session missing!' }, 'auth.errors.sessionExpired'],
    [{ message: 'Failed to fetch' }, 'auth.errors.network'],
    [{ message: 'database exploded: secret detail' }, 'auth.errors.generic'],
    [null, 'auth.errors.generic'],
    ['boom', 'auth.errors.generic'],
  ])('maps %j to %s', (err, key) => {
    expect(getLocalizedAuthError(err, t)).toBe(key);
  });
});
