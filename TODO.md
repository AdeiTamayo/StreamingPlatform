# StreamFlow --- TODO and Audit Plan

**Audit baseline:** `AdeiTamayo/StreamingPlatform`, commit `de61e10`
(2026-10-29), plus the existing `TODO.md`.

**Severity:** **H** = high priority · **M** = medium priority · **L** =
low priority.

**Scope note:** The source audit included static review, typecheck,
lint, tests and `npm audit`. `TVDetail`, `WatchLater`, `Home`, `Search`
and CSS were not reviewed line by line. Sync findings were inferred from
code; they were not verified against a live Supabase project. Treat
findings as pending until reproduced or otherwise verified.

**Status convention:** Keep items unchecked until fixed and verified.
For audit findings, record one status: `Confirmed`,
`Reproduced in tests`, `Potential`, or `Resolved`.

---

## 1. High-priority fixes and checks

### Data integrity, sync and backups

- [ ] **H --- Clarify "Clear local data".** `clearAllData()`
      (`src/api/storage.ts:1169–1191`) deletes all four Supabase tables
      for the signed-in user, although the UI says "Clear local data".
      Update the copy in English, Spanish and Basque, or split this into
      separate "Clear this device" and "Delete cloud data" actions with
      separate confirmations.
- [ ] **H --- Paginate cloud downloads.** `getAllStrict` in
      `watchedRepository`, `watchLaterRepository` and `progressRepository`
      has no pagination. Supabase may limit results to 1,000 rows per
      request, while the app allows up to 10,000 watched rows. Page with
      `.range()` until a short page is returned.
- [ ] **H --- Prevent destructive reconciliation after incomplete
      downloads.** `downloadSupabaseData`
      (`src/utils/dataMigration.ts:396–404`) treats the download as
      authoritative and removes local keys missing from the response.
      Never delete local records if a download failed or may be truncated.
- [ ] **H --- Make cloud exports complete and fail visibly.**
      `exportSupabaseData` (`src/api/storageBackup.ts:62–108`) uses
      `getAll`, may hit the row limit and returns `[]` on errors. Use
      paginated strict reads and report failures; never present a partial
      or empty export as successful.
- [ ] **H --- Prevent loss of offline writes.** The offline queue
      drops operations beyond 200 and after five failed attempts
      (`src/utils/offlineQueue.ts:49–51, 209–213`). Preserve a
      dirty/pending marker, avoid deleting unsynced local data during
      reconciliation, and clearly warn users when writes cannot be synced.
- [ ] **H --- Complete password recovery.** `resetPassword` redirects
      to `/settings` (`src/services/auth/authService.ts:68–80`), but the
      audit found no completion flow handling `PASSWORD_RECOVERY` or
      calling `updateUser`. Add a set-new-password screen and test the
      full email-to-reset flow.
- [ ] **H --- Test cross-account data isolation.** Using two test
      accounts, verify `SELECT`, `INSERT`, `UPDATE` and `DELETE` isolation
      for every table, view, RPC/function and storage bucket. Attempt to
      access or modify another user's records by changing IDs directly
      through the Supabase API.
- [ ] **H --- Test sync during account changes.** Verify queued
      operations are bound to the correct account during logout, login,
      account switching, token expiry and reconnect. Test concurrent
      edits, partial failures and retries; resolve conflicts
      deterministically and never silently discard user data.
- [ ] **H --- Test hostile and invalid backup imports.** Reject
      malformed, oversized, unsupported-version and structurally invalid
      backups safely. Test duplicate IDs, invalid dates, unexpected fields
      and schema migrations. Failed imports must leave existing data
      unchanged.
- [ ] **H --- Verify migration and recovery ordering.**
      `clearMigratedData()` currently runs before the cloud download,
      which has a four-second deadline
      (`src/utils/dataMigration.ts:267, 540`). Download and validate
      first; only clear migrated local data after successful recovery.
- [ ] **H --- Verify viewing progress reliability (not a new
      feature).** Test existing watched status, episode/season actions,
      Continue Watching and resume behaviour after refresh, offline use,
      account switching and cloud sync. Add regression tests for any
      failures found.

### CI, tests and dependencies

- [ ] **H --- Restore a green dependency audit.** The audit reported
      `npm audit --audit-level=high` failing for `vite` 8.1.4 and `undici`
      via `jsdom`, plus moderate Vitest-related advisories. Update
      dependencies with a reviewed fix, then rerun the audit, tests,
      typecheck, lint and production build. Re-check current advisories
      rather than relying on this historical snapshot.
- [ ] **H --- Remove secrets from test requirements.** Two tests in
      `src/test/detailPages.test.tsx` depend on `VITE_OMDB_API_KEY`. Stub
      the environment or mock the API so tests pass on forks and clean
      clones without real secrets.
- [ ] **H --- Verify authentication lifecycle.** Test expired and
      revoked sessions, logout, password recovery, account switching,
      OAuth callback/redirect validation and local-data visibility after
      logout. Confirm no prior user's data remains visible to the next
      account.
- [ ] **H --- Review serverless endpoint abuse protections.** For
      `/api/probe` (`api/probe.ts`, `src/api/providerProbeCore.ts`), bound
      ID length, cache size and response-body size; add rate limits,
      robust error handling and a suitable execution timeout. Avoid
      arbitrary upstream-host access and unbounded concurrent requests.

### Credentials and production security

- [ ] **H --- Remove exposed API credentials from the client bundle
      where appropriate.** The audit found the OMDb key and a TMDB
      token/key path in `src/api/tmdb.ts:8`. Move the OMDb request behind
      a server-side function; use a restricted TMDB v3 API key where
      appropriate and rotate any credential that has been exposed. Never
      ship a privileged bearer token in client code.
- [ ] **H --- Verify production and preview deployment access.** Check
      the production domain, preview deployments and alternate URLs
      against the intended access policy. `noindex` is not access control.
      Use actual authentication or deployment protection if the app must
      be private.
- [ ] **H --- Verify legal authorisation for video providers before
      public release.** Confirm that each source is authorised to
      distribute the content it serves and review the applicable terms.
      Playback availability is not evidence of a licence. Treat this as a
      separate legal/deployment decision, not a code-quality finding.

---

## 2. Medium-priority fixes and checks

### Bugs, performance and resilience

- [ ] **M --- Handle permanent offline-queue errors correctly.**
      `processOperation` swallows errors (`offlineQueue.ts:145–147`); a
      unique violation (`23505`) can consume all retries. Treat an
      already-existing record as success where appropriate and stop
      retrying permanent errors.
- [ ] **M --- Batch bulk "unmark watched" operations.**
      `unmarkAllSeasonsWatched` (`storage.ts:820–826`) performs one delete
      per episode and repeatedly parses/rewrites an index. Batch deletes
      by season and avoid repeated parsing.
- [ ] **M --- Surface local-storage write failures.** `safeWrite`
      (`storage.ts:260–268`) only logs quota errors. Return failure
      information to callers and show an actionable notification instead
      of displaying a state that was not saved.
- [ ] **M --- Fix the calendar timezone test.**
      `WatchLater.calendar.test.tsx` has a failing test for selected-day
      labels across time zones. Reproduce the cause and freeze time with
      fake timers where appropriate; do not assume the root cause before
      investigation.
- [ ] **M --- Add missing regression coverage.** The audit found no
      test files referencing `storageBackup`, `progressRepository` or
      `LoginForm`. Add tests for paginated downloads, backup
      export/import, sync failure paths and authentication flows.
- [ ] **M --- Review `/api/probe` resource limits.** In addition to
      abuse protection, test cache eviction, concurrent scans, timeout
      behaviour and error responses under failure conditions.
- [ ] **M --- Review deployed security headers and CSP.** Check
      `script-src`, `connect-src`, `frame-src`, `object-src`, `base-uri`,
      frame restrictions and referrer policy against actual application
      needs. Test provider redirects before narrowing `frame-src`.
- [ ] **M --- Review third-party data disclosure.** Document what is
      sent to APIs, authentication services and embedded video providers.
      Embeds may expose a user's IP address, browser metadata and viewing
      activity to third parties.
- [ ] **M --- Add supply-chain safeguards.** Use lockfile-based clean
      installs in CI, enable secret scanning, review dependency update
      PRs, pin GitHub Actions to reviewed versions/SHAs where practical,
      and consider generating an SBOM.
- [ ] **M --- Verify reproducible builds.** Confirm a clean checkout
      can install, test and build without developer-specific files or
      secrets.
- [ ] **M --- Account deletion and data cleanup.** Add an account
      deletion flow that clearly explains and verifies deletion of cloud
      rows and account credentials, with documented handling of local data
      and exported backups.
- [ ] **M --- Complete account management.** Add email/password change
      flows with appropriate reauthentication and translated success/error
      states.
- [ ] **M --- Add accessibility regression tests.** Extend beyond
      `App.a11y.test.tsx` to modal focus handling, notification
      announcements, keyboard navigation, contrast, focus visibility and
      reduced-motion preferences.

### Internationalisation

- [ ] **M --- Translate authentication forms.** `LoginForm.tsx`,
      `RegisterForm.tsx`, `ForgotPasswordForm.tsx` and
      `src/components/AuthModal/errors.ts` contain user-facing text that
      needs translation keys.
- [ ] **M --- Translate Supabase auth errors.** Map known error codes
      to friendly translated messages rather than displaying raw English
      errors.
- [ ] **M --- Translate notifications and controls.** Review
      `Notifications.tsx`, `BulkSelectBar.tsx`, `DatePickerField.tsx`,
      `ViewModeToggle.tsx`, `SelectDropdown.tsx` and
      `EpisodeDropdown.tsx`, including `aria-label`, `title`, `alt` and
      placeholder text.
- [ ] **M --- Review document language and title.** Check
      `index.html`'s static `lang="en"` and title before runtime language
      changes.
- [ ] **M --- Audit locale formatting.** Verify dates, numbers and
      relative times use the active locale (`toBcp47` in
      `src/i18n/language.ts`).
- [ ] **M --- Add an i18n regression check.** Add a lint rule or
      script that flags hard-coded user-facing JSX text. The audit
      reported translation-key parity across `en`, `es` and `eu`, but
      components bypassing i18n still need manual confirmation.
- [ ] **M --- Allow language selection while signed out.** Add a
      language selector to the navbar/auth modal or expose only
      appropriate local settings publicly. Keep account and cloud controls
      protected.

### Existing features and UX

- [ ] **M --- Add a visible sync status and recovery UI.** Show states
      such as Synced, Syncing, Offline, Changes pending and Sync failed;
      provide retry and explain unresolved writes. This improves the
      existing offline queue rather than introducing a duplicate feature.
- [ ] **M --- Improve backup/restore UX after fixing integrity
      issues.** Validate the file, show a restore preview and explain
      conflicts/errors. Never imply success when an export or restore is
      incomplete.
- [ ] **M --- Decide which preferences should sync.** Video source,
      timezone, language, upcoming-list state and notification preferences
      are currently described as local-only in the audit. Decide what
      belongs in a cloud settings table and document what remains
      device-specific.
- [ ] **M --- Monitor video-source health.** Consider scheduled health
      checks and a maintained status record instead of relying solely on
      user-triggered `/api/probe` calls. Only monitor sources that are
      appropriate and authorised to use.
- [ ] **M --- Review large components and separation of concerns.**
      Consider splitting `TVDetail.tsx` (\~1,890 lines), `WatchLater.tsx`
      (\~1,767 lines) and `storage.ts` (\~1,337 lines) into smaller
      modules with clearer responsibilities. Refactor incrementally with
      regression tests.

---

## 3. Low-priority cleanup

- [ ] **L --- Normalise search-history queries.** The unique index on
      `(user_id, query)` is case-sensitive, while client operations use
      case-insensitive matching. Normalise on write or use an appropriate
      lower-case index.
- [ ] **L --- Review row-limit triggers.** Migration 004 counts rows
      for each inserted row and concurrent inserts may exceed the cap
      slightly. Evaluate performance and concurrency-safe enforcement.
- [ ] **L --- Fix keyboard shortcut stale closures.** `TVDetail.tsx`
      (\~lines 756--790) suppresses `exhaustive-deps` and omits callbacks.
      Use a stable/ref-based handler and add a regression test.
- [ ] **L --- Reduce lint/type debt.** Review the reported
      `exhaustive-deps` warnings, `eslint-disable` comments, empty `catch`
      blocks, `as never` casts and `any` in `src/api/tmdbCache.ts`.
- [ ] **L --- Restrict `frame-src` where feasible.** The current
      policy allows `https:` broadly. Narrow it only after testing
      legitimate provider redirects and keeping the allowlist
      maintainable.
- [ ] **L --- Replace the remote placeholder image.** Ship a local SVG
      instead of loading `PLACEHOLDER_POSTER` from `placehold.co`.
- [ ] **L --- Repository hygiene.** Decide whether `Audit_Report.md`
      and `TODO.md` should remain in the public repository, and ensure
      audit documents do not contain secrets or sensitive deployment
      details.
- [ ] **L --- Consider a PWA/offline shell.** Evaluate installability
      and offline access after core sync and data-integrity issues are
      fixed.

---

## 4. Feature backlog (after reliability fixes)

These are product ideas, not confirmed defects. Check the current UI and
existing TODO before implementing; do not duplicate functionality
already present.

### Account and convenience features

- [ ] **M --- Google sign-in.** Configure the Google OAuth client and
      Supabase provider, add production/local redirect URLs, handle
      account-linking cases, translate the UI in English/Spanish/Basque
      and test the full flow.
- [ ] **M --- Account settings.** Complete account deletion and
      email/password changes (see the fixes above).
- [ ] **L --- Evaluate session/device management.** Add only if
      supported by the auth architecture and useful for the app's privacy
      model.

### Potential product enhancements

- [ ] **M --- Advanced custom lists.** Let users create, rename,
      reorder, filter and delete multiple lists, with duplicate
      prevention. This extends watch-later rather than replacing it.
- [ ] **M --- Viewing statistics.** Summarise recorded films/episodes,
      genres and monthly/yearly trends. Clearly distinguish actual records
      from estimates.
- [ ] **M --- Release-calendar enhancements.** Consider filters, date
      ranges and optional iCalendar export if these are not already
      available.
- [ ] **M --- Data portability.** Consider CSV export for
      lists/history and import from other media trackers, after
      backup/restore validation is complete.
- [ ] **M/L --- Personalised recommendations.** Explore genre-,
      rating- or similarity-based recommendations only after viewing data
      is reliable and users have appropriate controls.
- [ ] **L --- Optional PWA/offline shell.** Revisit once offline
      persistence and sync recovery are dependable.

**Do not add "build viewing progress/history" as a new feature without
checking the current implementation first.** The app already has watched
status, history/progress-related functionality and Continue Watching
concepts. Track this as a reliability/regression-test item in Section 1
unless a concrete missing capability is confirmed.

---

## 5. Additional high-priority checks to add

- [ ] **H --- Cross-account isolation:** test all CRUD operations and
      storage access using two accounts, including attempts to tamper with
      user IDs.
- [ ] **H --- Account switching and queued writes:** verify no queued
      operation can be uploaded under the wrong account.
- [ ] **H --- Authentication lifecycle:** test expired/revoked
      sessions, logout, password recovery, OAuth callbacks and redirects.
- [ ] **H --- Hostile backup imports:** test malformed, oversized and
      unsupported backups without data loss.
- [ ] **H --- Serverless endpoint abuse:** enforce
      size/time/concurrency/rate limits, cache bounds and strict
      upstream-host validation.
- [ ] **H --- Production access control:** verify production, preview
      and alternate deployment URLs have the intended access restrictions.
- [ ] **H --- Third-party credentials:** remove privileged tokens from
      client bundles and rotate exposed credentials where necessary.
- [ ] **H --- Video-provider authorisation:** separately verify
      distribution rights and applicable terms before making the project
      or deployment public.

---

## 6. Medium-priority checks to add

- [ ] **M --- Deployed security headers:** verify CSP and related
      headers against the real deployed app.
- [ ] **M --- Third-party privacy review:** document data exposed to
      API, auth and embed providers.
- [ ] **M --- Supply-chain security:** secret scanning, lockfile-based
      CI installs, reviewed dependency updates and optional SBOM
      generation.
- [ ] **M --- Reproducible build:** clean-clone install, test and
      production build without local secrets.
- [ ] **M --- Accessibility regression tests:** keyboard, focus,
      screen-reader announcements, contrast and reduced motion.
- [ ] **M --- Sync conflict and recovery tests:** concurrent edits,
      partial failures, retries, offline recovery and account changes.
- [ ] **M --- Account deletion verification:** verify cloud records,
      account credentials and documented local-data handling.
- [ ] **M --- Import/export integrity tests:** large datasets, schema
      versions, invalid files and failed operations.
- [ ] **M --- Provider health monitoring:** scheduled checks and clear
      failure reporting for authorised providers.

---

## 7. Improvements to the audit process itself

- [ ] **Audit-process improvement 1 --- Track evidence and status for
      every finding.** Label each item `Confirmed`, `Reproduced in tests`,
      `Potential` or `Resolved`; record the commit, reproduction steps,
      evidence and verification result. Do not present static-review
      hypotheses as confirmed runtime defects.
- [ ] **Audit-process improvement 2 --- Require regression tests and a
      defined closure check.** High-priority fixes should include a
      regression test where practical and be rechecked with typecheck,
      lint, tests, dependency audit and production build. For
      database/security findings, include an explicit live-environment
      verification step where safe and authorised.

---

## 8. Suggested implementation order

1.  Fix destructive data handling, pagination, reconciliation safety,
    offline-write loss and backup export/import.
2.  Complete password recovery and test account isolation, account
    switching and authentication lifecycle.
3.  Fix dependency/CI failures and remove secrets from test
    requirements.
4.  Harden `/api/probe`, protect third-party credentials and verify
    deployment access.
5.  Verify video-provider authorisation and review third-party
    terms/privacy before public release.
6.  Add regression coverage for sync, backup/restore, viewing progress
    and accessibility.
7.  Complete internationalisation and the signed-out language selector.
8.  Add account deletion and email/password management; then Google
    sign-in.
9.  Improve sync status, preference handling, performance and component
    separation.
10. Consider new product features only after the reliability and
    security work is complete.
