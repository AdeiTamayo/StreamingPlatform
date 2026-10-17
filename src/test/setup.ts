import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { afterEach } from 'vitest';

// Hermetic by default: a test that reaches for the network without its own
// stub fails loudly (with a pointer to this guard) instead of silently
// depending on real services. Tests stub with vi.stubGlobal('fetch', ...);
// vitest's `unstubGlobals` restores that stub to this guard after each test.
globalThis.fetch = (() =>
  Promise.reject(
    new Error(
      'Test attempted a real network request. Stub fetch in the test that needs it (vi.stubGlobal).',
    ),
  )) as typeof fetch;

afterEach(() => {
  localStorage.clear();
});
