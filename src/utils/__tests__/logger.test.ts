import { afterEach, describe, expect, it, vi } from 'vitest';
import { logDebug, logError, redact } from '../logger';

const DEBUG_KEY = 'player_debug';
const ERROR_KEY = 'app_errors';

afterEach(() => {
  localStorage.removeItem(DEBUG_KEY);
  localStorage.removeItem(ERROR_KEY);
  vi.restoreAllMocks();
});

describe('logger redaction', () => {
  it('strips credentials and email addresses', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature user@example.com';
    const result = redact(text);
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(result).not.toContain('user@example.com');
    expect(result).toContain('[redacted]');
  });

  it('redacts debug messages before storing them', () => {
    logDebug('token=super-secret');
    const stored = localStorage.getItem(DEBUG_KEY) ?? '';
    expect(stored).not.toContain('super-secret');
    expect(stored).toContain('[redacted]');
  });

  it('redacts error messages and stacks before storing them', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('failed for user@example.com');
    error.stack = 'Error: failed for user@example.com\n    at App';
    logError('auth', error);

    const stored = localStorage.getItem(ERROR_KEY) ?? '';
    expect(stored).not.toContain('user@example.com');
    expect(stored).toContain('[redacted-email]');
  });

  it('caps stored entries', () => {
    for (let i = 0; i < 60; i++) logDebug(`message ${i}`);
    const entries = JSON.parse(localStorage.getItem(DEBUG_KEY) ?? '[]');
    expect(entries).toHaveLength(50);
    expect(entries[0].msg).toBe('message 10');
  });
});
