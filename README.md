# StreamFlow

A personal streaming web app built with React. Browse movies and TV shows using TMDB metadata, watch via embedded players, and track your viewing progress — all client-side with no backend.

## Features

- **Browse** movies and TV shows with filters (genre, country, year, sort order)
- **Search** across movies, TV shows, and people
- **Watch** content via embedded video player with resume playback
- **Continue Watching** tracks progress and shows unfinished content on the home page
- **Watch Later** save movies, shows, or individual episodes for later
- **Last Seen** view your watch history grouped by series
- **Auto-detect watched** episodes are marked automatically when you click Next or reach the end
- **Episode navigation** season/episode dropdowns with keyboard search, prev/next buttons
- **Trailers** YouTube trailers on detail pages when available
- **Recommendations** "You might also like" section on movie and show detail pages
- **Dark theme** with responsive layout

## Tech Stack

- [React 19](https://react.dev) + [Vite](https://vite.dev)
- [React Router](https://reactrouter.com) for client-side routing
- [TMDB API](https://developer.themoviedb.org) for metadata, images, and search
- [VidSrc](https://vidsrc.fyi) for video embeds
- localStorage for all persistence (watched marks, progress, watch later lists)

## Getting Started

### Prerequisites

- Node.js 18+
- A free [TMDB API key](https://www.themoviedb.org/settings/api)

### Setup

```bash
git clone https://github.com/AdeiTamayo/StreamingPlatform.git
cd StreamingPlatform
npm install
```

Create a `.env` file in the project root:

```
VITE_TMDB_API_KEY=your_tmdb_api_key_here
```

Then run the dev server:

```bash
npm run dev
```

### Build

```bash
npm run build
```

Output goes to the `dist/` directory.

## Deploying to Vercel

This project is ready for Vercel deployment. The `vercel.json` configures SPA routing (all routes redirect to `index.html`).

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add your `VITE_TMDB_API_KEY` as an environment variable in the Vercel dashboard
4. Deploy

Vercel will auto-deploy on every push to `main`.

## Project Structure

```
src/
  api/
    tmdb.js          # TMDB API calls with caching
    vidsrc.js         # Embed URL builders
    storage.js        # localStorage persistence
  components/
    Navbar.jsx        # Sticky top navigation
    Player.jsx        # Video player with progress tracking
    MediaCard.jsx     # Poster card with rating and action buttons
    SeasonDropdown.jsx
    EpisodeDropdown.jsx
    FilterDropdown.jsx
    FilterBar.jsx
    DatePickerField.jsx
    CollectionSkeleton.jsx
  pages/
    Home.jsx          # Continue Watching + Trending
    MovieDetail.jsx   # Movie detail with player, trailer, recommendations
    TVDetail.jsx      # TV detail with season/episode navigation
    MediaBrowse.jsx   # Unified browse for movies and TV shows
    Search.jsx        # Multi-search with pagination
    WatchLater.jsx    # Saved movies, shows, and episodes
    LastSeen.jsx      # Watch history
    Settings.jsx      # Clear local data
    NotFound.jsx      # 404 page
  hooks/
    useSearchFilter.js # Shared fetch/debounce/pagination hook
  config.js          # Environment variable setup
```

## Notes

- All data is stored locally in your browser — no accounts, no server
- TMDB API responses are cached in memory for 24 hours
- The app uses a privacy-conscious setup: noindex tags, no analytics, no tracking
- Video playback quality and availability depend on the embed source

## License

This project is for personal use. Check the terms of service for TMDB and VidSrc before deploying publicly.
