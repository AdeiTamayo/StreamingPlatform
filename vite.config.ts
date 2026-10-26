/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Catches a production bundle that would ship broken: VITE_TMDB_API_KEY is
// required at runtime (src/config.ts throws), so building without it used to
// succeed and only blow up in the browser. VITE_OMDB_API_KEY degrades
// gracefully (IMDb badges fall back to TMDB), so it warns instead of failing.
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
      if (!env.VITE_OMDB_API_KEY) {
        console.warn(
          '[validate-api-keys] VITE_OMDB_API_KEY is not set - every IMDb badge will fall back to TMDB ratings.',
        )
      }
    },
  }
}

// Mirrors the Vercel function at api/probe.ts during `vite dev`, so provider
// availability can be tested locally instead of silently falling back to
// "unknown" in development.
function providerProbeDevServer(): Plugin {
  return {
    name: 'provider-probe-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
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
  plugins: [react(), validateApiKeys(config.mode), providerProbeDevServer()],
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
  },
}))