/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Catches a production bundle that would ship broken: VITE_TMDB_API_KEY is
// required at runtime (src/config.ts throws), so building without it used to
// succeed and only blow up in the browser. The OMDb key is server-only
// (OMDB_API_KEY, read by api/omdb.ts) and is not a build input; without it the
// IMDb badges fall back to Cinemeta.
// apply: 'build' keeps this out of `vite dev` and the test runner.
function validateApiKeys(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    name: 'validate-api-keys',
    apply: 'build',
    buildStart() {
      if (!env.VITE_TMDB_API_KEY) {
        throw new Error(
          'VITE_TMDB_API_KEY is not set. Add it to .env (see .env.example) or the CI environment before building.',
        )
      }
    },
  }
}

// Mirrors the Vercel functions at api/probe.ts and api/omdb.ts during
// `vite dev`, so provider availability and IMDb ratings can be tested locally
// instead of silently falling back in development. OMDB_API_KEY is read from
// .env here, server side, and never reaches the browser.
function providerProbeDevServer(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    name: 'provider-probe-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname === '/api/omdb') {
          void (async () => {
            try {
              const module = await server.ssrLoadModule('/src/api/omdbCore.ts');
              const handle = module.handleOmdbQuery as (
                query: Record<string, string>,
                deps: { apiKey: string | undefined },
              ) => Promise<{ status: number; headers: Record<string, string>; body: unknown }>;
              const result = await handle(Object.fromEntries(url.searchParams.entries()), {
                apiKey: env.OMDB_API_KEY,
              });
              res.statusCode = result.status;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
              res.end(JSON.stringify(result.body));
            } catch {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.end(JSON.stringify({ error: 'upstream_failed' }));
            }
          })();
          return;
        }
        if (url.pathname !== '/api/probe') {
          next();
          return;
        }
        void (async () => {
          try {
            const module = await server.ssrLoadModule('/src/api/providerProbeCore.ts');
            const handle = module.handleProbeQuery as (query: Record<string, string>) => Promise<unknown>;
            const result = await handle(Object.fromEntries(url.searchParams.entries()));
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(result));
          } catch {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ available: null, best: null }));
          }
        })();
      });
    },
  };
}

export default defineConfig((config) => ({
  plugins: [react(), validateApiKeys(config.mode), providerProbeDevServer(config.mode)],
  css: {
    modules: {
      // Page components use styles.someClassName against kebab-case CSS.
      localsConvention: 'camelCaseOnly',
    },
  },
  build: {
    // The entry chunk was ~497 kB, of which ~173 kB was Supabase. Splitting
    // vendor code out keeps any single chunk well under the warning threshold
    // and lets the browser cache framework code across deploys.
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        // Rolldown takes manualChunks as a function (an object map is a
        // Rollup-only form). Group by module id so the vendor split is
        // computed from the real dependency graph.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/@supabase|realtime-js|ws@|phoenix/.test(id)) return 'supabase';
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react';
          }
          return 'vendor';
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    // setup.ts installs a rejecting default fetch, so tests are offline by
    // default. unstubGlobals restores any per-test fetch stub back to that
    // guard after each test instead of leaking it (or the real fetch).
    unstubGlobals: true,
    // Fixed dummy keys: tests must pass on forks and clean clones without any
    // secrets, and must never use (or depend on) a developer's real .env keys.
    // They only need to be non-empty so the app treats the providers as
    // configured; every network call is stubbed (see setup.ts), and tests that
    // need the "no key" path override with vi.stubEnv.
    env: {
      VITE_TMDB_API_KEY: 'test-tmdb-key',
    },
  },
}))