/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
  },
})