import { describe, it, expect } from 'vitest';
import { parseAuthLink } from '../authLink';

describe('parseAuthLink', () => {
  it('reads the type of a confirmation link', () => {
    expect(parseAuthLink('#access_token=a&refresh_token=b&type=signup')).toEqual({
      type: 'signup',
      errorCode: null,
      hasError: false,
    });
  });

  it('detects an expired link reported in the fragment', () => {
    expect(parseAuthLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toEqual({
      type: null,
      errorCode: 'otp_expired',
      hasError: true,
    });
  });

  it('detects an error reported in the query string', () => {
    expect(parseAuthLink('', '?error=access_denied&error_code=otp_expired').hasError).toBe(true);
  });

  it('treats an ordinary URL as no link', () => {
    expect(parseAuthLink('', '')).toEqual({ type: null, errorCode: null, hasError: false });
    expect(parseAuthLink('#section', '?q=1').hasError).toBe(false);
  });
});
