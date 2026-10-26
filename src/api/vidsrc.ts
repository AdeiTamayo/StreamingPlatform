// Public embed API. The provider table lives in ./sources so the server-side
// availability probe can reuse exactly the same URLs without importing Vite
// environment config into a Node function.
export {
  getMovieEmbedUrl,
  getTVEmbedUrl,
  getPlayerOrigins,
  getSourceLabel,
  SOURCE_KEYS,
} from './sources';
