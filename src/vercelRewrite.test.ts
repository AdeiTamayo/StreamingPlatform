import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The SPA fallback must not swallow API routes or file requests: under
// `vercel dev` a catch-all rewrite sent /src/main.tsx to index.html and Vite
// failed with "Failed to parse source for import analysis".
const config = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
  rewrites: { source: string; destination: string }[];
};
const spa = config.rewrites.find((r) => r.destination === '/index.html');
const matches = (path: string) => new RegExp(`^${spa?.source}$`).test(path);

describe('vercel.json SPA rewrite', () => {
  it('exists', () => expect(spa).toBeDefined());

  it.each(['/', '/movie/123', '/settings', '/reset-password', '/tv/5/season/2'])(
    'rewrites app route %s',
    (path) => expect(matches(path)).toBe(true),
  );

  it.each([
    '/api/probe',
    '/api/delete-account',
    '/src/main.tsx',
    '/@vite/client',
    '/node_modules/.vite/deps/react.js',
    '/assets/index-abc.js',
    '/favicon.svg',
  ])('leaves %s alone', (path) => expect(matches(path)).toBe(false));
});
