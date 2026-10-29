import 'fake-indexeddb/auto';
import '@testing-library/jest-dom';
import { afterEach, beforeEach } from 'vitest';
import i18n from '../i18n';

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

// UI tests assert the English copy, so every test starts in English regardless
// of a language preference left behind by a previous test or a local run.
beforeEach(async () => {
  await i18n.changeLanguage('en');
  document.documentElement.lang = 'en';
});

afterEach(() => {
  localStorage.clear();
});
