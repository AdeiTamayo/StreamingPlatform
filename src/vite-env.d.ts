/// <reference types="vite/client" />

// Every VITE_* variable the app reads must be declared here. Without an
// explicit entry these fall through to vite/client's `[key: string]: any`, so
// a typo type-checks silently and becomes `undefined` at runtime.
interface ImportMetaEnv {
  /** TMDB API read access token. Required - config.ts throws without it. */
  readonly VITE_TMDB_API_KEY: string;
  /** OMDb key for IMDb ratings. Optional; TMDB ratings are used without it. */
  readonly VITE_OMDB_API_KEY?: string;
  /** Supabase project URL. Optional; the app runs local-only without it. */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon key, bounded by Row Level Security. Optional. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}