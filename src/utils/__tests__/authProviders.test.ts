import { describe, it, expect } from 'vitest';
import { hasPasswordIdentity } from '../authProviders';

describe('hasPasswordIdentity', () => {
  it('is true when the email provider is present', () => {
    expect(hasPasswordIdentity({ app_metadata: { providers: ['email'] } })).toBe(true);
    expect(hasPasswordIdentity({ app_metadata: { providers: ['google', 'email'] } })).toBe(true);
  });

  it('is false for accounts that only use OAuth', () => {
    expect(hasPasswordIdentity({ app_metadata: { providers: ['google'] } })).toBe(false);
    expect(hasPasswordIdentity({ app_metadata: { provider: 'google' } })).toBe(false);
  });

  it('falls back to the single provider field when providers is missing', () => {
    expect(hasPasswordIdentity({ app_metadata: { provider: 'email' } })).toBe(true);
  });

  it('fails safe (password required) when no provider information exists', () => {
    expect(hasPasswordIdentity(null)).toBe(true);
    expect(hasPasswordIdentity(undefined)).toBe(true);
    expect(hasPasswordIdentity({})).toBe(true);
    expect(hasPasswordIdentity({ app_metadata: {} })).toBe(true);
  });
});
