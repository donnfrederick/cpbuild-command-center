# Copilot Learnings Log

This file is a living record of two types of entries:

1. **Copilot catches** — patterns GitHub Copilot caught in code review that the agent or developer did not catch before pushing
2. **Session retrospectives** — agent process failures identified during a session (wrong branch, missed checklist steps, etc.) — tagged `session retrospective` in the heading

Both types drive the same goals:

- **Pre-push self-check** — Agents read this before writing new code in the relevant categories
- **Rule distillation** — Periodically reviewed and distilled into `.cursor/rules/` so patterns become proactive, not reactive

**Agents: when you resolve a Copilot comment or identify a process failure, add a row here before closing the PR.**

---

### 2026-06-18 | PR #1307 | prisma/migrations

**What Copilot caught:** `form_purpose` migration used bare `ADD COLUMN` without `IF NOT EXISTS`.
**Root cause:** New migration copied a minimal ALTER pattern without matching repo idempotency convention.
**Fix applied:** `ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "purpose" ...`.
**Rule to reinforce:** Pre-Push row for `prisma/migrations/` — grep sibling migrations for `IF NOT EXISTS` / guarded DDL before opening PR.

### 2026-06-18 | PR #1307 | typescript/types

**What Copilot caught:** `inferFieldMediaMimeType` returned `image/jpeg` for any image-like URL extension; unused import; unsafe `subcontractorName` cast from JSON metadata; misleading unit test name.
**Root cause:** URL fallback branch hardcoded JPEG; copy-paste import left behind; metadata fields assumed string without runtime check; test name didn't match assertion.
**Fix applied:** Extension lookup via `EXT_TO_MIME`; removed import; `typeof rawName === "string"` guard; renamed test; added MIME unit tests.
**Rule to reinforce:** When inferring MIME from URL/path, reuse extension map — never hardcode a single type for a regex that matches multiple extensions; JSON metadata strings need typeof guards before interpolation.

### 2026-06-18 | PR #1307 | frontend-patterns

**What Copilot caught:** Duplicate `storageKeyFromUrl` local helper while shared import was unused; hydrated metadata omitted `toUnifierSubId: null` for cleared rows; hardcoded px font/spacing in new component.
**Root cause:** Copy-paste during reporting normalization refactor; conditional spread dropped falsy subcontractor ids; new UI component skipped token table.
**Fix applied:** Use `storageKeyFromFieldMediaUrl` only; always set `toUnifierSubId` on hydration; `ActivityListCountSummary` uses `--space-*`, `--text-caption`, `--font-weight-semibold`.
**Rule to reinforce:** Pre-PR color audit should include spacing/fontSize/fontWeight literals — not just color values.

### 2026-06-18 | PR #1307 | api/performance

**What Copilot caught:** Offline pending inspections lost `scopeRowId` in activity metadata when scope row wasn't hydrated; O(n²) filter in bulk installer logging; unbounded `submissionIds` on PDF export.
**Root cause:** `buildInspectionActivityLocationMetadata` required both scopeRowId and scopeRow; nested filter+includes in activity loop; no export cap on client-provided id list.
**Fix applied:** Fallback branch preserves scopeRowId + scopeTypeCode without scopeRow; Set-based iteration; `MAX_INSPECTION_REPORT_EXPORT_SUBMISSIONS = 100` guard.
**Rule to reinforce:** Activity metadata builders must tolerate partial hydration (id without joined row); bulk loops over capped id lists use Set membership; PDF/export endpoints need explicit id-count guards.

---

### 2026-06-17 | fix/inspection-sync-slow-gate | offline/sync

**What failed:** Clear inspection on PWA showed "Pending sync" indefinitely on WiFi; dev server never received the submission.
**Root cause:** PR #1280 gated `tryFlushPending()` (in `lib/inspections/useInspectionSync.ts`) and `syncOne` media upload on `shouldDeferNetworkWork()` (connectivity probe "slow"). Mobile WiFi often exceeds the 3s probe budget, so initial sync skipped media/POST and all background retries were blocked while the browser reported online.
**Fix applied:** Removed probe gate from inspection flush and media resolve; flush on mount, reconnect, tab visibility, slow→good, and 60s interval while visible.
**Rule to reinforce:** Local-first defer applies to submit UX only — background sync retries must run whenever `navigator.onLine`, not when latency probe says "good".

### 2026-06-16 | PR #1280 | offline/indexeddb

**What Copilot caught:** After `resolvePendingInspectionMedia` uploads a deferred photo, the `pendingBlobId` blob was never deleted from `cc-offline-blobs`; `notifyConnectivityQualityChange` did not isolate listener failures; locale-specific date test assertions were flaky.
**Root cause:** Upload path returned `serverUrl` but omitted blob cleanup (unlike mutation-queue uploads); event bus called listeners without try/catch; test asserted English month abbreviations from `toLocaleString([])`.
**Fix applied:** `deleteBlob(pendingBlobId)` after confirmed upload (cleanup failure swallowed); wrap each quality listener in try/catch; locale-agnostic date test; React Compiler lint fix on `handleSheetKeyDown` deps; throw when deferred blob missing (no silent media drop); flush on slow→good uses `shouldDeferNetworkWork({ bypassCache: true })`; `updatePendingPayload` after media resolve before POST; `notifyConnectivityQualityChange` refreshes probe cache.
**Rule to reinforce:** Any local-first flow that stores blobs in IDB for later upload must delete the blob after successful server upload; pub/sub notifiers must not let one subscriber failure block others; connectivity-triggered flushes must bypass stale probe cache.

### 2026-06-16 | PR #1280 | api/performance

**What Copilot caught:** Client connectivity probes hit `GET /api/health`, which runs `SELECT 1` on every request — with 60s probes per tab this creates unnecessary DB load at scale.
**Root cause:** Reused the deploy health endpoint for latency probes without considering its DB side effect.
**Fix applied:** Added `GET /api/connectivity` (204, `no-store`, no DB); pointed `CONNECTIVITY_PROBE_URL` at it; documented in `api-endpoints.md`.
**Rule to reinforce:** Client-side connectivity/latency probes must use a DB-free liveness route — reserve `/api/health` for infra/deploy checks.

### 2026-06-15 | PR #1272 | offline/react

**What Copilot caught:** Mid-module import in SubcontractorPicker; unhandled promise rejections on resumable-draft IDB lookups; stale Resume CTA when switching scopes; UnitCards 6s abort left `loading` true; sequential per-project snapshot enrichment.
**Root cause:** Snapshot fallback import was added inline after helper code; draft-discovery effects used `void promise.then()` without `.catch()` or null reset; abort cleanup and timeout abort shared one `signal.aborted` guard in `finally`; snapshot serializer used sequential `for` loop.
**Fix applied:** Top-level import; `.catch()` + always set resume form to draft or `null`; `abortedByCleanup` flag + i18n timeout error; `Promise.all` for enrichment.
**Rule to reinforce:** Client effects that touch IndexedDB must `.catch()` and reset derived UI state when inputs change; abort controllers need separate cleanup vs timeout handling; snapshot/bulk serializers should parallelize independent per-project work.

### 2026-06-15 | PR #1272 | offline/indexeddb (round 2)

**What Copilot caught:** Resume-draft UI not cleared before async IDB lookup on scope/category change; unit-level draft discovery scanned entire `inspectionDrafts` store.
**Root cause:** Effects only set resume form in `.then()`; `listAllInspectionDrafts()` used `getAll` instead of a unit index.
**Fix applied:** `setResumableDraftForm(null)` / `setClearResumeForm(null)` at effect start; DB v3 adds `by_unit` index + `listDraftsForUnit()`; test helper deletes IDB between runs.
**Rule to reinforce:** Async-derived UI from IndexedDB must reset synchronously when lookup keys change; new IDB query paths need a matching index — never full-store scan when an indexed field exists.

### 2026-06-15 | PR #1272 | offline/snapshot (round 3)

**What Copilot caught:** Published forms snapshot fallback on 401/403; empty units/issues treated as cache miss; OfflineCachePanel read first snapshot not newest.
**Root cause:** Broad catch on listPublishedForms; length > 0 guards on empty arrays; readCacheManifest used keys.find without generatedAt comparison.
**Fix applied:** Auth errors rethrow; snapshot fallback when module exists even if empty; findSnapshotCacheKey picks latest generatedAt; shared readSnapshotData in panel.
**Rule to reinforce:** Offline snapshot fallback is for connectivity/server errors only — not auth failures; valid cached empty collections must not fall through to error state.

### 2026-06-15 | prod hotfix | indexeddb/concurrency

**What failed:** IM submit clear inspection with 7 photos on prod Safari — `Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.`
**Root cause:** Draft autosave (`putDraft`) and submit (`queueInspection` + `deleteDraft`) fired concurrent transactions on the shared `cpb-command-center` IDB while media upload was in-flight; Safari closes the connection when transactions overlap.
**Fix applied:** Promise-chain mutex on inspection IDB (no nested task calls); `prepareForSubmit()` cancels autosave and awaits in-flight write without bumping draft generation; blob-store closes DB in `finally`.
**Rule to reinforce:** All writes to a shared IndexedDB singleton must be serialized via a single queue; do not bump draft-generation counters before submit or in-flight autosave may delete the draft; always `finally { db.close() }` on blob-store helpers.

### 2026-06-12 | PR #1252 | inspections/outcomes

**What Copilot caught:** `submissionOutcomeIsFail` treated `COMPLETE` as failure; `recomputeScopeInspectionStatusFromSubmissions` and inspection reset used `resolvedSubmissionCategory` instead of `resolveGridSubmissionCategory`, missing legacy `PRE_INSTALL` stubs whose linked form is 2AC/FV.
**Root cause:** Outcome helpers copied fail semantics from an old branch; recompute/reset did not reuse the grid category resolver that prefers form category on category-only stubs.
**Fix applied:** `COMPLETE` is pass-like; recompute/reset use `resolveGridSubmissionCategory` with explicit calibration skip on recompute.
**Rule to reinforce:** Pass/fail UI helpers must match `scopeInspectionStatusFromSubmission` / seed helpers (`COMPLETE` = pass); any code resolving submission category for status sync or reset must use `resolveGridSubmissionCategory`, not raw snapshot category.

### 2026-06-12 | PR #1237 | pdf/export

**What Copilot caught:** `decodeURIComponent` on attachment basenames without try/catch can throw `URIError` and abort the whole PDF; static `pdf-lib` import bloated Observations Log bundle; api-contracts doc said batch cap 30 while code enforces 20.
**Root cause:** Filename helper assumed well-formed encoding; merge helper imported at module top level; doc drift from implementation constant.
**Fix applied:** `decodeAttachmentBasename()` with fallback; dynamic `import()` for merge on export; doc corrected to 20; added `preserveObservationOrder` for log export screen order.
**Rule to reinforce:** Any `decodeURIComponent` on external/storage-derived strings needs try/catch; heavy client-only libs used in one action should lazy-load; export batch caps in code and contracts must match.

### 2026-06-12 | PR #1237 | api/validation

**What Copilot caught:** `includeCover` / `coverObservationCount` silently ignored wrong JSON types; `enrichProjectById()` throw aborted export outside PDF try/catch; batch export timers not cleared when `fetch()` throws.
**Root cause:** Ad-hoc body reads instead of shared parse helpers; enrichment treated as hard dependency; cleanup only after successful fetch.
**Fix applied:** `parseOptionalBoolean` / `parseOptionalPositiveInt` with 400 responses; best-effort enrichment with fallback; `try/finally` around per-batch fetch.
**Rule to reinforce:** Export body fields use the same parse-and-400 pattern as filter arrays; external enrichment before PDF render must be best-effort; timer cleanup belongs in `finally`.

### 2026-06-10 | PR #1213 | typescript/async

**What Copilot caught:** Fire-and-forget async IIFEs (`finishClose`, `runAction`, autosave `setTimeout`) lacked `.catch` — IndexedDB failures became unhandled rejections.
**Root cause:** Pattern copied from sheet animation helpers without error boundary on persistence side effects.
**Fix applied:** Added `catch` with `console.warn` in guard/resume sheets and autosave timer.
**Rule to reinforce:** Any `void (async () => …)()` or `void promise()` from timers must handle rejection.

### 2026-06-10 | PR #1213 | frontend/css-tokens

**What Copilot caught:** Pending-media banner used `--warning-800/50/200` tokens not defined in `globals.css`.
**Root cause:** Copied warning palette from another component that used inline fallbacks.
**Fix applied:** Switched to defined tokens `--warning-600`, `--warning-100`, `--neutral-200`.
**Rule to reinforce:** Pre-Push CSS color audit — only tokens present in `globals.css` or documented exceptions.

### 2026-06-10 | PR #1213 | typescript/async (round 2)

**What Copilot caught:** `getDraft()` in overlay mount effect had no `.catch()` — IDB failure left overlay stuck on spinner.
**Root cause:** Same fire-and-forget gap as guard sheets; load path treated as infallible.
**Fix applied:** `.catch` sets `idbLoaded` + `resumeResolved` so fill proceeds without draft.
**Rule to reinforce:** Every IDB read in mount effects needs failure path that unblocks UI.

---

### 2026-06-09 | PR #1196 | i18n + a11y

**What Copilot caught:** Blocking submit banners used `role="status"`; deficiency description used a `<span>` label without `htmlFor`; `shouldHighlightDeficiencyDescription` typed `severity` as `string`; duplicate `.ifo-fill-modal:has(.inspection-retry)` overflow in FILL_CSS vs globals.css; test mock for `deficiencyCountDisplay` didn't pluralize.
**Root cause:** New UX surfaces added without matching existing alert/label a11y patterns; utility param typed loosely; scoped CSS duplicated global rule.
**Fix applied:** `role="alert"` on blocking banners; `label htmlFor` + `useId` + `aria-describedby`; `DeficiencySeverity` type; removed duplicate CSS; ICU-style mock in tests.
**Rule to reinforce:** Blocking validation feedback → `role="alert"`; required fields → programmatic label association; don't duplicate globals in component-scoped CSS blocks.

---

### 2026-05-29 | PR #1027 | prisma/migrations + typescript/types

**What Copilot caught:** New migration used bare `CREATE TYPE` / `ADD COLUMN` / `CREATE INDEX` (not idempotent on partial deploy failure); unused `ClearInspectionType` type-only import left in `inspection-submissions/route.ts`.
**Root cause:** Migration authored without matching repo idempotent SQL pattern; type import left over after refactor to helper function.
**Fix applied:** Wrapped enum in `DO $$ … duplicate_object`; `ADD COLUMN IF NOT EXISTS`; `CREATE INDEX IF NOT EXISTS`; removed unused import.
**Rule to reinforce:** Every new migration must follow the idempotent pattern in `20260430120000_add_submission_source_backfill` — scan for bare `CREATE TYPE` before opening PR.

---

### 2026-05-22 | PR #915 | prisma/migrations + bootstrap + unifier-merge

**What Copilot caught:** Railway bootstrap step labels were out of order vs execution; bootstrap-test-media used plain base64 JWT decode and silently ignored HTTP 400 upload failures; test_seed_batches migration lacked idempotent guards; cloning from a test clone stored synthetic `__TEST_CLONE_*__` into `sourceUnifierPid`; `enrichProjectList()` called `buildShellIndex()` twice per request.
**Root cause:** New bootstrap/migration/clone paths were added without matching existing repo patterns (idempotent SQL, shared Supabase URL helper, shell-index reuse, chained clone provenance).
**Fix applied:** Reordered steps 2c/2d; extracted `lib/supabase-url-shared.ts`; log + local fallback on any non-2xx upload; rewrote migration with IF NOT EXISTS / duplicate_object blocks; use exported `resolveShellUnifierPid()` when setting clone provenance; pass shell index into `resolveCloneSourceNames()`.
**Rule to reinforce:** Bootstrap scripts share env-decoding helpers with server code; migrations follow idempotent SQL pattern; test-clone provenance must chain `sourceUnifierPid`; reuse Unifier shell indexes within a single enrich pass.

### 2026-05-12 | PR #830 | security/guards — forwarded-host-redirect-hardening

**What Copilot caught:** Proxy redirect normalization trusted forwarded host/proto values when rewriting internal redirects, missed IPv6 loopback (`::1`) even though the PR described loopback coverage, and initially allowed forwarded/host header userinfo confusion (`good.com@evil.com`).
**Root cause:** The first fix targeted the observed Railway/ngrok failures (`0.0.0.0` and `localhost`) without broadening the loopback set or reusing the configured public origin as the safer source of truth.
**Fix applied:** Added internal hostname detection for IPv6 loopback, preferred non-internal `AUTH_URL`/`NEXTAUTH_URL` over forwarded headers, validated forwarded host/proto fallbacks, rejected forwarded and raw host header userinfo delimiters, and added regression tests.
**Rule to reinforce:** Redirect normalization that uses forwarded headers must prefer configured public origins and include all loopback variants in tests, not just the one observed in logs.

### 2026-05-12 | PR #830 | react-hooks — callback-dependencies

**What Copilot caught:** `openForm()` in both issue modals referenced `scrollFieldIntoView()` from component scope while declaring an empty dependency array.
**Root cause:** The scroll helper was written as a local function and then reused inside a memoized callback without converting both pieces to the standard hook dependency shape.
**Fix applied:** Wrapped `scrollFieldIntoView()` in `useCallback`, added it to `openForm()` dependencies, and added it to the viewport resize effect dependencies.
**Rule to reinforce:** When a helper is used from a memoized callback or effect, either define it inside that hook or wrap it in `useCallback` and include it in dependency arrays.

### 2026-05-12 | PR #830 | react-state — misleading-progressive-reveal-flag

**What Copilot caught:** `openForm()` set `titleTouched` before the user actually focused or edited the title field, disabling the intended progressive reveal behavior and making the state name misleading.
**Root cause:** The first mobile keyboard fix reused an existing state flag to reveal the rest of the form after entering the issue step, instead of preserving the flag's original "user touched title" meaning.
**Fix applied:** Removed the eager `setTitleTouched(true)` calls from both issue modals so the title remains visible without auto-opening the keyboard, and advanced fields still reveal only after title interaction.
**Rule to reinforce:** Do not reuse a state flag for a new UI milestone if the flag name encodes a stricter user action; add a separate flag or preserve the original semantics.

### 2026-05-12 | PR #830 | testing — hermetic-env-and-realistic-fixtures

**What Copilot caught:** Proxy unit tests depended on ambient `AUTH_URL`/`NEXTAUTH_URL` being unset, and the issue modal test used an incomplete `UnitContext` fixture.
**Root cause:** The tests validated the intended scenario but did not isolate process env or mirror the full production type shape.
**Fix applied:** Cleared/restored auth URL env vars around proxy tests and added `unitKey`/`unitRef` to the issue modal fixture.
**Rule to reinforce:** Tests for env-sensitive helpers must explicitly control process env, and component fixtures should include every required field from the production interface.

---

### 2026-05-08 | PR #809 | security/guards — middleware-port-leak-in-redirects

**What Copilot caught:** (1) `getPublicOrigin()` unconditionally stripped the port from the host string, which would have turned `localhost:3000` into `localhost` in local dev, breaking auth redirects. (2) Using `x-forwarded-host` without validation created a potential open-redirect surface if both forwarded headers were spoofed. (3) `withCleanLocation()` cloned the response via `NextResponse.redirect()` and copied headers with `forEach`, risking silent loss of `Set-Cookie` headers. (4) JSDoc described the function as returning an origin "with no port" but the no-proxy path returned `raw.origin` which includes the dev port — inconsistent contract. (5) `new URL(AUTH_URL)` could throw and take down all middleware if the env var was malformed.
**Root cause:** Fixing the Railway `:8080` port leak required constructing a public-facing origin, but the first implementation relied on `x-forwarded-*` headers without guarding against local dev or spoofing scenarios, and used response cloning instead of in-place mutation.
**Fix applied:** (1) Guard port-stripping on `x-forwarded-host` presence so local dev is unaffected. (2) Replaced `x-forwarded-*` approach entirely with `AUTH_URL ?? NEXTAUTH_URL` as the source of truth (matching `lib/auth.ts`), eliminating the spoofing surface. (3) Mutate `Location` header in-place instead of cloning the response. (4) Updated JSDoc to reflect conditional behavior. (5) Wrapped `new URL(configured.trim())` in try/catch with a safe fallback.
**Rule to reinforce:** When constructing URLs in middleware from request headers, always (a) prefer explicit env vars over forwarded headers, (b) guard env-var URL parsing in try/catch, and (c) mutate redirect response headers in-place rather than cloning to avoid header loss.

---

### 2026-04-28 | PR #725 | i18n — hardcoded-strings-in-new-components

**What Copilot caught:** `GenerateResetLinkModal` and the `MemberRow` reset-link section had all UI strings hardcoded in English even though `messages/en.json` and `messages/es.json` were updated with the correct `users.resetLink.*` keys. A second review pass also caught hardcoded English fallback strings (`"there"`, `"this user"`) and the clipboard error toast.
**Root cause:** The i18n keys were added to the message files but the component was never wired to `useTranslations()`. Fallback strings and error toasts were overlooked in the first pass.
**Fix applied:** Added `useTranslations("users")` to both `GenerateResetLinkModal` and `MemberRow`; replaced all hardcoded strings with `t(...)` calls including clipboard error, name fallback, and description fallback. Added missing keys (`copyLinkOnly`, `copyLinkHint`, `copyFailed`, `nameFallback`, `descriptionFallback`) to both locale files.
**Rule to reinforce:** Every new component that displays user-visible text must import and use `useTranslations`. Grep for ALL literal English strings in the component — including error messages, fallbacks, and button labels — before calling i18n "done".

### 2026-04-28 | PR #725 | security/guards — special-perms-not-propagated-to-api-routes

**What Copilot caught:** `getGlobalNavAccess()` was updated to show the Users nav for users with `INVITE_MEMBER` via special permissions, but `/api/invites` and `/api/roles` still called `hasPermission(..., [])` — an empty special-perms array — meaning the user would see the nav but get a 403 when trying to invite.
**Root cause:** The special-permissions feature was wired for the UI (server component session) but not for the API routes, which use a separate local `getSession()` that returns a bare `auth()` JWT without special permissions.
**Fix applied:** Created `lib/user-special-permissions.ts` (`fetchUserSpecialPermissions(userId)`) and called it in both routes before the `hasPermission` check.
**Rule to reinforce:** When adding a special permission that controls a UI action, always grep for the corresponding API route(s) and update their `hasPermission` calls in the same PR.

### 2026-04-28 | PR #725 | typescript/types — window-in-ssr-context

**What Copilot caught:** `window.location.origin` was computed at the module level during component render in `GenerateResetLinkModal`. Client components can still be server-rendered (SSR), so `window` would be undefined and throw.
**Root cause:** The origin was computed in a `const` at the top of the component body, which runs during SSR.
**Fix applied:** Moved to a `useState("")` + `useEffect` that sets `origin` only on the client after mount.
**Rule to reinforce:** Never access `window`, `document`, or `navigator` at the top level of a React component body. Always guard with `typeof window !== "undefined"` or initialize lazily in a `useEffect`.

### 2026-04-28 | PR #725 | security/guards — special-perms-must-cover-all-related-routes

**What Copilot caught:** After adding `fetchUserSpecialPermissions` to `/api/invites` and `/api/roles`, additional routes backing the same Users-page UI (`/api/users/[id]/generate-reset-link`, `/api/users/[id]/special-permissions`, `/api/users/[id]/special-permissions/[permissionId]`, `/api/team/[id]`) still used role-only `hasPermission` calls with an empty special-perms array.
**Root cause:** The fix was applied to the two most obvious routes but not exhaustively to all routes gated on the same permissions that the UI now considers via special perms.
**Fix applied:** Applied `fetchUserSpecialPermissions` to all four remaining routes.
**Rule to reinforce:** When adding special-permission support to a UI feature, grep for every `hasPermission(session.user.role, PERMISSIONS.X, [])` in the codebase that guards the same UI action and update them all in the same PR. Partial fixes create a UI that shows controls but silently returns 403.

### 2026-04-28 | PR #725 | testing — mock-token-length-mismatch

**What Copilot caught:** The integration test mocked `generateResetToken()` returning `"plaintext-token-hex"` (17 chars), but the real reset-password page validates `token.length === 64`. The test passed but would not catch a regression where a short token slips through.
**Root cause:** The mock return value was chosen for readability, not realism.
**Fix applied:** Changed mock to return `"a".repeat(64)` — still deterministic but correct length.
**Rule to reinforce:** Token mocks in integration tests must use the exact format (length, character set) that production code and page-level guards expect.

### 2026-04-28 | PR #725 | testing — plain-request-vs-next-request

**What Copilot caught:** Integration test for the `generate-reset-link` route used `new Request(...)` but the handler signature types the first parameter as `NextRequest`.
**Root cause:** `NextRequest` was not imported in the test file; the agent used the standard web `Request` constructor by default.
**Fix applied:** Imported `NextRequest` from `next/server` and replaced `new Request(...)` with `new NextRequest(...)`.
**Rule to reinforce:** Integration tests for Next.js App Router route handlers must use `NextRequest` (from `next/server`), not the bare web `Request`.

### 2026-04-24 | PR #699 | prisma/migrations — idempotent-enum-value

**What Copilot caught:** `ALTER TYPE ... ADD VALUE` without `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` fails on re-run or if the value was manually added.
**Root cause:** Agent copied the migration command from memory without checking the repo's established pattern (established in `20260415120000_nondestructive_image_annotation`).
**Fix applied:** Wrapped in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`.
**Rule to reinforce:** Every enum `ADD VALUE` migration must use the `DO $$ BEGIN ... EXCEPTION ... END $$` pattern. Check an existing migration for the exact pattern before writing.

### 2026-04-24 | PR #699 | typescript/types — stale-error-messages

**What Copilot caught:** 403 error message strings and file-level comments still said "install manager" after `INSTALL_DIRECTOR` was added to the privilege gate.
**Root cause:** Error message strings are not type-checked and are easy to forget when a new role is added to a gate.
**Fix applied:** Updated error messages in resolve/route.ts and reopen/route.ts; updated file-level comment.
**Rule to reinforce:** When adding a role to any `isPrivileged` array, grep for the associated 403 message and update it in the same commit.

### 2026-04-24 | PR #699 | typescript/types — unused-variable-not-linted

**What Copilot caught:** `rowsNeedingClearDeleted` was populated but never used in the undo route — a dead code path with no ESLint enforcement.
**Root cause:** Variable was created for a planned `updateMany` call scoped to "rows being cleared," but the implementation used `restoredRowIds` (all rows) instead. The unused variable was missed in review.
**Fix applied:** Removed `rowsNeedingClearDeleted` and simplified the loop.
**Rule to reinforce:** After refactoring conditional logic, scan for variables populated inside condition branches that are never consumed downstream.

### 2026-04-24 | PR #699 | i18n — hardcoded-strings-in-new-component

**What Copilot caught:** New UI component (`InspectionConfirmView`) had hardcoded English strings for option labels, heading, CTA, and summary labels rather than using `t()`.
**Root cause:** The component was written quickly without referencing the i18n pattern used in the surrounding `StatusConfirmView`.
**Fix applied:** Added keys to `en.json` and `es.json`; updated component to use `t()` for all user-visible strings.
**Rule to reinforce:** Every new UI component in this repo must use `t()` for all user-visible strings. Check the nearest sibling component for the established i18n pattern before writing new text.

### 2026-04-24 | PR #699 | security/guards — role-parity-across-resolve-reopen

**What Copilot caught:** `DEVELOPER` was in the `isPrivileged` set for the resolve route and the UI's `canResolve`/`canReopen` check, but the reopen route's server-side `isPrivileged` did not include `DEVELOPER`. This produced a visible Reopen CTA that consistently 403-ed for developers.
**Root cause:** When `DEVELOPER` was added to the resolve route's privilege set, the reopen route was not audited for parity. The two routes were written separately and diverged silently.
**Fix applied:** Added `DEVELOPER` to the reopen route's `isPrivileged` check and updated the file-level comment.
**Rule to reinforce:** When adding a role to any privilege gate, grep for all sibling gates (resolve, reopen, edit, etc.) and verify each is updated in the same commit.

### 2026-04-24 | PR #699 | api/response — updated-count-semantics-vs-side-effects

**What Copilot caught:** The `updated` response count was derived from `updatedIds.length + updatedInstanceIds.length`, which included internal side-effect writes (synthesized parent rows). Users saw inflated counts (e.g. "2 updated" when selecting 1 sub-scope instance).
**Root cause:** `updatedIds` was introduced for ClearInspection sync and reused for the response count without distinguishing between applied targets and internal implementation writes.
**Fix applied:** Derived `updated` from `appliedRowIds.length + appliedSubScopeInstanceIds.length` — counts only applied targets. Removed `updatedInstanceIds` in favour of `appliedSubScopeInstanceIds`.
**Rule to reinforce:** `updated` in a bulk response should count things the caller requested to change, not internal rows the implementation touches as side effects. Use a separate `applied*` set for the response.

### 2026-04-24 | PR #699 | api/response — applied-ids-missing-synthesized-rows

**What Copilot caught:** `appliedRowIds` only contained rows the client sent directly. Parent rows synthesized from `subScopeInstanceIds` were not returned, so the client could not build a complete undo payload or activity log for those rows.
**Root cause:** The original intent was to let the client track only what it requested. But the API intentionally updates parent rows too (for ClearInspection display), making the client's view incomplete.
**Fix applied:** Removed the `if (rowIds.includes(rowId))` guard; every successfully updated row — including synthesized ones — is now pushed into `appliedRowIds`.
**Rule to reinforce:** If an endpoint writes to rows beyond what the caller explicitly named, those additional rows must be included in the response's applied-ID set so callers can undo/log correctly.

### 2026-04-24 | PR #699 | api/silent-failure — activity-log-catch-swallowing

**What Copilot caught:** The multi-chunk inspection activity-log follow-up fetch used `.catch(() => {})`, silently swallowing both network errors and non-OK HTTP responses with no operator visibility.
**Root cause:** The catch block was a copy of an early draft pattern before the bulk-status flow added the `res.ok` toast. The inspection flow was written independently and did not adopt the same pattern.
**Fix applied:** Replaced `.catch(() => {})` with `try/catch` + `res.ok` check + `console.error` so failures appear in logs.
**Rule to reinforce:** Never use `.catch(() => {})` on a fetch that writes to a persistent store (activity log, DB). Always check `res.ok` and log errors so operators can detect missing entries.

### 2026-04-24 | PR #699 | typescript/types — weak-enum-in-metadata

**What Copilot caught:** `inspectionStatus: string | null` in the `SCOPE_INSPECTION_BULK_UPDATED` metadata shape weakened type-safety and allowed any string to be logged.
**Root cause:** The type was written quickly without referencing the existing Prisma/union type for inspection status.
**Fix applied:** Tightened to `"READY" | "PASSED" | "FAILED" | null`.
**Rule to reinforce:** Activity log metadata shapes must use the narrowest possible types. If the domain already has an enum or union type, mirror it exactly in the metadata interface.

### 2026-04-24 | PR #699 | api/schema — multi-chunk-activity-log-validation-failure

**What Copilot caught:** The multi-chunk activity-log follow-up request posted `rowIds: []` and `subScopeInstanceIds: []` to the bulk-inspection endpoint, which the schema `refine()` check rejected with 422. The `.catch(() => {})` silently swallowed the error, meaning the activity log was never written for multi-chunk inspection updates.
**Root cause:** The bulk-status route has a dedicated `/activity` sub-endpoint for multi-chunk log posts; the bulk-inspection route was modelled differently and did not account for the empty-ID case.
**Fix applied:** Added optional `appliedRowIds`/`appliedSubScopeInstanceIds` fields to the schema and updated `refine()` to pass when at least one pre-collected ID is present. Added an "activity-log-only" early-return path in the handler.
**Rule to reinforce:** When a new route supports `skipActivityLog`, verify the client's multi-chunk activity-log follow-up request can satisfy the schema. Always test the empty-ID case explicitly.

---

## Refresh cadence

Unpruned knowledge logs drift into noise. To keep this log useful, refresh it regularly.

**When:** every **50 merged PRs** OR **90 days**, whichever comes first.

**How:**

1. Run `npm run refresh:learnings` (dry-run audit, reports only — does not modify).
2. Review the three categories it surfaces:
   - **Stale entries** — dated entries older than 90 days whose pattern is now muscle memory or no longer applicable.
   - **Duplicate clusters** — entries whose headings share 3+ non-stopword tokens (candidates for merging into one canonical entry).
   - **Retired-flag hits** — Pre-Push Self-Check rows in `.cursor/rules/project-prompt.mdc` that reference APIs flagged "DEAD", "deprecated", "do not use" — candidates for retirement once the lesson is internalised.
3. Open a **refresh PR** that may do any of:
   - **Archive** stale entries to `docs/archive/COPILOT_LEARNINGS_<YYYY-MM>.md` (preserves history).
   - **Merge** duplicates into a single canonical entry, keeping the most recent date and linking the older PRs in the body.
   - **Retire** Pre-Push rows whose learning has become muscle memory. The underlying entry in this file stays as historical record; only the row in the matrix is removed.
4. Ask Phil before opening the PR (per `.cursor/rules/git-pr-workflow.mdc` PR creation gate).

**What to preserve no matter what:**

- Any entry that introduced a workflow/infra guardrail that is still active. Those are load-bearing.
- The `session retrospective` entries — they document process failures and are cheaper to keep than to re-derive.

**What this cadence buys:** the Pre-Push Self-Check in `project-prompt.mdc` stays actionable (not 200 rows long); the log stays searchable; the `learnings-search` step in `plan-calibration.mdc` returns signal, not noise.

The next scheduled refresh is tracked in `docs/PENDING_REMINDERS.md`.

---

### 2026-04-17 | PR #682 | session retrospective — round-cap/rationalisation-loop

**What Phil caught:**

PR #677 hit round 7 of Copilot review. Each individual round the agent rationalised "this is a real bug, the fix is 1 line, I'll just push it" and ignored the existing 5-round cap in the rule. The aggregate outcome — 7 rounds on a single docs/workflow PR — is exactly the failure mode the cap was meant to prevent, and the rule was abandoned in-flight without Phil's sign-off. Phil's instruction mid-loop: "why are we not honoring the 5 round rule? It seems there will always be more comments. I want to change it to max out at 3 rounds moving forward."

**Root cause:**

1. The 5-round cap was written as a safety valve but framed as "typical PRs converge in 1–3 rounds" — implying 4–5 rounds is still acceptable. With the cap that loose, the agent treated each borderline fix as a valid reason to push another round.
2. The cap rule had no hard guidance for the specific failure mode "every round keeps catching real bugs" — only for "Copilot is flip-flopping / re-raising skips." Real bugs kept surfacing because round N's fix introduced round N+1's bug.
3. No in-rule language treated the aggregate pattern as the anti-pattern. Each individual fix looked reasonable in isolation.

**Fix applied:**

- Tightened the cap in `.cursor/rules/git-pr-workflow.mdc` from 5 → 3 iterations.
- Renamed the section "Round cap — 3 iterations" and updated all cross-references (decision-list step 2, Unified Checklist row 5).
- Added explicit language naming the rationalisation-driven loop as the anti-pattern: "each individual fix looks reasonable in isolation; the aggregate is the anti-pattern."
- Added the exact quote from PR #677 to anchor future "just one more fix" rationalisations to Phil's specific directive.
- Clarified what happens at the cap: hand off to Phil for explicit sign-off on round 4, OR merge as-is with deferrals to a follow-up PR, OR resolve with documented reasoning. No silent round extension.

**Rule to reinforce:**

- The cap is 3 rounds. The agent does NOT extend it on its own judgment, regardless of how small the remaining fix looks. "It's just a 1-line fix" is exactly the reasoning that produced rounds 4–7 on PR #677.
- When past round 3 and about to push "just one more fix", STOP and hand off to Phil instead.

---

### 2026-04-17 | PR #682 | ci/automation — metrics-silent-fail

**What Phil caught:**

After PR #677's merge, the `track-copilot-rounds.yml` workflow failed with `GH006: Protected branch update failed for refs/heads/dev`. Investigation showed the workflow had been silently failing on every merge since branch protection on `dev` was tightened to require status checks — the previous PR #672 merge had the same failure. Two downstream effects: (1) the Copilot rounds metric file and dashboard had not been updating, (2) the `Open or update retro follow-up issue` step was SKIPPED on every run because it was sequenced AFTER the failing push step (default `if: success()` behavior) — so the forcing-function retro issue for PR #677 was never created either.

**Root cause:**

1. The workflow used `git push origin dev` directly. That worked when branch protection was looser. When protection was tightened to require 2 status checks and disallow direct pushes, the workflow's `github-actions[bot]` token no longer had the permissions to push — but nothing in the workflow surfaced that. The failure happened on the `dev`-context post-merge run, long after the agent had moved on from the feature PR, so no human noticed.
2. Step ordering placed the retro-issue step AFTER the push step. Because `set -e` + default step chaining fails the job at the push step, the retro-issue step never ran. The two outputs (metric record + retro issue) were coupled when they should be independent.
3. No regression guard existed to catch "workflow runs to completion but half of its side effects failed." `conclusion: failure` on the post-merge workflow was visible in the Actions UI but not surfaced into the agent's session-start checklist.

**Fix applied:**

1. Reordered `track-copilot-rounds.yml`: the retro-issue step now runs BEFORE the metrics commit step, so the forcing-function issue is always created regardless of whether the commit lands.
2. Replaced the direct `git push origin dev` with `peter-evans/create-pull-request@v7`, which opens a small auto-PR labeled `metrics-auto` + `chore`. The PR auto-merges via `gh pr merge --squash --auto` as soon as CI is green. This respects branch protection and eliminates the silent-push failure class entirely.
3. Added a recursion guard: the workflow's job-level `if:` skips when the merged PR's `head.ref` starts with `metrics-auto/`. Without this guard, every metrics auto-PR merge would trigger another metrics run.
4. Added explanatory comments at the top of the workflow naming the `GH006` failure mode and referencing this LEARNINGS entry, so the next reader sees the "why" of the auto-PR pattern immediately.

**Rule to reinforce (added to `project-prompt.mdc` Pre-Push Self-Check):**

| Writing... | Check for... |
|-----|----|
| Any GitHub Actions workflow that calls `git push` to a protected branch (`dev` or `main`) | Direct push will fail silently (GH006) under branch protection. Use `peter-evans/create-pull-request@v7` + `gh pr merge --squash --auto` instead. The repo's `dev` and `main` branches require PRs + status checks — a workflow `github-actions[bot]` token has no bypass. |
| Any GitHub Actions workflow with multiple side effects (creates issue AND pushes commit AND posts comment) | Order so the **most important** side effect runs FIRST. Independent side effects should not chain under `set -e` such that one failure silently prevents the others. If they must be sequenced, gate the later ones with `if: always()` or `if: success() || failure()`. |

---

### 2026-04-17 | PR #677 | session retrospective — github-api/silent-drift

**What Phil caught:**

Copilot stopped auto-reviewing new pushes to PR #677 partway through the session. Phil's exact words: *"it's not kicking off a copilot code review with every commit you push to the PR to fix existing copilot comments from the current round. I have been doing that manually for the past two deploys and I just haven't told you yet. That is becoming an issue for sure."* He'd been quietly clicking the UI sync icon to make the feedback loop move.

**Root cause:**

GitHub silently changed the behavior of `POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` with `reviewers[]=copilot` sometime between PR #672's merge and PR #677's first round. The REST call still returns `200 OK` and a well-formed PR body — but it **does not add Copilot** to `requested_reviewers` and **does not trigger a review**. Evidence:

- PR #672 (earlier today): every `copilot-review.yml` run → Copilot reviewed within 4–9 min. 5 rounds, 5 reviews, clean pattern.
- PR #677 commit `3f02567`: `copilot-review.yml` ran at 23:54:34, completed `success`, the REST call returned 200 — **no review, 25+ minutes later**.
- `gh api repos/.../pulls/677/requested_reviewers` afterwards returned `{"users":[]}` — confirming Copilot was never added despite the 200 OK.
- Ran `gh pr edit 677 --add-reviewer "@copilot"` (gh v2.90) locally: `requested_reviewers` immediately showed `["Copilot"]`, and Copilot submitted a review on `18aded2` within 3.5 minutes.

The new gh CLI goes through the GraphQL `requestReviews` mutation (confirmed via `GH_DEBUG=api` trace). The GraphQL path works; the REST path is dead. This matches the GitHub Community feature-request discussion [#186152](https://github.com/orgs/community/discussions/186152) (no public REST/GraphQL API to programmatically trigger Copilot re-review) — the framing there is about re-review, but the underlying issue is the REST endpoint no-oping for Copilot specifically.

**What the initial investigation got wrong:**

My first instinct was "GitHub has no API for this, we have to settle for UI clicks or one-round-per-PR." That was wrong. The mechanism does exist — it's just on a different endpoint (GraphQL mutation) than the one our workflow was using. If I'd read the deeper trace output from `gh pr edit` before concluding, I'd have seen the GraphQL path immediately. Lesson: when a documented API silently misbehaves, don't stop at "it's broken" — check whether newer CLI commands use a different endpoint under the hood.

**Fix applied (this PR):**

1. `copilot-review.yml` now uses `gh pr edit --add-reviewer "@copilot"` (GraphQL-backed) instead of the dead REST call. `ubuntu-latest` ships gh 2.89+ so no runner upgrade needed.
2. Regression test `__tests__/unit/copilot-review-workflow-command.unit.test.ts` asserts the workflow uses the new CLI command AND does NOT call the old `gh api ... requested_reviewers ... reviewers[]=copilot` pattern. Strips YAML comments before matching so docs/comments can still reference the dead endpoint.
3. `.cursor/rules/git-pr-workflow.mdc` "Copilot Auto-Review Setup" section rewritten — the workflow is now primary, the ruleset is belt-and-suspenders (observed to miss pushes).
4. `.cursor/rules/project-prompt.mdc` Pre-Push Self-Check — new row flags any new invocation of the dead REST pattern.

**Rule to reinforce — don't trust 200 OK as "it worked":**

For any side-effect API call (creating, updating, requesting), the agent confirms the side effect happened, not just that the HTTP call returned. For this specific pattern: after requesting a reviewer, read back `requested_reviewers` to confirm the user/bot is listed. "200 OK" from GitHub's REST API can silently mean "we accepted your request and did nothing with it" — especially around bot reviewers where the mechanism recently moved to GraphQL.

Added to Pre-Push Self-Check: any code that adds a reviewer via API must, in the same call sequence, read back `requested_reviewers` and assert the expected identity appears. Applies to workflows, scripts, and ad-hoc agent actions.

**Related — this is a textbook "rule claimed a thing that wasn't tested":**

The `git-pr-workflow.mdc` file said GITHUB_TOKEN works for the explicit re-request via REST. That claim was true when written. It silently drifted. No test caught the drift. The regression test added here closes that specific hole; the general pattern (rule-documented mechanism silently breaking) remains an open risk for other rules — potential future work: a periodic smoke test that exercises the mechanisms our rules claim exist.

---

### 2026-04-17 | PR #677 | session retrospective — process/automation-first

**What Phil caught:**

PR #677 was itself a retrospective PR distilling the 26 Copilot comments from PR #672 into themed entries and new Pre-Push rules. But the *triggering* was manual — Phil had to prompt ("yeah do that") for the retro to happen at all. His direct feedback: *"as part of this commit I need something in place so I don't have to babysit this. the process should be including this follow-up documentation automatically."*

**Root cause:**

When PR #672 shipped the metrics dashboard (measurement), the plan stopped at "visibility." The agent treated "after every rounds >= 2 PR, open a retro" as a procedural rule to be followed next session — but procedural rules only land if someone remembers to invoke them. The work wasn't automation-complete until the trigger was also automated.

This is a general-purpose failure mode: **every process rule the agent writes into `.cursor/rules/` is load-bearing on agent memory and Phil's prompting. If the rule can be mechanically detected and kicked off by a workflow, it must be.** Measurement without a forcing function isn't self-improvement — it's a nicer place to park the babysitting.

**Fix applied (in this same PR):**

Extended `.github/workflows/track-copilot-rounds.yml` with a final step that opens (or updates, if re-run) a GitHub Issue labeled `agent-action-required` + `copilot-retro` whenever the merged PR had `rounds >= 2`. The issue body contains the metric stats, category breakdown, and a per-Copilot-comment checkbox list (with `path:line` anchors) pre-rendered from the GraphQL data the workflow already fetches. Dedup is by title-search; re-runs update the issue in place rather than creating duplicates.

Session-start (`.cursor/rules/project-prompt.mdc`) already scans `agent-action-required` issues as decision-step 2. Added a sub-bullet so the agent knows the specific handling for a `copilot-retro`-labeled issue: open a retro PR (themed LEARNINGS + new Pre-Push rows + any testable guard) before starting new feature work, and close the issue via `Closes #<n>`.

Skip rules are explicit: `rounds < 2` (clean merges don't need a retro), Dependabot PRs, release PRs. Labels are created idempotently so the first run in a fresh repo clone still works.

**Rule to reinforce — automation-first:**

Added to `.cursor/rules/project-prompt.mdc` Pre-Push Self-Check. When proposing a new process rule, the agent asks three questions before writing it into `.cursor/rules/`:
1. Can a workflow detect the trigger mechanically (a merge event, a file change, a label)? If yes, the rule must be a workflow first and a human-readable rule second.
2. Does the rule require agent memory of "last session we did X"? If yes, it needs an automated forcing function (an issue, a check, a failing test) that surfaces itself to the next session regardless of memory.
3. Would Phil have to prompt the agent to invoke this rule? If yes, the rule isn't done — the invocation must be automatic.

If all three answers are "no" (rule is purely about in-flight code, not process), a `.cursor/rules/` entry alone is sufficient. Otherwise, the rule ships with its workflow.

**Related:**

The same principle retroactively applies to several existing process rules in this repo (e.g. "prune merged rows from `ACTIVE_BRANCHES.md`"). Next time one of those slips, the fix is a workflow, not a reminder — and that becomes its own retro entry.

---

### 2026-04-20 | PR #672 | github-actions/paths-ignore

**What Copilot caught (1 comment, round 3):**

The new `track-copilot-rounds.yml` workflow pushes a docs-only commit to `dev` after every merged PR (to append the metric record + regenerate the dashboard). The repo's `deploy.yml` triggers on **any** push to `dev`, so every merge was going to fire a full deploy twice — once for the merge commit, once for the metrics commit — doubling CI + Railway load and silently undoing the ~50% deploy-time cuts shipped in PR #664. Copilot flagged this on round 3 (*"this will undermine the deploy-cut effort"*).

**Root cause:**

The agent added a self-committing workflow without auditing every other workflow that reacts to the same branch. The mental model was "add the workflow, check *its* behaviour" — not "check what *other* triggers become live when this workflow lands." `deploy.yml` had never needed `paths-ignore` before because no prior workflow auto-committed to `dev`; introducing the auto-commit implicitly changed deploy.yml's effective trigger surface without editing the file.

**Fix applied:**

Added `paths-ignore` to `deploy.yml`'s `on.push` block:
```yaml
on:
  push:
    branches: [main, dev]
    paths-ignore:
      - 'docs/COPILOT_ROUNDS_METRICS.jsonl'
      - 'docs/agent-context/copilot-rounds-dashboard.md'
```
GitHub's `paths-ignore` semantics: a commit is ignored only when **every** changed file matches — so a normal merge that happens to also touch these files (e.g. a PR that edits the metric schema) still deploys correctly. Pure metrics-bot commits are skipped.

Also added `__tests__/unit/deploy-workflow-paths-ignore.unit.test.ts` asserting both paths are present under `paths-ignore` — so a future edit that removes them fails `npm run test:unit` locally and in CI before the regression can reach `dev`.

**Rule to reinforce:** Any new GitHub Actions workflow that auto-commits or auto-pushes to `dev`/`main` (metrics loggers, doc regenerators, lockfile bumpers, etc.) must add `paths-ignore` entries in `deploy.yml` (and any other path-sensitive workflow) covering every file it commits. Added to the Pre-Push Self-Check table in `project-prompt.mdc`. Alternative pattern: have the workflow upload a build artifact or open a PR instead of committing directly — preferred for anything that doesn't need to land on `dev` within seconds of merge.

---

### 2026-04-20 | PR #672 | graphql/pagination-discipline

**What Copilot caught (4 comments across rounds 1–2):**

1. `reviewThreads { comments(first: 1) }` — fetched only the first Copilot comment per thread, silently undercounting whenever a thread had multiple back-and-forth Copilot comments. Since this was the workflow that classifies Copilot comments, the undercount would cascade into every downstream metric.
2. `reviewThreads` pagination loop captured `totalCount` but never asserted it matched the number of fetched threads — if pagination stopped early (including the 20-page safety cap), the workflow recorded partial metrics with no warning.
3. `reviewThreads` pagination safety cap just printed a warning and continued with partial data instead of failing loudly.
4. `reviews(first: 100)` had no `totalCount` / pagination guard at all — any PR with >100 Copilot reviews would silently undercount rounds and comments.

**Root cause:**

The existing Pre-Push Self-Check row *"Any GraphQL query with `first: N` → always fetch `totalCount`; block or paginate if `totalCount >= N`"* was applied only to the top-level connection. The agent treated nested connections (`comments` under `reviewThreads`) as "first: N doesn't matter because the caller only needs one" — without auditing whether that assumption actually held. And `reviews(first: 100)` was mentally categorised as "sibling to reviewThreads, same page size, same safety" — but the rule was never executed on the sibling.

**Fix applied:**

- Changed `comments(first: 1)` → `comments(first: 50)` with an inline constant.
- After pagination completes, assert `len(all_threads) == total` and `sys.exit(1)` on mismatch.
- Pagination safety cap now `sys.exit(1)` with a stderr error message — no more silent partial metrics.
- Added `totalCount` to the `reviews` query and a matching loud-fail check: if `reviews_total > len(fetched)`, the workflow exits non-zero before appending a potentially-incomplete record.

**Rule to reinforce:** The GraphQL `first: N` rule applies to **every** connection field in a query — top-level and nested (`comments`, `reactions`, `timelineItems`, etc.). Audit every `first: N` in a query individually, not the query as a whole. And any pagination safety cap in an append-only metrics pipeline must fail loudly, not silently skip — better to miss the record and alert than to record garbage. Pre-Push Self-Check row for GraphQL connections has been extended accordingly.

---

### 2026-04-20 | PR #672 | copilot-identity/matching

**What Copilot caught (2 comments across rounds 3–4):**

1. The classifier's `COPILOT_LOGINS` check was hard-coded to a single string (`copilot-pull-request-reviewer`). Elsewhere in the repo (`.github/workflows/copilot-implement-suggestions.yml`), Copilot reviews are also matched against `github-copilot[bot]`, `copilot`, and `copilot-pull-request-reviewer[bot]`. If the login differs from the hard-coded string, every metric for that PR would drop to zero with no warning.
2. The query collected Copilot comments only from `reviewThreads.comments` — it ignored review-level body comments on the `reviews` node. Copilot often leaves a top-level review body ("Copilot reviewed N files and generated X comments…") as well as thread comments, and those bodies can themselves contain actionable content. Missing them undercounts `total_comments` / `preventable_ratio`.

**Root cause:**

The agent copied the first Copilot login string it saw in GitHub's API response on a single test PR, without cross-referencing other workflows in the same repo that had already encoded the full known set. And the data model was `reviewThreads → comments → body` — the agent never asked "does the `reviews` node itself carry content we care about?" The answer: yes, `reviews.body` can be non-empty for Copilot reviews.

**Fix applied:**

- Expanded `COPILOT_LOGINS` to the shared set: `{copilot, copilot-pull-request-reviewer, copilot-pull-request-reviewer[bot], github-copilot[bot]}`.
- Added `reviews.body` to the GraphQL query and merged non-empty, Copilot-authored review bodies into `copilot_comments` with `submittedAt` as the timestamp.

**Rule to reinforce:** Any code that checks for the Copilot bot identity must match against the full known set, not a single literal. Added to the Pre-Push Self-Check. When modelling review data from the GitHub API, fetch both `reviews.body` (review-level) AND `reviewThreads.comments[].body` (thread-level) — they're distinct surfaces and Copilot uses both.

---

### 2026-04-20 | PR #672 | markdown/sanitization

**What Copilot caught (6 comments across rounds 1–5):**

1. Round 1 (2 comments): novel-comment snippets were written verbatim into the dashboard bullets. Snippets containing `` ``` `` opened a code fence mid-line and broke every bullet that followed. The very first generated dashboard already had a stray fence visible.
2. Round 2: the round-1 fix replaced `` ``` `` with `` ` `` + zero-width space + `` ` `` + zero-width space + `` ` `` — which still opened/closed inline-code spans unpredictably and rendered as visible `​`​` fragments.
3. Round 3: novel snippets were truncated with `body[:200]` but no ellipsis was appended, so dashboard bullets ended mid-word with no indication they were cut.
4. Round 4 (2 comments): the round-2 fix replaced `` ``` `` with the literal token `[code block]`, but without padding. So `` ```suggestion `` collapsed to `[code block]suggestion` — unreadable. And the initially-seeded JSONL backfill entries still had their truncated snippets without ellipsis.
5. Round 5: PR titles were inserted directly into a Markdown table row without escaping `|`, `` ` ``, or `\`. A title containing any of those would break the table.

**Root cause:**

Every one of these was "I wrote the happy-path sanitization and shipped the dashboard without rendering it and *visually reading the output*." Each Copilot round forced the agent to actually look at the rendered Markdown, and each round surfaced an adversarial-input case the original `sanitize_snippet` didn't cover. The root pattern: **sanitization that's only unit-tested against its own success case will miss what the sanitizer is supposed to prevent**.

**Fix applied (final form):**

```python
def sanitize_snippet(snippet: str, max_len: int = 200) -> str:
    if not snippet:
        return ""
    s = re.sub(r"\s+", " ", snippet).strip()
    s = re.sub(r"`{3,}", " [code block] ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > max_len:
        s = s[: max_len - 1].rstrip() + "\u2026"
    return s
```
- `[code block]` is padded on both sides and whitespace is re-collapsed — so `` ```suggestion `` becomes `[code block] suggestion`, not `[code block]suggestion`.
- Truncation always appends `\u2026` (…) so the cut is visible.
- PR titles now go through the same shape: collapse whitespace → truncate-with-ellipsis → escape `\`, `|`, `` ` ``.
- The JSONL backfill was repaired via a Python script so historical entries match the forward-going format.
- Snippet-level truncation in the workflow itself also appends `\u2026` — the sanitizer is now idempotent, not something that depends on upstream truncation being clean.

**Rule to reinforce:** Any user-supplied or externally-sourced string rendered into a Markdown artefact (table row, bullet, heading, code block content) must go through a sanitizer that: (a) collapses whitespace, (b) escapes `|`, `` ` ``, `\` for table contexts, (c) replaces runs of 3+ backticks with a padded plain-text token, (d) truncates with an ellipsis. **Always render the Markdown and visually inspect the output before committing** — don't trust the sanitizer unit tests alone. Added to the Pre-Push Self-Check table.

---

### 2026-04-20 | PR #672 | python-io/explicit-utf8

**What Copilot caught (2 comments, round 1):**

`scripts/render-copilot-dashboard.py` used `jsonl_path.read_text()` and `md_path.write_text(md)` with no `encoding` argument. On Python 3.11+, `read_text()` defaults to the platform's locale-preferred encoding (usually UTF-8 on Linux CI, but not guaranteed on Windows / macOS with non-UTF-8 locales). The dashboard emits UTF-8 characters (`↓`, `↑`, `→`, curly quotes from Copilot comments, `\u2026`), and the JSONL already contains them. Silent `UnicodeDecodeError` / `UnicodeEncodeError` would have been possible on any runner with a non-UTF-8 default locale.

**Root cause:**

Relied on "Linux CI is always UTF-8" — which is true *today* on `ubuntu-latest`, but isn't part of Python's contract. The implicit default is fragile and the fix is a 17-character diff per call site.

**Fix applied:**

```python
data = jsonl_path.read_text(encoding="utf-8")
md_path.write_text(md, encoding="utf-8")
```

**Rule to reinforce:** Any Python file I/O in a workflow script or automation (`read_text`, `write_text`, `open`) must pass `encoding="utf-8"` explicitly. Never rely on platform default encoding for anything that will run on CI — the cost of the explicit arg is trivial and the failure mode is silent data corruption. Added to the Pre-Push Self-Check.

---

### 2026-04-20 | PR #672 | github-actions/concurrency-scope

**What Copilot caught (1 comment, round 1):**

The initial workflow keyed `concurrency.group` to `track-copilot-rounds-${{ github.event.pull_request.number }}`. That's per-PR, so two PRs merging into `dev` within a few minutes of each other would each spawn their own workflow run. Both would then race to `git pull → write file → commit → push` against the same two files on `dev`, producing non-fast-forward push failures and silent drops of metric records.

**Root cause:**

Reflex-copied the per-PR concurrency pattern from feature-branch workflows (where per-PR scoping is correct because each PR owns its own branch). But this workflow writes to a **shared** branch (`dev`) — the relevant contention axis is "who else is writing to `dev`", not "who else is processing this specific PR".

**Fix applied:**

```yaml
concurrency:
  group: track-copilot-rounds-dev
  cancel-in-progress: false
```
Single shared group forces serialization: PR 1's run completes its push before PR 2's run starts, so each metric record lands cleanly.

**Rule to reinforce:** In any workflow whose critical section writes to a **shared** branch (not the PR's own branch), scope `concurrency.group` to the push target, not to `${{ github.event.pull_request.number }}`. Per-PR grouping allows concurrent runs that race over the same files. Added to the Pre-Push Self-Check.

---

### 2026-04-20 | PR #672 | docs/consistency-across-sections

**What Copilot caught (3 comments across rounds 1–3):**

1. Round 1: The new "Release-PR exception" section in `git-pr-workflow.mdc` said release PRs must be merged with `gh pr merge --merge` (not `--squash`). But the Unified Checklist section immediately above still said "auto-merge uses `gh pr merge --squash --auto` once all 8 steps pass" — with no carve-out. Any agent reading top-to-bottom would have contradictory instructions.
2. Round 2: The follow-up fix added a carve-out note, but the preceding sentence still read *"Only after all 8 steps pass"* — internally inconsistent with the exception that drops steps 4/5/7 for release PRs.
3. Round 3: A new `**Step 4 — Surface the Copilot rounds trend**` heading was added to `project-prompt.mdc`, but the file already had `# Step 4: Check the latest dev deploy status` earlier in the same section. Two different "Step 4"s produced an ambiguous session-start procedure.

**Root cause:**

Three variants of the same mistake: **when adding an exception / override / addition to an existing procedure, the agent only edited the block being changed — without re-reading the surrounding 50–100 lines to see whether any adjacent language now contradicts the new block**. Cross-section consistency is an easy-to-miss failure mode because each section passes its own isolated review.

**Fix applied:**

- Added a merge-command exception note immediately under the Unified Checklist pointing to the full rationale in Merge Strategy.
- Reworded *"Only after all 8 steps pass"* → *"Only after all required steps pass"* with an inline qualifier that "required" means all 8 for non-release PRs and refers to the exception for release PRs.
- Renamed the new duplicate "Step 4" to a non-numeric **"Additional check — Surface the Copilot rounds trend"** with an inline explanation of the naming choice.

**Rule to reinforce:** When editing a `.cursor/rules/*.mdc` or `docs/**/*.md` file, after the edit, run `grep -n "<key phrase from the adjacent block>" <file>` to find every nearby reference to the procedure being changed, and verify each one is still consistent with the new block. Before adding a numbered step, `grep -n "Step [0-9]" <file>` in the surrounding section — if the number already exists, use a non-numeric heading instead. Added to the Pre-Push Self-Check.

---

### 2026-04-20 | PR #672 | docs/claims-match-reality

**What Copilot caught (2 comments across rounds 1–2):**

1. Round 1: The PR description and test plan claimed the dashboard renders with a `_Last updated_` line — but the renderer didn't emit one. Copilot noticed the mismatch between the PR body and the actual generated output.
2. Round 2: A code comment inside `track-copilot-rounds.yml` said "see `scripts/render-copilot-dashboard.py` for how to run the classifier locally" — but the classifier (`CATEGORY_PATTERNS` + `classify()`) lives inline in the workflow's embedded Python block, not in the renderer script. The renderer script only does Markdown generation, not classification.

**Root cause:**

In both cases the PR was drafted while the implementation was still in flux, and the PR body / code comments weren't re-read against the final artefacts. PR descriptions and inline "see X" references are easy to leave stale because they're not code — they don't compile, don't run in CI, and Copilot is one of the few reviewers who cross-checks them.

**Fix applied:**

- Added a deterministic `_Last updated: YYYY-MM-DD_` line to the renderer, derived from the most recent record's `merged_at` timestamp (so the value is stable across re-runs over the same data, not wall-clock dependent).
- Corrected the classifier-location comment to accurately describe that the classifier lives in the embedded `<<'PY'` block, not in the renderer.

**Rule to reinforce:** Before opening a PR that ships a generated artefact (dashboard, docs, config), diff the PR body / test plan against the actual generated output. Every claim of the form "the dashboard renders X" or "see file Y for Z" must be verifiable against the files in the diff. Also audit `# see ...` / `// see ...` comments added during the PR — when code moves during iteration, those references quietly go stale.

---

### 2026-04-20 | PR #672 | code-hygiene/dead-code-and-type-hints

**What Copilot caught (4 small comments, rounds 2 + 5):**

1. Round 2: `track-copilot-rounds.yml` wrote `record_path=/tmp/metric_record.json` to `$GITHUB_OUTPUT`, but no later step referenced `steps.collect.outputs.record_path`. The path is also constant and already referenced directly elsewhere.
2. Round 2: The same PR also fixed a separate dead `$GITHUB_OUTPUT` write carried over from earlier in `deploy.yml` (one of the three deferred items from PR #664).
3. Round 5: `trend_arrow()` in `render-copilot-dashboard.py` was typed as `list[float]` but the docstring/implementation explicitly handled `None` (missing preventable-ratio values). Misleading type hint.
4. Round 5: The embedded Python block imported `datetime` and `Path` but used neither after the `_Last updated_` refactor moved date handling to the renderer side. Dead imports.

**Root cause:**

Dead `$GITHUB_OUTPUT` writes and unused imports are classic iteration-artefacts: an earlier draft needed them, a later refactor removed the consumer, and the producer side was left in. Type hints drift when `None` handling is added to a function that was originally non-nullable — the body changes, the annotation doesn't.

**Fix applied:**

Removed all four dead items. Updated `trend_arrow` annotation to `list[float | None]`.

**Rule to reinforce:** When refactoring a workflow step or Python function, audit both ends of every output/import/type-annotation pair — if the producer's output is no longer consumed, remove the producer; if a function now accepts `None`, widen its type annotation. ESLint / Ruff / mypy would catch most of these; keep those linters in the CI path. No new Pre-Push row — these are existing lint-class issues that just weren't being caught in pre-commit locally.

---

### 2026-04-20 | PR #672 | docs/active-branches-status (repeat from #650, #656)

**What Copilot caught (1 comment, round 1):**

The `docs/ACTIVE_BRANCHES.md` row for this branch was still `pushed, awaiting local verify` after the PR was opened. The file's own legend defines that status as "not yet pushed." Copilot flagged this — same catch as on PR #650 and PR #656.

**Root cause:**

Third time this has happened (PR #650, #656, #672). The agent registers the branch with `pushed, awaiting local verify` status before pushing (correct at that moment), then opens the PR and moves on — without going back to update the row to `PR open #N`. Existing rule is in place; the agent just doesn't execute it consistently.

**Fix applied:**

Updated the row to `PR open #672` in the same commit cycle as the PR-open.

**Rule to reinforce:** This is now a three-strike repeat. Escalating the enforcement language in the Pre-Push Self-Check row for ACTIVE_BRANCHES status — tied directly to the `gh pr create` step. No new rule needed, but the existing rule is being re-emphasized in this log entry as a pattern recognition anchor.

---

### 2026-04-20 | PR #664 | copilot/review-triggers

**What Copilot caught:** Not a Copilot catch — a process gap discovered while running PR #664's own feedback loop. After round-2 comments were fixed and pushed, the `review_on_push` ruleset did not fire a round-3 review, and an empty trigger commit also failed to nudge Copilot. This meant the Unified Checklist step 4 ("Copilot has reviewed the latest commit") could never be verified, even with everything addressed.

**Root cause:** `review_on_push` de-duplicates after Copilot's first review of a given PR. Empirically: PR open fires reliably, and one subsequent empty-commit trigger fired round 2, but after that Copilot went silent regardless of push type. The rule as originally written treated `review_on_push` as "fires on every push," which is not how it behaves.

**Fix applied:** Added an explicit re-request step required after every code-change push:
```bash
gh api --method POST \
  repos/cp-build-dev-ops/command-center-reboot/pulls/<PR_NUMBER>/requested_reviewers \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```
The `[bot]` suffix on the login is mandatory — without it the API returns 422 "not a collaborator." The call must be made from the agent's local `gh` (user token); `GITHUB_TOKEN` in workflows returns 200 OK but Copilot silently ignores it.

**Rule to reinforce:** After any push of **reviewable content** (source code, tests, GitHub Actions workflows, `.cursor/rules/*.mdc`, `docs/**/*.md`, config — anything Copilot can meaningfully re-read) on an open PR, explicitly re-request Copilot review. Skip the re-request only for truly non-reviewable commits: empty / whitespace-only / lone version-bump. **Docs and rule changes do warrant a re-request** — Copilot catches real bugs in `.mdc` rules and in `docs/*.md` (PR #664 is itself an example: multiple rule-file contradictions were caught across rounds). Documented in `.cursor/rules/git-pr-workflow.mdc` (Unified Checklist step 4 + "Copilot Auto-Review Setup" + feedback-loop diagram) and in the Pre-Push Self-Check table in `project-prompt.mdc`.

---

### 2026-04-20 | PR #665 | session retrospective — release-PR Copilot review is redundant work

**Context:**

After merging PR #664 to `dev` (which introduced the "every PR runs the full Copilot loop before merge — no exceptions" rule) and promoting to prod via PR #670, Phil asked: "do we need to do a Copilot review in a prod PR after all we did to verify in dev?"

**What was off:**

The newly-tightened rule from PR #664 — "every PR must have a Copilot review before merge, no exceptions" — was written to guarantee feature PRs don't slip to `dev` with preventable issues. But it was applied uniformly to **release PRs** (dev → main) too, which created redundant work: the content in a release PR is exactly the content Copilot already reviewed on the feature PR, already looped-to-zero, already landed on `dev`, already deployed to dev, already verified healthy, already manually verified by Phil. Re-reviewing it on the release PR adds 2–3 min per release for effectively zero new signal — Copilot either re-flags things it already approved, or comments on the mechanical `chore: bump version` diff.

**Root cause:**

The rule was written before the feature-PR loop had been tightened to guarantee zero unresolved Copilot comments at merge. Under the old regime, re-checking on the release PR made sense as a safety net. Under the new loop-to-zero regime, that safety net has been moved to the feature PR itself and the release PR's Copilot step is second-check-on-a-first-check.

**Rule to reinforce:** Release PRs — narrowly defined as PRs targeting `main` from `release/to-prod` that contain only merge commits from previously-reviewed feature PRs plus at most one `chore: bump version` commit — are exempt from Unified Checklist steps 4 (Copilot has reviewed the latest code-change commit), 5 (loop to exit condition), and 7 (LEARNINGS entry for implemented comments). Steps 1, 2, 3, 6, 8 remain mandatory (approval, branch current, CI green, threads resolved, no conflicts). The agent still runs the pre-release audit (`git diff origin/main...origin/dev --name-only`, `git log origin/dev..origin/main --oneline`) before opening the release PR — if either surfaces unexpected content, the exception is waived for that specific release and the full checklist runs. Merge command remains `gh pr merge <N> --merge` (NEVER `--squash` for dev→main — see Merge Strategy in Production Deployment section).

Documented in `.cursor/rules/git-pr-workflow.mdc` under "Release-PR exception" in the Unified Checklist section, with a cross-reference in the "Every PR must run the full Copilot feedback loop" text.

---

### 2026-04-20 | PR C (feat/deploy-cuts-and-review-rule) | session retrospective — unifying PR tiers under one feedback loop

**Context:**

Phil directed a two-part change in a single session: (1) tighten the Copilot review rule so every PR — not just security PRs — runs the full feedback loop after every push, and (2) cut deploy time roughly in half by parallelizing `build` with tests and adding Next.js/Playwright caches. The review-rule change was proposed after PR #656, where Copilot caught four genuinely useful comments (i18n string, console.log, test assertion, stale ACTIVE_BRANCHES row) that the medium-risk tier's "read once, use judgment" model would not have guaranteed catching on the next push round.

**What changed in `.cursor/rules/git-pr-workflow.mdc`:**

- Unified the Standard / Medium-risk / Security tier checklists into a single 8-step "Unified PR Ready Checklist." The loop is mandatory for every tier; tier only affects the decision framework's default (Security defaults to "implement"; others use the standard framework).
- Added a **5-round cap** with explicit counting rules: a round only counts when Copilot posts net-new comments (re-raised skips do not count). Cap triggers a handoff to Phil, not a silent skip.
- Tightened skip reasoning to four approved patterns with verbatim quoting required — no free-form skips. If a comment doesn't fit one of the four patterns, it must be implemented.
- Updated the feedback-loop matrix so all three columns read "Yes" for "Must run full serialized feedback loop?"

**Why this is worth the extra ~3–8 min per PR:**

Time budget: dev deploy goes from ~13m to ~7m in the same PR via the parallelization + caching work. Net PR-to-dev time stays roughly flat or improves, and the quality floor goes up. Phil's framing was explicit: "that may add a bit more time but at least we can ensure that even better quality code is released with every PR."

**Rule to reinforce:**

- Every agent session, when opening a PR of any tier, run the loop until one of the three exit conditions is met — zero net-new comments, every net-new comment fixed-or-skipped-with-valid-reason, or 5-round cap + Phil sign-off. No tier bypass.
- When a Copilot comment is ambiguous, default to implementing it unless the skip fits verbatim into one of the four approved patterns. "Seems fine" is not a skip reason.
- Never reset the round counter by force-pushing or rebasing mid-loop. The cap is measured from the first Copilot review after PR open; it only resets when the PR merges.

---

### 2026-04-20 | PR #656 | session retrospective — auto-merge ordering

**What went wrong:**

I enabled `gh pr merge --auto --squash` on PR #656 the moment the PR opened, before Copilot had reviewed. I then monitored CI passively and only checked the review threads when Phil explicitly asked "have those been addressed yet?" — ~7 minutes after Copilot had posted. The review contained four valid, actionable comments (hardcoded i18n string, leftover console.log, missing test assertion, stale ACTIVE_BRANCHES status).

**Why it didn't actually fail:**

The repo has `required_conversation_resolution: true` at the branch protection layer. Unresolved review threads block merge regardless of PR tier. So `--auto` stayed in `BLOCKED` state and no unreviewed merge could have happened. But the PR would have sat indefinitely until a human noticed, which is exactly what happened when Phil asked.

**Root cause:**

Confused "auto-merge is safe to enable early because the rails will catch it" with "auto-merge is the right mechanism to use before the review loop completes." The rails are a defense-in-depth safety net, not a substitute for actively driving the Copilot loop. The agent's job is to process the review, fix/skip each comment with documented reasoning, resolve the threads, and *then* enable auto-merge.

**Rule to reinforce:**

- Never enable `gh pr merge --auto` until the Copilot review loop has been processed once: (a) review has landed or an empty commit has been pushed to trigger it, (b) every comment is addressed in code or documented as a skip, (c) all threads are resolved via `resolveReviewThread`. Only then arm auto-merge.
- The `required_conversation_resolution: true` rail is a safety net, not a trigger — do not lean on it to gate auto-merge ordering.
- If CI is already running when the PR opens, that's fine — auto-merge can be enabled *after* the review loop runs. CI running in parallel doesn't require auto-merge to be armed early.

---

### 2026-04-20 | PR #656 | i18n, testing, logging, documentation

**What Copilot caught (4 implemented):**

1. `components/DashboardActivityLog.tsx:1213` — `throw new Error("Server returned an empty response.")` in the export path. The thrown message flows into `exportErrorMsg` and renders in the dialog, so it is user-visible — but it was hardcoded English. Added `exportEmptyResponse` key to both `messages/en.json` and `messages/es.json` and threw via `t("exportEmptyResponse")`.
2. `components/DashboardActivityLog.tsx:1217` — a diagnostic `console.log(...)` was left in the successful-export path from when I was triaging the "PDF generated but no file on disk" bug. Harmless but pollutes end-user console on every export. Removed.
3. `__tests__/unit/DashboardActivityLog.unit.test.tsx:712` — the new octet-stream regression test indexed `createObjectURL.mock.calls[0][0]` without first asserting `createObjectURL` had been called. If the component ever regressed (e.g. an early return before the download anchor was built), the test would throw `Cannot read properties of undefined` instead of a clear "expected toHaveBeenCalled" failure. Added `expect(createObjectURL).toHaveBeenCalledTimes(1)` before indexing.
4. `docs/ACTIVE_BRANCHES.md:32` — the row still said `pushed, awaiting local verify` after the PR was opened. Same catch as #650. Updated to `PR open #656`.

**Root cause:**

1. Error strings thrown from catch-then-render paths are easy to miss in an i18n audit because the `toast("...")` / `t(...)` pattern is what catches the eye — not `throw new Error("...")`. When the string is destined for `exportErrorMsg` (or any UI-rendered error slot), the same i18n rule applies. The pre-PR audit grep looks for `toast("...[A-Z]`, `aria-label=`, `placeholder=` — it does not look for `throw new Error("...")` with a user-visible message. Worth widening the grep.
2. Console.logs added during triage should always have a TODO/remove comment, or be gated with `if (process.env.NODE_ENV !== "production")`. Leaving them in final commits is a common trap.
3. Pattern of "pull mock arg and assert on it" without first asserting the mock was called at all. Copilot catches this reliably; worth building the muscle memory.
4. Same root cause as PR #650: ACTIVE_BRANCHES entries are written once and not updated when the PR opens. The project-prompt.mdc rule exists but I keep missing it in the same session as opening the PR.

**Rule to reinforce:**

- Add `throw new Error("<user-visible message>")` to the i18n pre-PR audit grep. New grep pattern: `grep -nE 'throw new Error\(["\x27][A-Z]' file.tsx` — match uppercase starts since internal/dev-only error messages are typically lowercase identifiers.
- Never leave `console.log` in production code paths. If added during triage, either remove before committing or gate with `process.env.NODE_ENV !== "production"`. Add to Pre-Push Self-Check.
- When a unit test reads `mock.calls[N]`, the preceding line must be `expect(mock).toHaveBeenCalled()` (or `.toHaveBeenCalledTimes(N+1)`). Add to Pre-Push Self-Check.
- When opening a PR, update the corresponding ACTIVE_BRANCHES row from `pushed, awaiting local verify` → `PR open #N` **in the same commit as `gh pr create`** or immediately after, before the next user message. This has now been caught twice (#650, #656) — it is a repeat failure.

---

### 2026-04-17 | PR #650 | docker, documentation

**What Copilot caught (2 implemented):**

1. `Dockerfile:22` — `apt-get install -y` without `--no-install-recommends` pulls in a lot of suggested/recommended packages, inflating image size and attack surface. Since the PR explicitly called out an ~80 MB image-size increase, this directly undercut the stated cost. Added `--no-install-recommends`.
2. `docs/ACTIVE_BRANCHES.md:32` — Row was committed with status `in-progress`, which per the doc's own "Status values" section means "not yet pushed". The change was actually submitted via an open PR, so the accurate status is `PR open #650`. Updated in the same commit as the Dockerfile fix.

**Root cause:**

1. Default `apt-get install` recipe was copied without thinking about image bloat — the Debian/Ubuntu best practice is to always pair it with `--no-install-recommends` in container images unless you explicitly need the recommended extras. Puppeteer's own docs also use `--no-install-recommends`.
2. Started the ACTIVE_BRANCHES entry with `in-progress` as a placeholder before pushing, then pushed + opened a PR without going back to update the status field. The file's own legend would have caught it if the agent had re-read the "Status values" key after committing.

**Rule to reinforce / add to `project-prompt.mdc`:**

- When adding `apt-get install -y` to a Dockerfile (or any container image layer), always include `--no-install-recommends` unless a specific recommended package is needed. Add to the Pre-Push Self-Check table.
- When adding a row to `docs/ACTIVE_BRANCHES.md`, the row's status must match the branch's actual state at commit time. If the agent is pushing in the same session, either use `pushed, awaiting local verify` from the start, or update the row to `PR open #N` in a follow-up commit before opening the PR. Never leave a stale `in-progress` status on a branch that is in fact already pushed.

---

## How to Add an Entry

```markdown
### YYYY-MM-DD | PR #N | category/subcategory

**What Copilot caught:** One sentence describing the bug/risk.
**Root cause:** Why the agent missed it — what assumption was wrong.
**Fix applied:** What was changed.
**Rule to add / reinforce:** The principle that would have prevented this.
```

---

### 2026-04-17 | PR #644 | typescript, shell/safety, validation, i18n, concurrency, memory, documentation

**What Copilot caught (7 implemented, 1 documented skip):**

1. `burnTimestamp()` in `lib/image-utils.ts` called `URL.createObjectURL(blob)` without a matching `revokeObjectURL` — every photo capture leaked a blob reference in memory. Fixed to capture the URL in a variable and revoke after the decode resolves or throws.
2. `scripts/bootstrap-bi-reader-grants.ts` used `process.argv[1].endsWith("bootstrap-bi-reader-grants.ts")` as its direct-run guard. Brittle under tsx/compiled entrypoints — could silently make `railway-start.sh` Step 2d a no-op, leaving `bi_reader` without grants. Replaced with the `process.argv[1] === fileURLToPath(import.meta.url)` pattern used by `scripts/bootstrap-admin.ts`.
3. `POST /api/activity/export-pdf` accepted `dateFrom` / `dateTo` as plain strings, then passed them to `new Date(...)` and into Prisma filters. Invalid strings became `Invalid Date` → 500s. Mirrored `GET /api/activity`'s `z.string().datetime({ offset: true }).optional()` validation.
4. `UnitCards.tsx` passed `disabled={false}` hardcoded to the scope-row `SubcontractorPicker` while `useScopePatch()` tracked an in-flight `saving` state. Let users issue concurrent PATCHes for `unifierSubId`. Destructured `saving` from `useScopePatch()` and wired it to `disabled`, matching the pattern used by the other scope layouts in the same file.
5. Migration `20260417130000_media_attachment_unit_photo_source/migration.sql` adds two `TEXT` columns (`unitPhotoSourceType`, `unitPhotoSourceLabel`) — but the PR description described it as introducing a `MediaAttachmentUnitPhotoSource` enum. Fixed the PR description to match what the code actually does.
6. `statusPhotoPrompt.uploadError` in `messages/en.json` read "Upload failed. Your status will still be saved." The `StatusUpdatePhotoPrompt` component does not call `onConfirm()` on upload failure — it returns to the prompt and requires an explicit Skip. Rewrote the copy to describe the actual flow: "Upload failed. Tap Add Photos / Video to retry, or Save Without Photos to skip." Spanish mirrored.
7. Same uploadError mismatch in `messages/es.json` — fixed alongside English.

**Root causes:**
- Memory: forgot that `createObjectURL` needs a matching `revokeObjectURL`; past `image-utils` code didn't use object URLs, so the pattern wasn't in mind.
- Direct-run guard: wrote the new script from scratch instead of copying the existing `bootstrap-admin.ts` pattern. Should have opened the reference file first.
- Validation: the export-pdf route was copied from a sketch and `.datetime({ offset: true })` was lost in the copy; the sibling GET route had it correctly.
- Concurrency: `disabled={false}` is a red flag — if the prop exists it's usually there for a reason, and the hook already exposed `saving`.
- Copy-vs-reality: wrote copy before wiring the behavior; didn't recheck after the final flow diverged from the original plan.

**Rules to add / reinforce:**
- When adding a new bootstrap/script to `scripts/`, open the nearest existing script and copy its shape end-to-end (direct-run guard, error handling, Prisma disconnect). Never hand-roll the guard.
- Whenever `URL.createObjectURL` appears in new code, `revokeObjectURL` must be in the same function — no exceptions.
- Any API route that accepts date inputs must use `z.string().datetime({ offset: true })` — not `z.string()`. Applies to `dateFrom`, `dateTo`, `cursor`, `since`, etc. Mirror sibling routes when copying.
- `disabled={false}` is a code smell: it means the author opted out of a prop that likely has a real value available. Search the file for the hook's return shape and wire the real state.
- Before writing any i18n string for an error/success path, trace the control flow that produces it. If the string says "X will happen", confirm that X actually happens — do not describe intended behaviour, describe actual behaviour.

**Skipped comment (documented):** `app/[locale]/(dashboard)/activity/page.tsx` — Copilot suggested importing `redirect` from `@/i18n/navigation` per ADR-002. This codebase has a site-wide drift: 20+ server pages (`settings/page.tsx`, every `admin/*/page.tsx`, every `(auth)/*/page.tsx`, etc.) use `redirect` from `next/navigation` with a manual `${locale}/...` prefix. Introducing one page that violates the established convention would be more inconsistent than matching it. A separate site-wide refactor per ADR-002 is the right place to fix this. Added an in-code comment calling out the drift.

---

### 2026-04-08 | PR #534 | offline/upload-endpoint, i18n, css-tokens, typescript

**What Copilot caught (8 issues fixed):**
1. `uploadBlobs()` posted to `/api/upload` (non-existent) instead of `POST /api/upload/field-media`; return field was `json.url` but endpoint returns `json.storageUrl`.
2. Missing blob was silently skipped — could create observation/issue without user's captured media. Now returns `null` (hard failure → retry).
3. Comment said `body.__blobUrls` but code injected `mediaUrls`; aligned comment + renamed field to `attachmentUrls`.
4. `pendingCount` after flush was set from `result.failed` — excluded retry-eligible items still in queue. Now re-reads from `getPendingCount()`.
5. `isOnline` destructured from `useOfflineStatus()` in `IssuesLogClient` but never used after removing it from `useCallback` deps. Import removed.
6. Offline cache banners in `UnitCards` and `IssuesLogClient` used `--warning-50/200/700` which don't exist. Corrected to `--warning-100` / `--warning-600`.
7. `FeedbackStatusBadge` new statuses used Tailwind default palette (`amber-*`, `purple-*`, `red-*`). Replaced with design tokens (`--warning-*`, `--primary-*`, `--error-*`). `OfflineProjectButton` used `emerald-*`, `amber-*`, `red-*` — same fix.
8. Hardcoded English in `IssuesLogClient` offline banner, `MediaWithOfflineFallback` labels, `formatRelativeTime()` in two components. Added `offlineMedia` i18n namespace; used `Intl.RelativeTimeFormat` with `useLocale()`.

**Root causes:** New offline feature built quickly; upload endpoint wasn't verified against the actual route file. CSS token names guessed instead of checked against `globals.css`. `formatRelativeTime` helpers written as standalone functions without locale context.

**Rules to reinforce:** Always verify the POST upload endpoint path + response shape in `app/api/upload/` before calling from client code. CSS token names must match `globals.css` exactly — no hex fallbacks. Any new standalone string-returning function that displays in the UI must use `Intl` APIs or translations. New `next-intl` hooks (`useLocale`) must be added to all `vi.mock("next-intl", ...)` stubs in unit tests.

**Skipped comment (documented):** `searchFeedbackForLink()` re-fetches on every keystroke — noted as a performance concern but acceptable at current feedback volume. Would be addressed with a server-side search endpoint when the feedback list grows large.

---

### 2026-04-08 | Infra fix | github-actions/copilot-review

**What was caught:** Copilot was not auto-reviewing PRs created by contributor developers (e.g. `rendeecpbuild`). Phil had to manually add Copilot as a reviewer each time. PRs from Phil's own agent were reviewed automatically.

**Root cause:** The existing `copilot-review-contributors.yml` workflow used `GITHUB_TOKEN` to call `POST /pulls/{n}/requested_reviewers`. The API call returned 200 OK, masking the failure. GitHub's Copilot code review feature does not respond to reviewer requests made via `GITHUB_TOKEN` (the ephemeral bot token used in GitHub Actions) — it only responds to requests from authenticated human user tokens or from the native GitHub Ruleset mechanism. Additionally, the existing native "Copilot code review" Repository Ruleset (ID 13245507) was only targeting `~DEFAULT_BRANCH` (i.e. `main`), so it never fired on PRs targeting `dev`.

**Fix applied:**
1. Updated the GitHub Ruleset via API to add `refs/heads/dev` to the target branches alongside `~DEFAULT_BRANCH`. All future PRs to `dev` will now trigger Copilot auto-review natively — for any author.
2. Deleted `copilot-review-contributors.yml` — it was fully replaced by the native ruleset and was silently not working.
3. Updated `copilot-review.yml` header comment to document the native ruleset as the primary mechanism.

**Rule to reinforce:** `GITHUB_TOKEN` cannot reliably request Copilot code reviews. Always use the GitHub Repository Ruleset (`Automatically request Copilot code review`) as the primary trigger. The ruleset must explicitly target `dev` — `~DEFAULT_BRANCH` alone is insufficient if PRs flow through `dev` before `main`. Verify the ruleset config at: https://github.com/cp-build-dev-ops/command-center-reboot/rules/13245507

---

### 2026-04-06 | PR #511 | security/guards, typescript/types, i18n, testing

**What Copilot caught:** (1) `verifyFeedbackBridgeBearer` took `NextRequest` but integration tests pass plain `Request`. (2) Feedback inbox deep link `?open=` without `environment=` never matched merged list rows → refetch loop. (3) `GET /api/feedback/[id]` prod proxy mapped all non-OK responses to 404 and didn’t catch proxy `fetch` throws. (4) Dictation pulse keyframes used undefined `--primary-500-rgb`, falling back to Tailwind blue instead of brand primary.
**Root cause:** Handler types over-narrowed vs test/request reality; URL sync didn’t normalize missing `environment`; proxy error handling optimized for “hide prod” over diagnosability; CSS variable never added to `:root`.
**Fix applied:** `Pick<Request,"headers">` for bearer verify; inbox effect `router.replace` to add `environment` when inferable from list or `selected`; GET try/catch with 404 vs 503 + body passthrough; defined `--primary-500-rgb: 46, 92, 138` next to `--primary-500`; integration tests for prod GET proxy paths.
**Rule to reinforce:** Bridge/auth helpers that only read `headers` should accept `Request`; prod proxy routes should surface 503 (and bodies) for non-404 failures; design-token RGB tuples must stay in sync with hex primaries.

---

### 2026-04-06 | PR #487 | i18n, a11y, typescript

**What Copilot caught:** (1) Non-standard Tailwind `z-330` may not generate CSS; use arbitrary `z-[330]`. (2) Feedback comment thread used hardcoded English for relative times, transcription UI, and lightbox `aria-label`s — broke next-intl parity with ES. (3) Mention email deep links hardcoded `/en/...` instead of `routing.defaultLocale`. (4) `NotificationCard` keyboard handlers should `preventDefault` on Space to avoid page scroll. (5) `ArrayBuffer | SharedArrayBuffer` assignability in field-media transcribe route.
**Root cause:** Feature work shipped without running the i18n / shared-email-URL patterns from existing `lib/email.ts` and layout rules; z-index copied as literal class; strict TS on `buffer.slice` return type.
**Fix applied:** `z-[330]`; new `feedback.*` message keys + `useTranslations` in `AttachmentGrid` and `formatCommentRelTime`; `routing.defaultLocale` in feedback comment routes; Space `preventDefault` on notification rows; `as ArrayBuffer` for sliced buffer.
**Rule to reinforce:** New UI strings in `components/**` must go through `messages/en.json` + `messages/es.json`. Server-generated user-facing URLs should use `routing.defaultLocale` (or per-user locale when available), not hardcoded `/en/`.

---

### 2026-03-23 | session retrospective | git/hygiene | Phil/agent

**What happened:** `docs/ACTIVE_BRANCHES.md` contained unresolved merge conflict markers after a rebase; a merged feature branch row stayed as “PR open” past merge.
**Root cause:** Conflict resolution was not completed before continuing; housekeeping step (remove row, verify file) was not done in the same session as the merge.
**Fix applied:** Reset coordination file from `origin/dev`, removed stale row; documented `grep '<<<<<<<'` habit and branch-base check in `ACTIVE_BRANCHES.md` and `git-pr-workflow.mdc`.
**Rule to reinforce:** Before pushing any change to `ACTIVE_BRANCHES.md`, `grep -n '<<<<<<<' docs/ACTIVE_BRANCHES.md` must return nothing. Remove the branch row when the PR merges to `dev`.

---

### 2026-03-25 | session retrospective | devtools/schema-drift

**What the agent missed:** Two new Prisma models (`ProjectSubScope`, `ProjectSubScopeInstance`) were added to the schema across multiple sessions but were never added to the DevTools data route whitelist. The DevTools data viewer was silently out of parity with the real DB, showing 17 tables while the schema had 33. A full audit also revealed 16 other tables (Notification, FeedbackTour, Release, ReleaseTour, ReleaseTourStep, ReleaseVerification, EnvironmentVisit, DailyBriefing, BriefingSynthesis, BriefingFeedback, BriefingRule, BacklogItem, MasqueradeLog, PasswordResetToken, and more) had never been added.
**Root cause:** No step in the schema-change workflow required updating `app/api/devtools/data/route.ts`. The `project-prompt.mdc` pre-push checklist covered `database-schema.md` and `api-endpoints.md` but not the DevTools whitelist.
**Fix applied:** Added all 33 schema models to the WHITELIST, TABLE_NAMES, and TABLE_CONFIG in `app/api/devtools/data/route.ts`. Updated the integration test count from 17 to 33 and added explicit assertions for every table group. Added new tests for `ProjectSubScope`, `ProjectSubScopeInstance`, and `PasswordResetToken` (tokenHash exclusion).
**Rule to reinforce:** Any `prisma/schema.prisma` change that adds a new model MUST also add that model to `app/api/devtools/data/route.ts` (WHITELIST + TABLE_NAMES + TABLE_CONFIG) and update the table-count assertion in `__tests__/integration/devtools-data.integration.test.ts`. The hardcoded count in the test acts as the drift detector — if you add a model and forget the DevTools route, the test will fail.

---

### 2026-03-17 | PR #312 | github-actions/dead-code | MAX/Phil

**What Copilot caught:** `copilot-review-contributors.yml` created a `copilot-reviewed` label in a step but never applied it to the PR, and no other workflow or logic checked for its presence — making it permanently dead code.
**Root cause:** Label creation was added as a placeholder for future dedup logic but was never wired up. The agent did not audit whether the label served any purpose before shipping.
**Fix applied:** Removed the label creation step entirely. Labels should only be created when there is active logic that reads or applies them.
**Rule to reinforce:** Before shipping any step that creates a resource (label, file, tag), verify there is at least one other step that consumes it. Dead-resource steps are noise.

---

### 2026-03-17 | PR #312 | github-actions/ux | MAX/Phil

**What Copilot caught:** `protected-files-check.yml` posted a generic warning listing all possible protected directories, instead of the actual files the contributor changed. A contributor touching `docs/decisions/decision-log.md` would see a wall of categories they didn't touch.
**Root cause:** The comment body was written statically — the dynamic file list wasn't fetched from the PR files API.
**Fix applied:** Added a step that calls `gh api /repos/{repo}/pulls/{pr}/files`, filters to protected paths, and injects the actual filenames into the comment body.
**Rule to reinforce:** Warning comments in workflows should reference the actual triggering context (which files changed, which check failed) — never a static list of everything that *could* have triggered.

---

### 2026-03-17 | PR #313 | dependencies/semver | MAX/Phil

**What Copilot caught:** npm `overrides` used open-ended `>=` version ranges (e.g. `"hono": ">=4.12.7"`). This allows npm to resolve future major versions (hono 5.x, serialize-javascript 8.x) which may contain breaking API changes and would not be caught until a failed build.
**Root cause:** `>=` was chosen to ensure the minimum patched version was always satisfied, without considering that it also allows forward-incompatible major bumps.
**Fix applied:** Changed all three overrides from `>=X.Y.Z` to `^X.Y.Z` — allows minor/patch within the same major, which is the correct constraint for "patched but not breaking."
**Rule to reinforce:** npm overrides should use `^` (or `~` for patch-only) — never `>=`. The goal is a safe minimum floor within a compatible major version, not unbounded future resolution.

---

### 2026-03-17 | PR #305 | session retrospective | git/workflow

**What went wrong:** PR #305 was stuck unmerged in dev for ~15 minutes. Phil had to report the problem himself — the agent never delivered the "merged and deployed" receipt.

**Root cause — 3 compounding failures:**
1. **Dependabot race condition.** PRs #300 and #301 were auto-merged at session start. They landed on `dev` while our feature branch CI was still running, leaving the branch `BEHIND`. `strict: true` branch protection silently blocked auto-merge even though CI was green.
2. **`mergeStateStatus` never checked.** After `gh pr merge --squash --auto`, the rule only said "CI green → done." The agent never checked `mergeStateStatus` and therefore never saw `BEHIND`.
3. **Polling loops errored out silently.** Two long-running shell commands aborted mid-poll. The agent did not recover or escalate — the session simply went quiet, with no receipt delivered.

**Fix applied:** Updated `git-pr-workflow.mdc` with three additions:
- After every `--auto` merge, immediately check `mergeStateStatus`. If `BEHIND`, run `gh pr update-branch` before waiting for CI.
- Always poll explicitly for `state:MERGED` — not just CI green. Never declare success until the state shows `MERGED`.
- When Dependabot PRs are merged at session start, proactively run `gh pr update-branch` on any feature PR opened in the same session before waiting for CI.

**Rule to reinforce:** CI green and merge are two separate gates. `state:MERGED` is the only acceptable signal that a PR has shipped. `mergeStateStatus: BEHIND` is a silent merge blocker — always check it immediately after enabling auto-merge.

---

### 2026-03-10 | PR #221 | typescript/types

**What Copilot caught:** `actions?: Array<Record<string, unknown>>` on `GeneratedSimulationStep` is an extremely loose public type that makes downstream usage and error reporting harder.
**Root cause:** The type was copied verbatim from a private local interface in `gemini.ts` without considering that it would become a public contract. The agent didn't apply the "define a named interface" pattern to exported types.
**Fix applied:** Added `SimulationAction` interface with named fields for every action shape (`type`, `url`, `selector`, `label`, `text`, `ms`, `behavior`). Updated `GeneratedSimulationStep.actions` to `SimulationAction[]`.
**Rule to reinforce:** Any exported interface with an `Array<Record<string, unknown>>` field must be replaced with a named interface before the PR is pushed. `Record<string, unknown>` is acceptable inside a single function, not as a public type contract.

---

### 2026-03-10 | session retrospective | git/workflow

**What went wrong (agent process failures, not Copilot catches):**

1. **Build fix committed to wrong branch** — the fix for the Railway prod build error landed on `chore/bump-actions-node24` (an unrelated open PR) because `git status` was not checked before committing. Working tree was dirty from previous branch operations.
2. **PR targeted `main` directly** — PR #220 was opened with `--base main` instead of `--base dev`. No rule existed at the time prohibiting this. The agent constructed the fix path without verifying the Golden Rule.
3. **Assumed email link change needed cherry-picking** — Phil asked to deploy the "email link change." The agent attempted to cherry-pick it without first running `git diff origin/main..origin/dev --name-only` to verify the change wasn't already in `main`. It was already there.
4. **Session startup checklist not completed** — the PR queue and deploy status checks at the start of the session were never finished, leaving the agent with no picture of what was already open or deployed.
5. **Copilot feedback loop not run proactively** — the agent waited for the PR to be blocked by GitHub rather than checking for unresolved threads immediately after CI finished.
6. **Unrelated file swept into commit** — `TourContext.tsx` (an untracked file from a different branch) was included in a commit because `git status --short` was not run before `git add`.

**Rules added / reinforced:**
- `git-pr-workflow.mdc`: "When the Prod Build is Broken" — diagnose first, branch from `dev`, verify clean working tree before committing.
- `git-pr-workflow.mdc`: "Branch Hygiene" — run `git status --short` before every branch operation.
- `git-pr-workflow.mdc`: "The Golden Rule" — all PRs target `dev`, never `main`.
- `git-pr-workflow.mdc`: "Production Deployment" — release PR (dev → main) is required even when Phil says "deploy to prod now."
- `project-prompt.mdc`: Session startup now checks prod and dev deploy status (not just PR queue), and checks for unresolved Copilot threads on every open PR before auto-merging.

---

### 2026-03-06 | workflow/auto-merge | github-actions/dependabot

**What was missed:** Dependabot PRs (e.g. PR #200 `express-rate-limit` security bump) sat open indefinitely because `auto-merge-ready-prs.yml` explicitly skipped all bot-authored PRs with the comment "Dependabot manages its own merges" — which is false: Dependabot auto-merge is not enabled in this repo.
**Root cause:** The bot-skip filter (`grep -qiE 'dependabot|copilot|github-actions'`) grouped Dependabot with bots that should genuinely be skipped (Copilot sub-PRs, Actions bots). The comment was incorrect and went unquestioned.
**Fix applied:** Removed `dependabot` from the skip filter. Dependabot PRs now flow through the same safety gates (CI green, no security-sensitive files, no unresolved threads). Documented the Dependabot policy in `git-pr-workflow.mdc` and added a session-start checklist item to catch any open Dependabot PRs.
**Rule to reinforce:** At session start, explicitly check for open Dependabot PRs alongside other open PRs. If CI is green and no security-sensitive files are touched, enable `--auto` merge immediately — do not wait for Phil to surface them.

---

### 2026-03-06 | PR #201 | security/dev-bypass

**What Copilot caught:** Four new API routes used `auth()` directly instead of `getSession()` from `@/lib/dev-session`, breaking all routes when `DEV_BYPASS_AUTH=true` (local dev standard).
**Root cause:** Agent wrote new routes referencing existing routes as models but picked routes that predate the dev-session pattern.
**Fix applied:** Switched all four routes (`/api/unifier/users`, `/api/users/link-suggestions`, `/api/users/[id]/link-unifier`, `/api/users/[id]/unifier-tasks`) to use `getSession()`.
**Rule to reinforce:** Every new API route must import `getSession` from `@/lib/dev-session` — never import `auth` directly in route handlers.

---

### 2026-03-06 | PR #201 | performance/unifier-client

**What Copilot caught:** Two new routes (`unifier-explore` and `unifier-tasks`) called `fetchAllRows()` to scan the entire Unifier table, then applied `slice()` or in-memory filter, causing full-table scans even for small previews.
**Root cause:** `fetchAllRows()` had no early-exit mechanism; agent didn't consider table size implications.
**Fix applied:** Added `maxRows` parameter to `fetchAllRows()` that stops pagination once enough rows are collected. Explore route caps at `limit×10`; tasks route adds a 5-minute TTL cache and caps at 5000 rows.
**Rule to reinforce:** Any call to `fetchAllRows()` that will be filtered or sliced afterward must pass a `maxRows` cap — never fetch unbounded rows when only a subset is needed.

---

### 2026-03-06 | PR #197 | typescript/types

**What Copilot caught:** `let steps;` declared without a type under strict TS config, making the variable implicitly `any`.
**Root cause:** Agent used a try/catch split declaration pattern without annotating the outer variable.
**Fix applied:** Typed `steps` as `Awaited<ReturnType<typeof generateReleaseVerification>>`.
**Rule to reinforce:** Always annotate try/catch split-declaration variables explicitly — never let the outer `let` be untyped.

---

### 2026-03-06 | PR #197 | typescript/i18n-navigation

**What Copilot caught:** Mixed `usePathname` from `next/navigation` with `useRouter` from `@/i18n/navigation`, requiring a type cast to satisfy router.replace.
**Root cause:** `usePathname` was sourced from the wrong navigation module — `@/i18n/navigation` exports its own locale-aware version.
**Fix applied:** Moved `usePathname` import to `@/i18n/navigation` to match `useRouter`, and removed the type cast.
**Rule to reinforce:** When using `@/i18n/navigation` for `useRouter`, always use `usePathname` from the same module — they share a type contract.

---

### 2026-03-06 | PR #197 | security/input-validation

**What Copilot caught:** Locale query param used in a URL without validation, allowing arbitrary path injection into the share link.
**Root cause:** Agent assumed the locale param would always be `en` or `es` without explicitly enforcing it.
**Fix applied:** Added a `SUPPORTED_LOCALES` allowlist and fallback to `"en"` for any unrecognised value.
**Rule to reinforce:** Any query param used in a constructed URL must be validated against an explicit allowlist.

---

### 2026-03-06 | PR #197 | react/state-sync

**What Copilot caught:** `useEffect` depended only on `steps.length`, so regenerating steps with the same count (different IDs) would not reload localStorage state.
**Root cause:** Agent used a cheap count check rather than a stable identity-based key.
**Fix applied:** Derived a `stepKey` from step IDs joined as a string and used that as the effect dependency.
**Rule to reinforce:** When effect correctness depends on item identity, use a derived key (e.g. IDs joined) not just `.length`.

---

### 2026-03-06 | PR #197 | accessibility

**What Copilot caught:** Icon-only buttons relied on `title` attributes which are not reliably announced by screen readers.
**Root cause:** Agent added `title` thinking it was sufficient for accessibility; it is not for keyboard/screen-reader users.
**Fix applied:** Added `aria-label` (and `aria-pressed` for the toggle) to the checkbox and dismiss buttons.
**Rule to reinforce:** Every icon-only button must have an `aria-label`. Toggle buttons must also include `aria-pressed`.

### 2026-03-12 | PR #273 | github-actions/deploy-verification

**What Copilot caught (4 implemented fixes):**

1. `BASE_URL` was used without stripping trailing slash — `https://example.com/` + `/api/health` produces a double-slash URL that some servers reject. Also, no `-L` flag meant HTTP→HTTPS redirects would return a non-200 code and fail the verify gate falsely.
2. `RAILWAY_DEV_URL` / `RAILWAY_PROD_URL` were validated only inside the `verify` job — meaning `railway up` would already run before the missing URL was caught. Validation belongs in the upfront secrets check alongside `RAILWAY_TOKEN`.
3. In the post-merge polling loop in `git-pr-workflow.mdc`, `$DEPLOY` could be an empty string while the run hasn't appeared in `gh run list` yet. Piping an empty string to `jq` prints a parse error and breaks `RUN_ID` extraction. Needed an explicit empty-string guard.
4. Receipt template said "all three lines every time" — ambiguous wording that could be read as "three literal lines" rather than "all three checkpoints." Changed to "all three checkpoints."

**Root cause:** Writing new shell/workflow code without reviewing it for URL normalization edge cases, early-vs-late validation sequencing, and jq-on-empty-string safety. Standard patterns that should be applied by default.

**Fix applied:** Strip `BASE_URL%/`, add `curl -L`, move URL check into deploy job secrets step, add `if [ -z "$DEPLOY" ]` guard, fix receipt wording.

**Rule to reinforce:** Always strip trailing slash from URL variables before appending paths. Always use `curl -L` for health checks. Validate all required secrets upfront in a single check step. Never pipe a potentially-empty variable to `jq` without an empty-string guard.

---

### 2026-03-11 | Post-merge observation | github-actions/approval-gate

**What was missed:** After merging PR #245, two workflow runs (`Auto-Merge Ready PRs`, `Copilot Review Complete`) were triggered by Copilot's review event. GitHub requires maintainer approval before running workflows triggered by certain actors (Copilot/AI). These show as `conclusion=action_required` in the API and display an "Approve and run" button in the GitHub Actions UI. The agent initially dismissed them as stale noise, which was incorrect — they were genuinely waiting for Phil to click "Approve and run."
**Root cause:** The agent misread `status: completed, conclusion: action_required` as "already finished with no action needed" rather than "paused waiting for maintainer approval." The CLI has no `gh run approve` command; these must be approved in the browser.
**Fix applied:** Added Step 5 to the session startup checklist (`project-prompt.mdc`) and a post-merge check block in `git-pr-workflow.mdc` — both query for `conclusion == "action_required"` runs and surface direct URLs to Phil immediately.
**Rule to reinforce:** After every merge, check `gh run list --limit 20 --jq 'select(.conclusion == "action_required")'`. If any exist, tell Phil immediately with the direct run URL — the CLI cannot approve these, Phil must use the browser.

---

## Categories

- `shell/safety` — Shell scripting pitfalls (regex, quoting, injection)
- `github-actions/triggers` — Workflow trigger scope and side effects
- `github-actions/permissions` — Token permissions and bypass risks
- `github-actions/dedup` — Creating duplicate comments, issues, or labels
- `graphql/pagination` — Missing pagination on API queries
- `prisma/transactions` — Transaction compatibility in pooled environments
- `security/guards` — Missing production guards, PII leaks, unsafe fallbacks
- `typescript/types` — Type safety issues
- `i18n` — Untranslated strings, missing locale coverage
- `testing` — Missing test cases for new behavior
- `docs/rules-sync` — Rule files or agent-context docs that contradict each other or go stale when the codebase changes without corresponding doc updates

---

## Log

---

### 2026-02-27 | PR #95 | security/guards

**What Copilot caught:** `DEV_EMAIL_OVERRIDE` had no production guard — it could silently redirect real customer emails in production if the env var was accidentally set.

**Root cause:** Focused on making the dev redirect work; didn't think through the production blast radius. Assumed env vars would simply be absent in prod.

**Fix applied:** Added `isNonProd()` check that gates on both `NODE_ENV` and `APP_ENV`, so the override is inert in production even if the variable is present.

**Rule to reinforce:** Any env var that changes runtime behavior for dev/staging **must** have an explicit production guard that checks both `NODE_ENV` and `APP_ENV`. Never rely on "it won't be set."

---

### 2026-02-27 | PR #95 | security/guards

**What Copilot caught:** Full email addresses were being logged, leaking PII.

**Root cause:** Added logging for debuggability without considering that email addresses are PII that shouldn't appear in plaintext logs.

**Fix applied:** Added `maskEmail()` that reduces `user@example.com` to `u***@example.com` before any logging call.

**Rule to reinforce:** Never log full email addresses, phone numbers, or names. Always mask PII at the point of logging. Add a `maskEmail()` / `maskPii()` utility and use it consistently.

---

### 2026-02-27 | PR #95 | security/guards

**What Copilot caught:** `sendTestEmail()` was not applying `resolveRecipient()`, creating inconsistent behavior between the test email path and the normal send path.

**Root cause:** `resolveRecipient()` was added to the main send path but the test path was treated as an afterthought.

**Fix applied:** Applied `resolveRecipient()` inside `sendTestEmail()` for both SMTP and Resend branches.

**Rule to reinforce:** When adding a behavioral wrapper (redirect, guard, transform) to a function, immediately check every other entry point that calls the same underlying operation and apply the wrapper there too.

---

### 2026-02-27 | PR #96 | prisma/transactions

**What Copilot caught:** Prisma interactive transactions (`$transaction(async tx => {})`) fail in PgBouncer-pooled environments like Railway with "Transaction not found" errors.

**Root cause:** Developed and tested locally (no PgBouncer); Railway's connection pooling drops the persistent connection that interactive transactions require.

**Fix applied:** Switched to array-form `$transaction([op1, op2])` which is stateless and compatible with connection pooling.

**Rule to reinforce:** Always use array-form Prisma transactions (`$transaction([...])`) in this project. Interactive transactions are incompatible with Railway's PgBouncer. Document this in the Prisma usage section of DEV_NOTES.md.

---

### 2026-02-27 | PR #98 | github-actions/triggers

**What Copilot caught:** Workflow body string used YAML special characters (em dashes, backticks, `**`) directly inside a `run:` heredoc, causing the YAML parser to reject the file.

**Root cause:** Assumed heredocs inside `run:` blocks are safe for any content — they are not. The YAML parser processes the entire file structure including heredoc content for special characters at certain indentation levels.

**Fix applied:** Built multi-line strings with `printf` into a shell variable first, then passed the variable to the command.

**Rule to reinforce:** **Never embed multi-line strings with special characters directly in a `run:` block.** Always build them with `printf` into a variable first. Special characters to watch: `` ` ``, `*`, `_`, `**`, em dash (`—`), `$`, `#` at line start.

---

### 2026-02-27 | PR #99 | github-actions/dedup

**What Copilot caught:** The Copilot tracking issue workflow created a new `agent-action-required` issue on every re-review of the same PR, causing issues to pile up.

**Root cause:** Only considered the first-review case; didn't account for the fact that every push to a PR triggers a new Copilot review and thus a new workflow run.

**Fix applied:** Added a `gh issue list` check for an existing open `agent-action-required` issue matching the PR number before creating. If found, update it in place with `gh issue edit`.

**Rule to reinforce:** Before creating any GitHub issue, comment, or label from a workflow, check if one already exists for the same context (PR number, branch, etc.) and update instead of create.

---

### 2026-02-27 | PR #100 | graphql/pagination

**What Copilot caught:** `reviewThreads(first: 50)` would silently miss unresolved threads on PRs with more than 50 review threads, potentially allowing an auto-merge when threads were actually still open.

**Root cause:** 50 seemed like a large enough ceiling; didn't consider that the query silently truncates without error.

**Fix applied:** Increased to `first: 100`, added `totalCount` to the query, and added a hard block: if `totalCount >= 100` we refuse to auto-merge rather than risk a false "all resolved" reading.

**Rule to reinforce:** When using GraphQL `first: N` pagination, always also fetch `totalCount`. If `totalCount >= N`, either paginate properly or fail safe (do not silently proceed assuming the partial result is complete).

---

### 2026-02-27 | PR #100 | shell/safety

**What Copilot caught:** `SECURITY_PATTERNS` used partial substrings (e.g. `lib/auth`) matched with `grep -q` (regex mode). This means `lib/auth-utils.ts` would be incorrectly flagged as security-sensitive, and patterns like `.github/workflows/deploy.yml` have their `.` treated as "any character" in regex.

**Root cause:** Used `grep -q` as a default without thinking about regex interpretation; listed directory prefixes instead of exact file paths.

**Fix applied:** Switched to `grep -Fq` (fixed-string matching) and updated patterns to exact file paths (`lib/auth.ts`, `lib/permissions.ts`) plus explicit directory paths where full-directory coverage is intended.

**Rule to reinforce:** Always use `grep -Fq` when matching literal strings. Reserve `grep -q` (regex) only when a regex pattern is explicitly needed and documented. When building security allowlists/blocklists, use exact paths not substrings.

---

### 2026-02-27 | PR #100 | github-actions/dedup

**What Copilot caught:** Security-sensitive file notification comments were posted on every workflow run, potentially spamming a PR with identical "requires Phil's review" comments.

**Root cause:** Same root cause as the tracking issue dedup problem — only considered the first-run case.

**Fix applied:** Added a check for an existing security notification comment (by matching comment body prefix) before posting a new one.

**Rule to reinforce:** See 2026-02-27 PR #99 entry. This is the same pattern. Every PR comment posted from a workflow needs a dedup check.

---

### 2026-02-27 | PR #100 | github-actions/permissions

**What Copilot caught:** The `--admin` fallback in `gh pr merge` can bypass branch protection rules (required reviews, required checks), undermining the entire safe-to-merge gate.

**Root cause:** Added `--admin` as a "just in case" fallback when `--auto` fails, without realizing it bypasses protection rules rather than just retrying.

**Fix applied:** Removed `--admin`. If `--auto` fails, attempt a plain `--squash` merge (still respects branch protection). If that also fails, log the error and exit — requiring a human to investigate.

**Rule to reinforce:** Never use `--admin` in automated merge scripts. Automation must respect branch protection. A failed merge should log and exit, never silently bypass.

---

### 2026-02-27 | PR #100 | github-actions/triggers

**What Copilot caught:** `status` and `check_suite` triggers fire for any branch in the repo — not just PRs targeting `dev`. This caused the auto-merge workflow to run hundreds of times unnecessarily.

**Root cause:** Used broad triggers as a catch-all to ensure the workflow runs after checks complete; didn't realize `status` and `check_suite` are repo-wide events with no branch filter.

**Fix applied:** Replaced with `pull_request: [opened, synchronize, reopened, ready_for_review]` scoped to the `dev` branch, plus `pull_request_review: [submitted]`. These are PR-scoped and only fire for the relevant context.

**Rule to reinforce:** Prefer `pull_request` and `pull_request_review` triggers over `status` and `check_suite` for PR-related workflows. `status` and `check_suite` are repo-wide — always check the GitHub docs for event scope before choosing a trigger.

---

### 2026-02-27 | PRs #101 #100 | shell/safety (recurrence)

**What Copilot caught:** Multi-line strings with `**` markdown bold and unindented continuation lines written directly in `run:` blocks, causing YAML parse failures before any job runs (`jobs: []` in run output).

**Root cause:** Despite adding this to the learnings log earlier (PR #98), the same pattern was repeated in two new workflow files written in the same session. The pre-push self-check rule was not consulted before writing the new workflows.

**Fix applied:** Rewrote both multi-line comment bodies using single-line `printf` with `\n` escapes into a shell variable, then passed the variable to the gh command.

**Rule to reinforce:** This is now a **two-strike pattern** — it has recurred once. Every multi-line string in a `run:` block must use `printf '...\n...'` into a variable. No exceptions. Before writing ANY new workflow file, run `python3 -c "import yaml; yaml.safe_load(open('file.yml'))"` locally to validate before pushing.

---

### 2026-02-25 | projects/route.ts + units/route.ts | prisma/transactions (recurrence)

**What Copilot caught:** `$transaction(async tx => {})` interactive transactions were used in two more routes (`POST /api/projects` and `POST /api/projects/[id]/units`) after already being identified as incompatible with Railway's PgBouncer in PR #96. Confirmed error: "Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction."

**Root cause:** The PR #96 fix was applied only to `invites/accept/route.ts`. The projects routes were written separately and the same anti-pattern was repeated. The pre-push self-check table in project-prompt.mdc lists this but it was not consulted.

**Fix applied:** Replaced both interactive transactions with sequential non-transactional calls. Project creation: `db.project.create()` then `insertProjectRows(db, ...)`, with a compensating delete if row insertion fails. Restore path: sequential `db.project.update()` → `db.$executeRawUnsafe(DELETE ...)` → `insertProjectRows(db, ...)`. Units bulk-add: call `insertProjectRows(db, ...)` directly without wrapping in a transaction.

**Rule to reinforce:** This is now a **three-strike pattern**. Never use `$transaction(async tx => {})` anywhere in this codebase. The `db` client must be passed directly to helpers like `insertProjectRows`. The `TxClient` type in `lib/project-rows.ts` accepts both `db` and a tx client — always pass `db`. Add an ESLint rule or grep check to block interactive transactions at PR time.

---

### 2026-03-03 | PR #113 | testing

**What Copilot caught:** `UsersView.test.tsx` tests were failing because the `UsersView` component gained new required props (`roleId`, `specialPermissions` per member, `allRoles`, `canManageRoles` globally) but the test fixtures were never updated.

**Root cause:** Component props were extended for the special permissions system but the test file was not updated in the same commit.

**Fix applied:** Added `DEFAULT_MEMBER` and `DEFAULT_ROLES` fixtures to the test file; added the missing props to all `render()` calls.

**Rule to reinforce:** When adding required props to a component, always grep for all test files that render that component and update them in the same commit.

---

### 2026-03-03 | PR #113 | i18n

**What Copilot caught:** Hard-coded `"Unifier #"` and `"Salesforce"` label strings in the project hub page, and `toLocaleDateString("en-US")` hard-coding the US locale for start date formatting.

**Root cause:** Translation keys `unifierNumber` and `salesforceId` already existed but were not consulted when writing the MetaItem calls. The `locale` param was available in scope but `"en-US"` was typed literally.

**Fix applied:** Replaced with `t("unifierNumber")`, `t("salesforceId")`, and passed `locale` to `toLocaleDateString`. Also used `tStatus()` for the StatCard status value so status displays in the user's locale.

**Rule to reinforce:** Before typing any user-visible string literal in a page or component, check the `messages/en.json` file for an existing key. Pass `locale` from server component params to all `toLocaleDateString` / `toLocaleString` calls.

---

### 2026-03-03 | PR #113 | security/guards

**What Copilot caught:** `GET /api/devtools/layout-issues` was accessible to any authenticated user as long as `isDevToolsAllowed()` returned true. `POST` required `requireDevToolsAdmin()` but `GET` did not.

**Root cause:** Inconsistent auth guard — the read endpoint was treated as safe to expose broadly.

**Fix applied:** Added `requireDevToolsAdmin()` to the `GET` handler, matching the pattern used in `POST`.

**Rule to reinforce:** Every DevTools endpoint (GET and POST) must call `requireDevToolsAdmin()`. The `isDevToolsAllowed()` check is a production guard, not an auth check.

---

### 2026-03-03 | PR #113 | react/hooks

**What Copilot caught:** `ViewportToggle` component modified `document.documentElement` attributes and CSS custom properties when activated, but had no cleanup when the component unmounted while still active. Also, `customWidth` state read in `onUp()` drag handler could be stale due to React closure over an old render.

**Root cause:** The `useEffect` cleanup only handled deactivation (isActive → false) but not unmount. The `onUp` handler closed over `customWidth` state at the time `startDragging` was called, not at the time the drag ended.

**Fix applied:** Added a `return () => { cleanup }` to the deactivation `useEffect`. For the stale state, stored the last computed width in `dragRef.current.lastWidth` during `onMove` and read from there in `onUp` instead of React state.

**Rule to reinforce:** Any `useEffect` that writes to the DOM must have a cleanup function that undoes those writes, both for re-renders and for unmount. For drag handlers and other event listeners, prefer storing derived values in a `ref` rather than reading from potentially-stale state.

---

### 2026-03-03 | PR #115 | dependencies

**What Copilot caught (via CI failure):** `lib/ai/gemini.ts` imports from `@google/generative-ai` but the package was not listed in `package.json`. The unit test mocked the module with `vi.mock(...)` but Vitest still needs the package to be resolvable.

**Root cause:** The AI feature was built and tested locally with the package already installed from a prior `npm install`, so the missing dependency was not noticed. CI always runs `npm ci` from a clean state, which caught the gap.

**Fix applied:** `npm install @google/generative-ai` and committed the updated `package.json` and `package-lock.json`.

**Rule to reinforce:** After adding any new `import` from an external package, immediately verify it is in `package.json` — especially for new feature files. Never assume a package is installed just because it works locally.

---

### 2026-03-05 | manual audit | docs/rules-sync

**What the audit caught:** Four independent issues, all from the same systemic failure:
1. `session-context.mdc` still instructed agents to load `DEV_NOTES.md` + `PROJECT_TRACKER.md` + `LAYOUT_RULES.md` at every session start — directly contradicting `agent-context.mdc` (created same session) which said not to. Both rules were `alwaysApply: true`.
2. `git-pr-workflow.mdc` Agent Authorization table said "not authorized to merge any PR into dev or main" in one section, but the Merge Authority policy section in the same file explicitly authorized auto-merging Phil's PRs.
3. `frontend-patterns.md` and `HANNAH_AGENT_ONBOARDING_PROMPT.md` listed `--button-height: 40px` flat — violating `LAYOUT_RULES.md` R2/R8 which require 44px on mobile. Hannah's agent would generate non-compliant touch targets on every button.
4. `lib/ai/gemini.ts` was added to the codebase but never documented in `key-services.md`. The AI analyze route's Zod schema was also missing from `api-endpoints.md`.

**Root cause:** No process existed to update derivative documents when source documents changed. Specifically:
- When `agent-context.mdc` was created, no one checked for existing rules covering the same domain (`session-context.mdc`)
- When `LAYOUT_RULES.md` was updated with responsive token values, no checklist triggered updates to derivative docs that quote token values
- When `lib/ai/gemini.ts` was added, no step in the workflow said "update `key-services.md`"
- When the merge authority policy was written, the authorization table in the same file was never reconciled against it

**Fix applied:** All four issues fixed. More importantly:
- Added `docs/rules-sync` category to this log
- Added cross-reference dependency map to `agent-context.mdc` ("when X changes, also update Y")
- Added Pre-Push Self-Check row for rule/doc modifications
- These three changes make the systemic failure visible *before* the next occurrence

**Rule to reinforce:** Every structural change to rules or docs has downstream dependents that must be updated in the same commit. The cross-reference map in `agent-context.mdc` is the authoritative list. Check it whenever touching `.cursor/rules/`, `docs/agent-context/`, `LAYOUT_RULES.md`, `lib/`, or `app/api/`.

---

### 2026-03-04 | PR #166 | shell/safety + github-actions/triggers

**What Copilot caught:** Four issues in the deploy documentation rules:
1. "Poll workflow until `conclusion=success`" conflicted with the guidance to tolerate smoke-test failures — overall workflow conclusion fails if any job fails, so the instruction was self-contradictory.
2. `git reset --hard origin/dev` without `git fetch` risks resetting to a stale local ref.
3. The "poll the health endpoint" step showed a single-shot `curl` command, not an actual retry loop.
4. The smoke-test note hardcoded `dev.cp-command-center.com` instead of referencing `BASE_URL`/secrets, and asserted "all 10 tests fail" as a stable invariant.

**Root cause:** The rules were written at a high level of intent without validating each command against shell safety practices or checking for internal consistency between steps.

**Fix applied:** (1) Rewrote step 2–3 to check `unit-tests`/`integration-tests`/`deploy` jobs for `success` and treat `smoke-test` failures separately based on error type. (2) Replaced `reset --hard` with `git fetch origin && git switch dev && git pull --ff-only`. (3) Replaced single-shot `curl` with a 60-iteration retry loop. (4) Replaced hardcoded domain with `BASE_URL`/`RAILWAY_*_URL` secret references and removed the fragile test-count invariant.

**Rule to reinforce:** Any shell command in documentation is real code — apply the same safety review as production scripts. Check that steps within a section are internally consistent before committing.

---

### 2026-03-05 | no PR | testing/fixtures

**What was caught (runtime, not Copilot):** `POST /api/projects` returned 422 "Validation failed" in production because `projectManagerName` was validated as `z.string().min(1)` but the Unifier API can return `null` for that field. The form correctly sent `selected.projectManagerName ?? ""` (empty string), which the schema rejected.

**Root cause:** Every integration test fixture hardcoded `projectManagerName: "PM"` — a non-empty happy-path value. No test ever exercised the empty/null case that real Unifier data produces. The form component (`CreateProjectModal`) also had no unit test at all.

**Fix applied:** Changed schema to `z.string().max(100).default("")`. Added two integration tests: one with `projectManagerName: ""` (empty string from form) and one with the field omitted entirely.

**Rule to reinforce:** When an API route accepts data sourced from an external system (Unifier, Salesforce, etc.), integration test fixtures **must** include at least one case where each nullable field is `null`, `""`, or absent. Never let every fixture use a tidy non-empty value for a field that the external system can legitimately leave blank. Additionally, any form component that submits to an API must have a unit test that exercises the null/empty path.

---

### 2026-03-05 | PR #183 | typescript/types, react/state, i18n, testing

**What Copilot caught (4 implemented fixes):**

1. `fetch().then(r => r.json())` ignored non-2xx responses — error objects flowed into `formatDeployedAgo` and would produce `NaN` or misleading UI values.
2. `/api/health` was fetched twice per refresh cycle (once for the health card, once inside `API_CHECKS`) — avoidable duplicate network request.
3. Countdown timer could go negative if `runChecks()` took longer than 1 second intervals; no guard against concurrent invocations.
4. `process.env` mutations in integration tests lacked `try/finally` — could leave env vars modified if assertions threw.

**Root cause:** Standard client-side data-loading patterns (not checking `r.ok`, not deduplicating fetches) and missing defensive timer logic. The env var pattern was an oversight in test cleanup hygiene.

**Fix applied:** Added `r.ok` check + throw for health and deployment fetches; removed `/api/health` from `API_CHECKS` and derived its check row from the existing `healthRes`; reset countdown at start of `runChecks` and clamped display with `Math.max(countdown, 0)`; added `isRunningRef` guard; wrapped all env var mutations in `try/finally`.

**Rule to reinforce:** When fetching JSON from your own API, always check `r.ok` before calling `r.json()` — non-2xx responses return JSON error objects, not the expected data shape. Derive computed values from already-fetched results rather than issuing duplicate requests. Reset timers at the start of async operations, not the end. Always use `try/finally` when mutating `process.env` in tests.

---

## Distillation History

| Date | Entry | Distilled into |
|------|-------|----------------|
| 2026-02-27 | PR #95 — `isNonProd()` env guard | `backend-patterns.md` Environment Guards section + `project-prompt.mdc` pre-push checklist |
| 2026-02-27 | PR #95 — `maskEmail()` PII logging | `project-prompt.mdc` pre-push checklist |
| 2026-02-27 | PR #96 — Prisma array-form transactions | `backend-patterns.md` Database Patterns section + `project-prompt.mdc` pre-push checklist |
| 2026-02-27 | PR #98/#101 — `printf` for `run:` blocks | `project-prompt.mdc` pre-push checklist (Shell string with special characters) |
| 2026-02-27 | PR #99 — GitHub issue dedup | `project-prompt.mdc` pre-push checklist + `git-pr-workflow.mdc` |
| 2026-02-27 | PR #100 — `grep -Fq` not `-q` | `project-prompt.mdc` pre-push checklist (GitHub Actions workflows row) |
| 2026-02-27 | PR #100 — `--admin` bypass blocked | `git-pr-workflow.mdc` Merge Authority section |
| 2026-02-27 | PR #100 — `pull_request` over `status` triggers | `project-prompt.mdc` pre-push checklist (GitHub Actions workflows row) |
| 2026-02-27 | PR #100 — GraphQL `first: N` + `totalCount` | `project-prompt.mdc` pre-push checklist |
| 2026-03-03 | PR #113 — update test fixtures when component props change | `project-prompt.mdc` pre-push checklist (New form component row) |
| 2026-03-03 | PR #113 — DevTools GET + POST both need `requireDevToolsAdmin()` | `backend-patterns.md` DevTools Routes section + `project-prompt.mdc` pre-push checklist |
| 2026-03-03 | PR #113 — `useEffect` DOM writes need cleanup on unmount | `docs/agent-context/frontend-patterns.md` useEffect Rules section |
| 2026-03-03 | PR #115 — verify package in `package.json` after new import | `project-prompt.mdc` pre-push checklist |
| 2026-03-05 | Manual audit — docs/rules-sync cross-reference map | `agent-context.mdc` cross-reference dependency map + `project-prompt.mdc` pre-push checklist rows for rule/doc edits |
| 2026-03-05 | PR #183 — `r.ok` check before `r.json()` | `docs/agent-context/frontend-patterns.md` Data Fetching Pattern section |
| 2026-03-05 | Testing fixtures — Zod `.default("")` for nullable Unifier fields | `project-prompt.mdc` pre-push checklist + `testing.mdc` External-API Fixture Rule |
| 2026-03-06 | PR #201 — `getSession()` not `auth()` in route handlers | `docs/agent-context/backend-patterns.md` Auth Pattern + `docs/agent-context/key-services.md` + `project-prompt.mdc` pre-push checklist |
| 2026-03-06 | PR #201 — `fetchAllRows()` must take `maxRows` cap | `docs/agent-context/key-services.md` `lib/unifier/client.ts` section + `project-prompt.mdc` pre-push checklist |
| 2026-03-06 | PR #197 — `usePathname` from `@/i18n/navigation` | `docs/agent-context/frontend-patterns.md` i18n in Components section |
| 2026-03-06 | PR #197 — locale query param allowlist | `docs/agent-context/backend-patterns.md` Locale/URL Construction Pattern section + `project-prompt.mdc` pre-push checklist |
| 2026-03-06 | PR #197 — `stepKey` from IDs not `.length` for `useEffect` deps | `docs/agent-context/frontend-patterns.md` useEffect Rules section |
| 2026-03-06 | PR #197 — `aria-label` on icon-only buttons + `aria-pressed` on toggles | `docs/agent-context/frontend-patterns.md` Accessibility Requirements section + `project-prompt.mdc` pre-push checklist |
| 2026-03-11 | Post-merge — Copilot-triggered workflows require maintainer approval before running | `project-prompt.mdc` session startup Step 5 + `git-pr-workflow.mdc` post-merge verification block |
| 2026-03-17 | PR #305 — `mergeStateStatus: BEHIND` silently blocks auto-merge even when CI is green | `git-pr-workflow.mdc` How to Auto-Merge section + Dependabot race condition note |
| 2026-03-27 | PR #395 — Zod `z.string().min(1)` allows whitespace-only names; always pair with `.trim()` on name fields | `project-prompt.mdc` pre-push checklist — Zod schema field rule |
| 2026-03-27 | PR #395 — New user-visible strings in combined status picker were hardcoded instead of using `next-intl` keys; all UI strings must be externalized even for dynamically-built option arrays | `project-prompt.mdc` pre-push checklist + `docs/agent-context/frontend-patterns.md` i18n section |
| 2026-04-07 | feat/scope-canonical-mapping — Prisma client stale after schema change | `project-prompt.mdc` pre-push checklist (`prisma/schema.prisma` change row) + `predev` script now runs `prisma generate` automatically |
| 2026-04-07 | PR #520 — `CameraCapture` save-toggle inline `rgba`/`#fff` colors flagged; kept intentionally — component is a fullscreen dark camera overlay whose entire visual system uses white-on-black rgba values; substituting CSS variable tokens would break the design intent. Acceptable exception to the no-hardcoded-colors rule when the component is a dark-overlay fullscreen UI. |
| 2026-04-07 | PR #520 — Permission mismatch: `PATCH /api/scope-types/[id]/link` and `POST /api/canonical-scopes` required `MANAGE_ROLES` but the scope linking modal is triggered by UPM uploaders (EDIT_UPM). Always match API gate to the permission that triggers the flow, not to the admin role. Rule: linking/normalisation endpoints must share their gate with the upload endpoints that expose them. |
| 2026-04-07 | PR #520 — `animation: "spin 1s linear infinite"` inline style has no `@keyframes spin` in this project's CSS bundle — Tailwind emits the keyframes only when `animate-spin` class is used. Always use `className="animate-spin"` on Loader2/spinner icons, never the raw `spin` keyframe name in a style prop. |
| 2026-04-07 | **SYSTEMIC — i18n and CSS hardcoding are the two most common causes of Copilot review comments across all PRs.** Root cause: agent writes components without i18n setup first and without checking color values before staging. Fix applied: (1) Two new rows in `project-prompt.mdc` pre-push checklist — i18n and CSS color checks are now mandatory before `git add`. (2) Mandatory Pre-PR Audit section in `project-prompt.mdc` with shell commands to scan modified files for hardcoded strings and color values — must show zero output before `gh pr create`. (3) `frontend-patterns.md` updated with explicit prohibited examples for both issues. Rule going forward: write the messages namespace and keys FIRST, then write the JSX. Check color values before staging, not after Copilot reviews. |
| 2026-04-08 | **Copilot auto-review not firing on contributor PRs** — `GITHUB_TOKEN` cannot trigger Copilot reviews; the native GitHub Ruleset was only targeting `~DEFAULT_BRANCH` (main), not `dev`. Fixed: updated Ruleset ID 13245507 to also target `refs/heads/dev`; deleted `copilot-review-contributors.yml`. |
| 2026-04-13 | **Agent merged PRs #601 and nearly merged #597/#598 without any Copilot review** — the "Standard PRs" tier in `git-pr-workflow.mdc` incorrectly allowed skipping Copilot entirely for PRs that didn't touch security or medium-risk paths. Rule: **every PR — regardless of tier — must have at least one Copilot review with all feedback addressed or skipped with justified reasoning before merge.** Fixed: updated `git-pr-workflow.mdc` Standard PR table to require Copilot review as step 4; added guidance to push an empty commit if Copilot hasn't reviewed yet. |

| 2026-04-17 | **PR #630 — Skipped (follow-up items):** (1) `LogHubClient` downloads full issue records just to count open issues for a badge — performance concern, not a bug; optimization tracked as follow-up. (2) `FormsPageClient` relative-time strings ("just now", "m ago", etc.) are hardcoded — i18n gap in Hannah's new Forms feature; too broad to fix in this PR without expanding scope, tracked as follow-up. (3) `FormBuilderClient` has hardcoded "Forms" back button label — same i18n gap in new Forms feature; tracked as follow-up. (4) Log sub-page back button rendered without mobile-only breakpoint gating — layout behaviour is intentional per Hannah's design (visible on all viewports); PR description was imprecise. |

