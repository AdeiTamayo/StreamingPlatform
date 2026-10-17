const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

if (!TMDB_API_KEY) {
  throw new Error(
    'VITE_TMDB_API_KEY is not set. Add it to your .env file (see .env.example) before starting the app.',
  );
}

// The TMDB key is intentionally client-side: TMDB issues browser keys and
// expects them in the bundle. Restrict it by HTTP referrer in the TMDB
// dashboard rather than trying to hide it. vite.config.ts validates it at
// build time so a keyless production bundle fails the build instead of the
// first page load.
const CONFIG = {
  TMDB_API_KEY,
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
  VIDSRC_BASE: 'https://vidsrc.fyi',
};

export default CONFIG;
