interface ProviderMetadata {
  app_metadata?: { providers?: unknown; provider?: unknown } | null;
}

/**
 * True when the account can sign in with an email + password. Google-only
 * accounts (providers: ['google']) have no password.
 *
 * Fails safe: when Supabase gave no provider information at all, the account
 * is treated as password-protected, so the stronger confirmation (current
 * password, fresh sign-in) is required rather than skipped.
 */
export function hasPasswordIdentity(user: ProviderMetadata | null | undefined): boolean {
  const meta = user?.app_metadata;
  if (meta && Array.isArray(meta.providers)) return meta.providers.includes('email');
  if (meta && typeof meta.provider === 'string') return meta.provider === 'email';
  return true;
}
