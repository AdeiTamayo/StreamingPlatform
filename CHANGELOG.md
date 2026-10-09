# Changelog

All notable changes to StreamFlow are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Decision badges on detail pages** — series status (`Ended` / `Ongoing`), new
  episodes (`N new`, unwatched episodes of the current season that aired in the
  last 7 days), season progress (`X/Y watched`), and `✓ Watched` on movies. Each
  badge carries a tooltip explaining what it means.
- **Continue Watching card actions** — a restart control that clears the saved
  position and reopens the same episode or movie from 0:00, alongside the
  existing remove control.
- **Watch Later bulk selection** — a selection mode with a checkbox on every
  title and individual episode, `Select page`, `Clear`, and a
  `Remove selected (N)` action that requires an inline `Confirm remove (N)`.
  `Escape` exits selection mode and discards the selection.
- **Search no-results recovery** — browse links (Trending, Movies, TV Shows)
  plus a labelled vertical list of recent searches, each re-runnable in one
  click and removable.
- **Actionable empty states** — Watch Later, Last Seen, and Search now explain
  what the screen is for and link somewhere useful.
- **Watch Later sorting and filtering** — sort by date added, title, or year in
  either direction, filter to movies or TV, with a `Clear filters` reset.
- **Calendar timezone setting** — releases are bucketed on the day they land on
  in the viewer's timezone rather than UTC.
- `safeImageUrl()` in `api/tmdb.ts` — validates poster paths read back from
  localStorage before they reach a `src` attribute or CSS `url()`.
- `disposeOfflineQueueSync()` — stops the background sync timer and detaches its
  `online` listener.
- `react/exhaustive-deps` lint rule, previously available but unenforced.

### Changed

- **Bundle splitting** — `vite.config.ts` now groups React, Supabase, and other
  vendor code into separate chunks. The 497 kB entry chunk is gone; no chunk
  exceeds the 500 kB warning threshold.
- **TypeScript target raised to ES2022**, which makes `Object.hasOwn`
  available.
- **Rating badge unified** — `MediaCard` and Watch Later previously carried two
  near-identical implementations of the IMDb-or-TMDB badge. Both now use the new
  shared `components/RatingBadge.tsx`.
- **`allWatched()` memoized** in `TVDetail` — it was re-reading and re-parsing
  the entire watched index from localStorage on every render, including on every
  player progress tick.
- `selectedItems` and `upcomingCalendarCount` memoized in `Watch Later`.
- `src/vite-env.d.ts` now declares all four `VITE_*` variables. Previously three
  were undeclared and resolved as `any`, so a typo type-checked silently.
- Row Level Security: the three `UPDATE` policies now include
  `with check (auth.uid() = user_id)`, closing a latent path where a row's
  `user_id` could be repointed to another account.
- Dependencies updated — `react-router-dom` 7.18.1 → 7.18.4 plus transitive
  bumps. `npm audit` now reports **0 vulnerabilities** (was 8: 5 high, 3
  moderate).

### Fixed

- **Unhandled `TypeError` on an invalid video source.** `SOURCES[source]` indexed
  a plain object with a value read from localStorage, so `constructor`,
  `toString`, or `__proto__` resolved an inherited function and threw during the
  render of both detail pages. Source keys are now validated with
  `Object.hasOwn`.
- **Untrusted poster URLs.** Poster values persisted by a previous version, or
  supplied through Settings → Import, were interpolated into `<img src>` and CSS
  `url()` without validation. `safeImageUrl` now restricts them to TMDB paths
  and TMDB CDN URLs.
- **Offline queue timer leak.** The 60-second retry interval and the `online`
  listener had no teardown path; both are now removable.

### Security notes

- No server or secret keys exist in the repository. Every credential in use is a
  `VITE_*` variable, which Vite inlines into the client bundle by design; the
  Supabase key is `anon`-role and bounded by Row Level Security. The TMDB v4
  token has no quota isolation, so it can be extracted from the bundle and used
  to burn the account's rate limit — proxying TMDB through a serverless function
  would close that gap.

## [Prior releases]

Earlier work — the release calendar, TVMaze exact air times, the timezone-aware
calendar, player control rework, sorting and dedupe, Supabase schema
normalisation, and offline-sync hardening — is described in the project history.