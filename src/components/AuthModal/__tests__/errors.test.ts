import { describe, it, expect } from 'vitest';
import { MIN_PASSWORD_LENGTH, isValidEmail, validatePassword } from '../errors';

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
