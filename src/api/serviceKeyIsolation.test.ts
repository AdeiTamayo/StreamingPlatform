import { describe, it, expect } from 'vitest';

// Everything under src/ can end up in the browser bundle. The service-role key
// may only be read in api/ (server-only); core modules receive an injected
// client instead.
const sources = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('service-role key isolation', () => {
  it('scans the source tree', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(50);
  });

  it('never references the service-role key from code under src/', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith('serviceKeyIsolation.test.ts'))
      .filter(([, text]) => /SERVICE_ROLE|service_role_key/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('never exposes a service key through a VITE_ variable', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith('serviceKeyIsolation.test.ts'))
      .filter(([, text]) => /VITE_[A-Z_]*SERVICE/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it('never exposes the OMDb key through a VITE_ variable', () => {
    const offenders = Object.entries(sources)
      .filter(([file]) => !file.endsWith('serviceKeyIsolation.test.ts'))
      .filter(([, text]) => /VITE_OMDB/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
