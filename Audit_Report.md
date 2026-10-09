# StreamFlow — Audit Report

**Agent 1: Project Auditor & Security Specialist**
**Date:** Phase 1
**Scope:** read-only review of the StreamFlow React 19 + TypeScript + Vite app.

## Verification baseline

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx oxlint` | 0 warnings, 0 errors (88 files, 91 rules) |
| `npm test` | 239 tests / 18 files, all pass (~7.9 s) |
| `npm audit` | 8 vulnerabilities (5 high, 3 moderate, 0 critical) |

## Summary

| Severity | Count | Areas |
|---|---|---|
| Critical | 0 | — |
| Major | 9 | vulnerable `react-router-dom`, no code splitting (497 kB entry), offline-queue interval leak, `SOURCES[source]` prototype-key TypeError, unvalidated `imageUrl` paths, unused `vite-tsconfig-paths`, Supabase Realtime in main bundle |
| Minor | 24 | dead exports, 17 unused CSS classes, 17 empty catches, missing memoization, god components, unenforced `exhaustive-deps` |

The codebase is in good shape: Row Level Security is correctly implemented, there is no
`dangerouslySetInnerHTML`/`eval` anywhere, no server secrets exist in the repo, TypeScript strict
mode is on, and CI runs typecheck + lint + test + build. The findings below are real but
mostly incremental.

---

## 1. Security

### S1 — Live credentials on disk in `.env` (Major; accepted risk)
`.env` is correctly gitignored (`.gitignore:10`) and untracked — verified via `git ls-files` and
`git log --all -- .env`. The file on disk holds a TMDB v4 read token, a Supabase anon key, and an
OMDb key.

**Assessment:** every one is a `VITE_*` var, inlined into the client bundle by design. The Supabase
key decodes to `"role":"anon"` and RLS bounds it. This is inherent to a public SPA, not a leak. The
only real caveat: the TMDB v4 token has no quota isolation, so anyone can extract it and burn the
account's rate limit. No `service_role`, `secret_key`, or private key exists anywhere.

### S2 — `react-router-dom` advisory (Major)
`npm audit` reports GHSA-qwww-vcr4-c8h2 (CWE-352, RSC-mode CSRF bypass), range `>=7.12.0 <7.18.2`.

**Impact here is low:** the app uses declarative `<BrowserRouter>` + `<Routes>`, never RSC or data
actions. `package.json` pins `^7.18.1` so a fresh install resolves the patch; the lockfile holds the
vulnerable one. `npm update react-router-dom` fixes it.

### S3 — RLS correct and complete (verified, no finding)
All three tables (`watched`, `watch_later`, `search_history`) enable RLS and carry four policies
each. Critically, all three get a `with check` on INSERT — the thing usually missed:

```sql
-- 001_initial_schema.sql:64
create policy "Users can insert their own watched items"
  on public.watched for insert
  with check (auth.uid() = user_id);
```

UPDATE policies use `using` only, with no `with check`, so a user could in principle repoint
`user_id` on their own row. That is a latent privilege-escalation shape (transferring a row to
another account), not data disclosure, and the client never issues such an update. Worth hardening.

No SQL injection surface: all access goes through the typed query builder; the only string
interpolation is a correct LIKE-wildcard escape (`searchHistoryRepository.remove:25`,
`offlineQueue.ts:99`).

### S4 — `imageUrl()` interpolates untrusted localStorage (Major, verify)
`api/tmdb.ts:195` builds `${TMDB_IMAGE_BASE}/${size}${path}`. `path` arrives from localStorage in
places including `LastSeen.tsx:440` and, as a raw `src`, `WatchLater.tsx:1511`. Those values are
user-writable via Settings → Import.

Not exploitable as XSS — `<img src>` and CSS `url()` cannot execute script — but a crafted import
can point posters at an external host (self-XSS-equivalent scope). Validate poster paths against
`^/[A-Za-z0-9._-]+$` on read.

### S5 — No XSS sinks (verified, no finding)
Zero matches for `dangerouslySetInnerHTML|innerHTML|eval(|new Function|document.write|outerHTML`.
All TMDB titles and overviews render as JSX children. The `Player` postMessage handler is
defensive: allowlisted event names, `Number.isFinite` guards, a 24 h duration cap, plus an
`e.source === iframe.contentWindow` check.

### S6 — `SOURCES[source]` throws on prototype keys (Major)
`api/vidsrc.ts:25` indexes a plain object with a localStorage value. Optional chaining only guards
`null`/`undefined`, so `"constructor"`, `"toString"`, or `"__proto__"` resolves to an inherited
function and `.movie is not a function` throws — inside the render of both detail pages, reachable
through Settings → Import. Confirmed by execution. Fix with `Object.hasOwn(SOURCES, source)`.

### S7 — Offline queue: bounded, but the sync timer leaks (Minor)
`MAX_QUEUE_SIZE = 200` FIFO, `MAX_OP_ATTEMPTS = 5` with logging before drop, foreign-user ops
skipped without burning attempts, concurrent triggers coalesced. No unbounded growth, no infinite
retry. Covered by unit tests.

**One leak:** `initOfflineQueueSync` (line 215) registers an `online` listener and a 60 s
`setInterval` and never removes either. Bounded to one per page load, but unreachable for cleanup.

### S8 — `importData` prototype pollution: not exploitable (verified by execution)
Traced every `JSON.parse` → merge path and ran the `__proto__` case in Node: `Object.entries` never
yields `__proto__` as an own key for these merges, `isExportKey` (`storage.ts:744`) whitelists 8
prefixes before any write, and the `{...item}` spread copies `__proto__` as an own data property
rather than walking the prototype chain.

---

## 2. Error handling

### E1 — 17 fully-empty `catch {}` blocks (Minor)
`storage.ts` 6, `tmdbCache.ts` 5, `TVDetail.tsx` 3, `logger.ts` 2, `dataMigration.ts` 1. Most are
defensible corrupt-JSON tolerance. The three in `TVDetail.tsx` (336, 365, 424) hide network
failures during the notification scan. Plus 10 `.catch(() => {})` swallows. There is no
`unhandledrejection` listener anywhere.

### E2 — Floating promises with no `.catch` (Minor)
Eleven repository calls in `storage.ts` are invoked without `await` or `.catch`. Safe today only
because every repository method has an internal `try/catch` ending in `enqueueWrite`, so they never
reject. That safety is implicit and undocumented at the call sites.

### E3 — Error boundary coverage adequate (no finding)
One `ErrorBoundary` with `resetKey` wired to the route, so a crash on one page clears on navigation.
`<Suspense>` covers lazy-route rejections.

---

## 3. Performance

### P1 — 497 kB main chunk, no code splitting configured (Major)
`vite.config.ts` sets no `manualChunks`, no vendor split, no `chunkSizeWarningLimit`. Routes are
`React.lazy`, but the entry still carries everything eagerly reachable.

```
dist/assets/index-*.js   497.3 kB   <- the warning
  0 – 336,175      react + react-dom + react-router + app
  336,175 – 428,976  @supabase/auth-js        (~93 kB)
  428,976 – 509,218  @supabase RealtimeClient (~80 kB)  <- UNUSED
```

Zero call sites for `.channel(`, `.realtime`, `postgresChanges`, or `broadcast` — the ~80 kB
Realtime/WebSocket client ships for nothing. Supabase is reachable from the entry through
`App → Navbar → useAuth → AuthContext → authService → lib/supabase`.

### P2 — `allWatched()` re-parses the whole index on every render (Major)
`TVDetail.tsx:100` calls `getWatchedCount` per season, each re-reading and `JSON.parse`ing the full
watched index. It is called **during render** at lines 927 and 936, and this component re-renders
on every player progress tick.

### P3 — `TVDetail.tsx` is a god component (Major)
1042 lines, 12 `useEffect`s, ~25 state hooks.
- The show-detail effect (113) and `retry()` (660) duplicate the same fetch.
- The effect at 411 depends on `[playerOpen, show, season, episodes]` and issues **two sequential
  requests per episode**; for a 20-episode season that is 40 requests, with one render per episode.
- 8 `eslint-disable-line react-hooks/exhaustive-deps` in this file alone. `oxlint` has the rule
  available but `.oxlintrc.json` does not enable it, so those suppressions are currently unenforced.
- The new-episode scan effect (277) depends on `[show, inWL]` yet calls `setInWL(true)` at 309.
- `EpisodeDot` is memoized but `onClick={setEpisode}` passes a fresh arrow, defeating the memo.

### P4 — `WatchLater.tsx` is a god component (Major)
1799 lines, 25 hooks. `loadCalendarItems` alone spans **231 lines** (417–647) doing batched
concurrency, progressive flushes, dedupe bookkeeping, airtime enrichment, and per-show external-ID
lookups. Its `useCallback` deps omit `timeZone` and `epItems`, which it closes over.
`upcomingCalendarCount` (996) and `selectedItems` (920) are unmemoized while their 8 neighbours use
`useMemo`. `WlRatingBadge` fires a detail request per card.

### P5 — `Navbar.tsx` `memo` defeated by `useLocation` (Minor)
`useLocation()` at line 54 re-renders on every route change regardless of the `memo`. The
suggestion filter at 96–102 is a bare IIFE. The two focus `setTimeout`s are never cleared.

### P6 — Network dedup and caching are well done (no finding)
In-flight `inflight` Map in `tmdb.ts`, IndexedDB cache with TTL and background pruning,
`getSeasonOnce` sharing across episode entries, `sharedForceScan` sharing one scan across both
mounted bells, and `Player` keeping `currentTime` in a ref so progress ticks don't re-render.
`useSearchFilter` layers debounce + abort + a monotonic request-id guard.

### P7 — `storage.ts` synchronous localStorage in hot paths (Minor)
`getIndex` re-parses the full index on every call and is used by `getWatchedCount`,
`getWatchedEpisodeSet`, `isWatched`, `getStats`, and others. `getLastSeen()` walks every watched and
progress key with a parse each. Lines 670 and 682 are O(n·m): `Array.includes` inside `filter`
where a `Set` belongs.

### P8 — Memory leaks: clean apart from S7 (no finding)
All `addEventListener` have matching removals, all intervals cleared, all `AbortController`s cleaned
up, both `createObjectURL` calls revoked.

---

## 4. Code quality

### Q1 — Dead exports (Minor, grep-verified)
`searchPerson` (`api/tmdb.ts:156`) is referenced nowhere. `LOCAL_DATA_KEYS` (`storage.ts:28`) is only
used inside its own module. `isSeriesWatched` and `getTMDBCacheCount` are test-only.

### Q2 — 17 unreferenced CSS classes (Minor)
`shared.css`: `.genre-select`, `.filter-label`, `.home-link`, `.imdb-badge`, `.resume-badge`,
`.media-card-watched`. `WatchLater.module.css`: `.calLoading`, `.pcount-3`, `.count-1`, `.count-2`.
`LastSeen.module.css`: `.last-seen-item`, `.last-seen-pagination`, `.last-seen-series-index`.
`TVDetail.module.css`: `.ep-watched-badge`.

**Warning:** do not bulk-delete the `count-*`/`heat-*`/`pcount-*` families — `heat-1/2/3` and
`pcount-1/2` are live via template-literal indexing and are false positives.

### Q3 — No console.log, no TODO/FIXME (verified, no finding)
Zero `console.log`/`debug`/`warn`, zero `TODO|FIXME|HACK|XXX`, zero `@ts-ignore`. The only `any` is
the deliberate IndexedDB boundary in `tmdbCache.ts`.

### Q4 — Duplicated logic (Minor)
- `isTypingTarget` keydown guard — 3 copies: `MovieDetail.tsx:98`, `TVDetail.tsx:437`, `TVDetail.tsx:463`
- `togglePlayerFullscreen` — 2 copies: `MovieDetail.tsx:169`, `TVDetail.tsx:498`
- auto-watch-threshold logic — `MovieDetail.tsx:139-165` vs `TVDetail.tsx:516-548`
- `toggleWatched` — `MovieDetail.tsx:187`, `TVDetail.tsx:552`
- rating badge — `MediaCard.tsx:39` vs `WatchLater.tsx:77`

### Q5 — God components (Major)
`WatchLater.tsx` 1799 lines / 25 hooks; `TVDetail.tsx` 1042 lines / 12 effects; `storage.ts` 1071
lines / ~60 exports spanning watched state, watch-later, progress, notifications, search history,
timezone, video source, import/export, and storage accounting — it should be at least 5 modules.

Note: file sizes are drifting upward — `storage.ts` is now 1071 lines (not 961) and `Navbar.tsx` 659.

### Q6 — Inconsistent patterns (Minor)
Mixed single vs double quotes and semicolon use across files with no formatter config;
`WatchLater.tsx` casts `(item as WatchLaterItem)` 18 times inside one `.map` on an array that was
already typed; single-file component directories mixed with 40 flat components; global CSS classes
used inside JSX alongside `styles.x`; three different error idioms.

### Q7 — Mojibake in `LoginForm.tsx:67` (Minor)
Password placeholder is 8× `U+2022` bullet instead of a hint. Files are valid UTF-8, so this is a
pre-existing bad character, not corruption.

---

## 5. Config and tooling

### C1 — TypeScript strict on, with gaps (Minor)
`strict: true`. Gaps: `noUnusedLocals` and `noUnusedParameters` are both `false` — flipping them on
would likely surface real dead code. Missing `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.

**`src/vite-env.d.ts` under-declares env vars** — only `VITE_TMDB_API_KEY`, omitting
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_OMDB_API_KEY`. They resolve through
`vite/client`'s `[key: string]: any`, so a typo type-checks silently and becomes `undefined` at
runtime.

**`scripts/` and `vite.config.ts` are outside the typecheck** — verified via
`tsc --noEmit --listFiles` (398 files). CI runs `npx tsc --noEmit`, not `tsc -b`, so
`scripts/transfer-localstorage-to-supabase.ts` is never typechecked and `tsconfig.node.json` is
dead config.

### C2 — CI is comprehensive (no finding, two gaps)
`.github/workflows/ci.yml` runs `npm ci` → `npx tsc --noEmit` → `npm run lint` → `npm test` →
`npm run build`, and passes `VITE_TMDB_API_KEY` from secrets (required — `config.ts` throws at
module load without it). Gaps: no `npm audit` step, so S2 would not be caught; and CI uses
`tsc --noEmit` rather than `tsc -b`, so `tsconfig.node.json` is never exercised.

### C3 — Lint configured but thin (Minor)
`.oxlintrc.json` enables 3 plugins but only 2 rules. `react/exhaustive-deps` is available but not
enabled, so 20 suppression comments currently suppress nothing. No `--max-warnings 0`.

### C4 — Build warning traced to P1.

### C5 — Unused dev dependency `vite-tsconfig-paths` (Major)
Declared in `package.json` but never registered in `vite.config.ts`. Correspondingly the `@/*`
alias in `tsconfig.json` has zero `from '@/…'` imports in `src/` — every import is relative. Both the
plugin and the alias are dead weight.

*Local install note:* `npm ls` reports ~200 extraneous packages and broken
`@streamflow/*` symlinks from a prior monorepo layout. Local hygiene only — CI uses `npm ci`.

### C6 — Lockfile present and tracked (no finding)

### C7 — Unused `@testing-library/user-event` (Minor)
Declared in `package.json:25`, zero imports — tests use `fireEvent`.

---

## Prioritized remediation

### Do now
1. `npm update react-router-dom` — clears the only high-severity reachable advisory (S2).
2. Guard `SOURCES[source]` with `Object.hasOwn` — fixes a real unhandled TypeError (S6).
3. Add `manualChunks` for `supabase` + `react`; investigate dropping the unused Realtime client (P1).
4. Add all four `VITE_*` vars to `src/vite-env.d.ts` (C1).
5. Enable `react/exhaustive-deps` and work through what it surfaces (C3, P3).

### Do soon
6. Memoize `allWatched()` / `getWatchedCount` out of the render path (P2).
7. Switch CI to `tsc -b` so `scripts/` is covered (C1/C2).
8. Validate poster paths before they reach `imageUrl`/`src` (S4).
9. Add `with check (auth.uid() = user_id)` to the three UPDATE policies (S3).
10. Split `WatchLater.tsx` and `storage.ts` (Q5).
11. Remove `vite-tsconfig-paths`, `@testing-library/user-event`, the `@/*` alias, `searchPerson`, and
    the 17 dead CSS classes (C5, C7, Q1, Q2).

### Housekeeping
12. Consolidate the 3× `isTypingTarget` and 2× `togglePlayerFullscreen` (Q4).
13. Add `prettier` to end the quote/semicolon split (Q6).
14. Clear the offline-queue listener and interval (S7).
15. Add `npm audit --audit-level=high` to CI (C2).
16. Fix the mojibake placeholder in `LoginForm.tsx:67` (Q7).