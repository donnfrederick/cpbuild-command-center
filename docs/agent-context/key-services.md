# Key Services & Utilities — CP Build Command Center

> This file documents the important `lib/` modules and what they do. Read this before opening source files.

## Core Infrastructure

### `lib/db.ts` — Prisma Singleton
Exports a single `db` instance (PrismaClient with PrismaPg adapter). **Local migrations:** use `npm run db:deploy` / `npm run db:migrate` (prod guard) — see `lib/db/guard-migrate-target.ts`.

```typescript
import { db } from "@/lib/db";
await db.project.findMany({ ... });
```

**Critical rule:** Always use array-form `$transaction([...])`. Interactive transactions are incompatible with Railway's PgBouncer connection pooling.

---

### `lib/auth.ts` — NextAuth Configuration
Configures Auth.js v5 with:
- Credentials provider (email + password with bcryptjs; **case-insensitive email lookup** via `findUserByEmailForAuth`)
- JWT strategy (role embedded in token at sign-in)
- Login security: tracks `failedLoginAttempts`, enforces `lockedUntil`
- `trustHost: process.env.AUTH_TRUST_HOST === "true"` (required on Railway)
- `useSecureCookies` when `AUTH_URL` / `NEXTAUTH_URL` is `https://` (ngrok, Railway behind TLS termination)

**Usage (layouts/pages only):**
```typescript
import { auth } from "@/lib/auth";
const session = await auth();  // Server component or page layout
```

**Caveat:** Uses `token["role"]` bracket notation (not `token.role`) due to unreliable TypeScript module augmentation in Auth.js v5.

> **Route handlers must NOT import `auth` directly — use `getSession()` from `lib/dev-session.ts` instead.**

### `lib/auth-session-cookie.ts` — Middleware session cookie detection
Used by `proxy.ts`: detects Auth.js session cookies including chunked names (`__Secure-authjs.session-token.0`, etc.).

### `lib/post-login-redirect.ts` — Safe redirect path after login
Open-redirect-safe path helper for post-login navigation.

### `app/actions/credentials-login.ts` — Server Action login
Calls server `signIn` so session cookies are set via `cookies().set()` (fixes iOS WebKit / mobile Chrome when client `fetch` + `Set-Cookie` was dropped).

---

### `lib/dev-session.ts` — Dev Bypass Session Wrapper
Wraps `auth()` with a `DEV_BYPASS_AUTH` bypass for local development.

```typescript
import { getSession } from "@/lib/dev-session";

// In any API route handler:
const session = await getSession();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Behavior:**
- When `DEV_BYPASS_AUTH=true` AND `NODE_ENV !== "production"`: session resolution order is (1) `cc-dev-persona` cookie email → DB user, (2) `DEV_BYPASS_USER_EMAIL` → DB user, (3) synthetic `dev-user` with role from `DEV_USER_ROLE` (defaults to `ADMIN`). Use (2) or (1) so `session.user.id` matches real rows (feedback assignee, “My items”, etc.).
- In production: delegates to `auth()` — no bypass, full Auth.js session check
- Valid `DEV_USER_ROLE` values: `ADMIN | TEAM_LEAD | DESIGNER | MEMBER | PRODUCT | DEVELOPER | EXECUTIVE | CONTROLS_MANAGER | INSTALL_MANAGER | PROJECT_MANAGER | PROJECT_COORDINATOR`

**This is the canonical session getter for ALL route handlers.** Never import `auth()` directly in `app/api/` routes.

Side effect: when a real user session is resolved (production `auth()` or dev bypass with a DB persona), `touchUserLastActive()` updates `User.lastLoginAt` at most once every 15 minutes.

### `lib/touch-user-last-active.ts` — User activity timestamp
Updates `User.lastLoginAt` (shown on the Users page as “Last active”).

```typescript
import { touchUserLastActive } from "@/lib/touch-user-last-active";
await touchUserLastActive(userId, { force: true }); // login — always write
void touchUserLastActive(userId); // session — throttled ~15 min, multi-instance safe
```

Called from `lib/auth.ts` (credentials login) and `lib/dev-session.ts` (active sessions). Skips synthetic `dev-user`.

---

### `lib/session-db-user.ts` — Map session → real `User.id` (dev bypass)
Used by notification routes, `GET /api/offline/snapshot` (preferences / `OfflineProjectSync`), observation and issue POST handlers, and any API that keys rows by `userId` while the session may be synthetic.

```typescript
import { resolveSessionToDbUserId } from "@/lib/session-db-user";

const dbUserId = await resolveSessionToDbUserId(session.user);
```

**Why:** `DEV_BYPASS_AUTH` default session uses `id: "dev-user"` (no DB row). `@mention` payloads use real user ids from `/api/team`. Notifications are created for mentioned users’ real ids; listing with `session.user.id` would query `dev-user` and return nothing locally.

**Resolution order:** non–`dev-user` id if present in DB → email lookup → oldest `ADMIN` role user → any user. Matches feedback comment author resolution (shared helper).

---

### `lib/password-reset.ts` — Password Reset Token Utilities
Security-hardened token helpers for the forgot-password flow.

```typescript
import {
  generateResetToken, hashToken,
  RESET_TOKEN_EXPIRY_MS, MAX_RESETS_PER_HOUR, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS
} from "@/lib/password-reset";

const plaintext = generateResetToken();  // 32-byte crypto-random hex — travels in email link only
const hash = hashToken(plaintext);       // SHA-256 hash — stored in DB; plaintext never persisted
```

**Security model:** DB stores only the hash — a breach cannot produce valid links. Tokens expire after **72 hours** (self-service and admin links) and are single-use (`usedAt` set on redemption). A new reset request invalidates all prior tokens for that user. API route enforces max 3 requests/hour. Also exports account lockout constants: `MAX_LOGIN_ATTEMPTS=5`, `LOCKOUT_DURATION_MS=30min`.

**Reset page UX:** `shouldSignOutBeforeResetForm(hasSession, isExpiredOrUsed)` — when `true`, the reset-password server page calls `signOut({ redirectTo: same reset URL })` so an email link opened in a browser that was already logged in can still show the form (JWT cleared for that browser only; not all devices).

---

### `lib/public-app-url.ts` — Transactional email base URL
Resolves `AUTH_URL` → `NEXTAUTH_URL` → localhost for invite/reset links in `lib/email.ts`. Logs `[public-app-url]` in production when the configured URL looks like localhost or an internal `:8080` host (misconfigured Railway `AUTH_URL`).

---

### `lib/user-email.ts` — Email normalization + auth lookup
`normalizeUserEmail()` lowercases/trims. `findUserByEmailForAuth()` exact match then case-insensitive — used by login and forgot-password. New invites store normalized email.

---

### `lib/masquerade.ts` — User Impersonation (ADMIN only)
Manages the masquerade (user impersonation) feature. Exports:

```typescript
import { getEffectiveSession, signMasqueradeCookie, parseMasqueradeCookie,
         buildMasqueradeCookieHeader, clearMasqueradeCookieHeader,
         MASQUERADE_COOKIE } from "@/lib/masquerade";

// Use in layouts/pages instead of getSession() to apply masquerade overlay:
const effective = await getEffectiveSession();
// effective.user      = target user's identity (when masquerading) or real user
// effective.masquerade = non-null MasqueradeContext when session is active
```

Cookie `cc-masquerade`: HMAC-SHA256 signed with `AUTH_SECRET`, HttpOnly, SameSite=Lax, 8-hour TTL.
Security: cookie's `actorId` must match the real JWT session `user.id` before any overlay is applied.

`getEffectiveSession()` now has a three-layer priority chain:
1. Masquerade cookie active → overlay full target user identity (id, email, name, role)
2. Role preview cookie active (and no masquerade) → overlay role only; real id/email/name preserved
3. No overlay → return real JWT session

The returned `EffectiveSession` includes `masquerade` and `rolePreview` fields — both null when inactive.

---

### `lib/role-preview.ts` — Role Preview (ADMIN, DESIGNER, DEVELOPER)
Manages the role preview feature that lets privileged users temporarily view the dashboard as any role. Exports:

```typescript
import { signRolePreviewCookie, parseRolePreviewCookie,
         buildRolePreviewCookieHeader, clearRolePreviewCookieHeader,
         ROLE_PREVIEW_COOKIE } from "@/lib/role-preview";
import type { RolePreviewPayload, RolePreviewContext } from "@/lib/role-preview";

// RolePreviewContext shape (available as effective.rolePreview):
// { realRole: string; previewRole: string }
```

Cookie `cc-role-preview`: same HMAC-SHA256 signing pattern as masquerade, 8-hour TTL.
- Only overlays `user.role` in `getEffectiveSession()` — id, email, name are unchanged
- API routes using `getSession()` always see the real role (preview is UI-only)
- `PERMISSIONS.PREVIEW_ROLE` (`role:preview`): ADMIN, DESIGNER, DEVELOPER only
- UI: `RolePreviewBanner` (blue banner when active) + `RolePreviewPicker` (dropdown in AccountMenu)

---

### `lib/feedback-access.ts` — Feedback visibility helpers
Used by `GET /api/feedback`, `GET /api/feedback/[id]`, and comment routes.

- `hasFeedbackInboxAccess(role, specialPermissions?)` — `PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX` (`feedback:inbox`); optional JWT `specialPermissions` array is honored
- `getMentionedFeedbackReportIds(userId)` — distinct `feedbackReportId` from `FeedbackMention`
- `feedbackListWhereClause(userId, role, mentionedIds, specialPermissions?)` — Prisma `where` for non-inbox users
- `viewerContextForReport(viewerId, canViewAll, report)` — `"submitter"` vs `"mentioned"` for list badges
- `userCanViewFeedbackReport({ viewerId, role, report, specialPermissions? })` — inbox, submitter, or mention row
- `canChangeFeedbackAssignee({ viewerId, role, reportUserId, specialPermissions? })` — submitter or inbox

### `lib/feedback-assignment.ts` — Assignee allowlist
- `FEEDBACK_ASSIGNEE_ROLE_CODES` — `ADMIN`, `DEVELOPER`, `DESIGNER`
- `isAllowedFeedbackAssigneeRole(roleCode)` — DB role check (treats `SUPER_ADMIN` as `ADMIN`)
- `filterTeamMembersForFeedbackAssignee(members)` — UI dropdown after `GET /api/team`

### `lib/feedback-inbox-filters.ts` — Client inbox list filtering (pure)
- `filterFeedbackInboxRows(rows, criteria)` — scope (`all` vs `mine` by assignee id), type, priority (including “none”), environment, case-insensitive title/description search
- Used by `FeedbackInbox` and unit tests; data still comes from a single `GET /api/feedback`

### `lib/feedback-inbox-events.ts` — Inbox refresh signal
- `FEEDBACK_INBOX_REFRESH_EVENT` — `window` `CustomEvent` name; `FeedbackModal` and `FeedbackFormInline` dispatch after successful `POST /api/feedback` so `FeedbackInbox` refetches without a full page reload

### `lib/offline/observation-draft-storage.ts` — Unit observation draft persistence
- `saveObservationDraft()` / `loadObservationDraft()` / `clearObservationDraft()` — autosave for `AddObservationModal`; text in localStorage, staged photos in offline blob store (24 h TTL)
- `restoreObservationDraftMedia()` — rehydrates staged `File` + preview URLs when user taps Restore on the draft banner
- Scoped per `projectId` + `unitRef` so each unit's in-progress observation is independent

### `lib/feedback/draft-storage.ts` — Form draft persistence
- `saveFeedbackDraft(draft)` / `loadFeedbackDraft()` / `clearFeedbackDraft()` — localStorage read/write helpers; drafts expire after 24 h
- `hasMeaningfulDraftContent(draft)` — true when the draft has a non-empty title, description, or screenshot URLs (used to decide whether to show the restore banner)
- `draftAgeLabel(savedAt)` — human-readable relative time string for the restore banner (e.g. "3 minutes ago")
- Both `FeedbackFormInline` and `FeedbackModal` autosave on every change and offer a restore banner on mount/open; photos that have been fully uploaded (have a Supabase URL) are included in the saved draft

### `lib/feedback/assist-session.ts` — AI Assist session helpers
- `makeFeedbackAssistSessionId()` — cryptographically secure UUID v4 for assist chat sessions
- `MAX_FEEDBACK_RECORDING_SECONDS` (120) — shared screen-recording duration cap for `FeedbackModal` and `FeedbackRecordingContext`
- `isFeedbackScreenRecordingSupported()` — true when both `getDisplayMedia` and `MediaRecorder` are available

### `lib/feedback-comment-attachments.ts` — Storage key validation
- `FEEDBACK_COMMENT_STORAGE_PREFIX` — `field-media/feedback-comments/`
- `isValidFeedbackCommentAttachmentKey` / `assertFeedbackCommentAttachmentKeys` — reject wrong prefix or `..`

### `lib/feedback-screenshot-url.ts` — Screenshot signed-URL validation
- `isFeedbackScreenshotSignedUrl(url)` — accepts HTTPS signed URLs under `field-media/feedback-screenshots/` (or legacy dedicated `feedback-screenshots` bucket) on the configured Supabase host; used by `POST /api/feedback` schema validation
- Shared implementation: `lib/feedback-screenshot-url-shared.ts`; server entrypoint: `lib/feedback-screenshot-url.ts` (`server-only`)

### `lib/media-attachment-limits.ts` — Shared attachment cap
- `MAX_MEDIA_ATTACHMENTS_PER_ENTITY` (30) — used by observation/issue/comment/bulk/resolve Zod schemas and matching client modals so UI and API stay aligned.
- `MAX_PHOTOS_PER_CAPTURE_SESSION` (30) — per-session cap for `CameraCapture` (status updates, CLEAR inspection photos); kept equal to entity cap.

### `lib/media/album-types.ts` — Shared album item types
- `AlbumItem`, `AlbumItemSource`, `AlbumSourceType` — used by `GET/POST /api/projects/[id]/album`, `UnitPhotoAlbum`, `UnitAlbumStrip`, and `UnitMediaViewRow`.

### `lib/media/album-scope-tags.ts` — Scope code enrichment for album items

### `lib/media/album-visual.ts` — Visual mime helpers for album aggregation
- `isVisualMedia`, `visualMimeType`, `extractCapturedMedia`, `VISUAL_MIME_WHERE` — shared by album coverage and album GET inspection answers.

### `lib/media/album-coverage.ts` — Project-wide unit refs with photos
- `collectAlbumCoverage(db, projectId)` — returns `{ unitRefs, sourceTypesByUnitRef }` for Media page filters and level indicators; `collectUnitRefsWithAlbumMedia` remains a thin wrapper returning `unitRefs` only.
- `parseScopeCodesFromStatusUpdateLabel()` — parses `"CAB · Completed"` status-update labels.
- `buildScopeRefKeyToCodeMap()` / `scopeCodesFromRefKeys()` — resolves issue/observation `scopeRefKeys` to scope type codes via project rows.
- `scopeCodesFromRowIds()` — resolves inspection submission scope row ids.

### `lib/media/fetch-album-items-for-unit-ref.ts` — Album aggregation for one location
- `fetchAlbumItemsForUnitRef(db, projectId, unitRef)` — shared by `GET /api/projects/[id]/album` and `POST .../album/export-pdf`.

### `lib/media/run-media-album-export.ts` — Media PDF export orchestration
- `runMediaAlbumExport()` — fetches filtered album items per location, validates caps, renders PDF; emits progress snapshots for streaming clients.
- `wantsMediaAlbumExportStream(req)` — detects NDJSON stream request headers.

### `lib/media/media-album-export-progress.ts` — Export progress snapshots
- `MediaAlbumExportProgressSnapshot`, `computeMediaAlbumExportPercent()` — location/item counts and 0–100% weighting (gathering → image prefetch → PDF).

### `lib/media/consume-media-album-export-stream.ts` — Client NDJSON stream parser
- `consumeMediaAlbumExportStream(response, { onProgress, signal })` — parses export stream into a PDF blob for `MediaPageClient`.

### `lib/media/format-media-export-location-detail.ts` — PDF location header lines
- `formatMediaExportLocationDetail()` / `withMediaExportLocationDetails()` — builds `detailLine` (building · level · area · phase) for export entries.

### `lib/media/build-media-export-locations.ts` — Export location ordering
- `buildMediaExportLocations()` — builds ordered `MediaExportLocationEntry[]` matching the Media page hierarchy (standalone custom → building → level → unit).

### `lib/media/media-export-types.ts` — Media PDF export payload types
- `MediaExportSnapshot`, `MediaAlbumExportRequest`, `MediaExportLocationEntry`.

### `lib/pdf/media-album-pdf.ts` — Media page PDF renderer
- `buildMediaAlbumPdf()` — Puppeteer PDF grouped by building/level/location with photo grids and source badges.

### `lib/pdf/media-album-export-limits.ts` — Export batch caps
- `MEDIA_ALBUM_PDF_MAX_LOCATIONS` (80), `MEDIA_ALBUM_PDF_MAX_ITEMS` (400).

### `lib/media/media-filters.ts` — Media page filter helpers
- `MediaActiveFilters`, `EMPTY_MEDIA_FILTERS`, `activeMediaFilterCount()` — location + media-type filter state shared by `MediaPageClient` / `MediaLocationsView`.
- `unitRefMatchesMediaFilters()`, `filterAlbumItemsByMediaFilters()` — filter locations and album strips by media type groups and album source tags.

### `lib/field-media-upload-rate-limit.ts` — Burst guard for `POST /api/upload/field-media`
- In-memory sliding window per authenticated user id (per Node process). Returns 429 with `FIELD_MEDIA_RATE_LIMITED` when exceeded; optional `projectId` on the multipart body enables `activity_logs` rows (`FIELD_MEDIA_UPLOAD_RATE_LIMITED`) for squad review.
- `resetFieldMediaRateLimitForTests()` — Vitest only.

### `lib/email-outbound-rate-limit.ts` — Outbound email abuse guard (in-process)
- Sliding-window counters per scope key (forgot-password IP, inviter id, **invitee email**, mention actor, feedback submitter, DevTools admin, plus a **global hourly cap** shared by all SMTP/Resend sends). **Per Node process** — same distributed caveat as field-media until Redis/edge limits.
- `tryRecordEmailOutbound`, `tryRecordMentionEmailBatch`, `tryRecordGlobalOutboundEmailSend`, `capMentionIdsForBroadcast`, `MAX_MENTION_EMAIL_RECIPIENTS_PER_REQUEST` — used by auth invites, feedback, project mentions, DevTools test-email; `lib/email.ts` enforces the global cap on every transport send.
- `logEmailSecurityEvent` / `hashForEmailSecurityLog` / `logMentionEmailActorThrottled` — structured `[email_security]` warnings (grep in Railway logs). Events include: `forgot_password_ip_throttled`, `forgot_password_target_email_throttled`, `invite_actor_email_throttled`, `invite_recipient_email_throttled`, `feedback_notify_actor_throttled`, `devtools_test_email_throttled`, `global_transactional_email_rate_limited`, `mention_email_actor_throttled`, `mention_email_recipients_truncated`.
- `resetEmailOutboundRateLimitForTests()` — Vitest only.

### `lib/request-client-ip.ts` — Client IP for rate limits
- `getClientIpFromHeaders(headers)` — first `x-forwarded-for` hop, else `x-real-ip`, else `"unknown"`.

### `lib/supabase-url.ts` — Shared Supabase project URL resolver
Used by `lib/field-media-resolve.ts` and any other lib that needs the Supabase base URL without hard-coding env-var logic.

- **`getSupabaseUrl()`** — resolves project URL from `SUPABASE_URL`, then `DATABASE_URL` (postgres project-ref pattern), then `SUPABASE_SERVICE_ROLE_KEY` JWT `ref` claim. Returns `""` on failure (soft; callers that require a URL must throw themselves).

### `lib/field-media-local.ts` — Local field-media when Supabase key is unset
Used by `POST /api/upload/field-media`, `GET /api/upload/field-media/file`, transcribe, and DevTools storage purge.

- **`isSupabaseFieldMediaConfigured()`** — `true` when `SUPABASE_SERVICE_ROLE_KEY` is non-empty after trim; otherwise uploads use disk.
- **`getLocalFieldMediaRoot()`** — `LOCAL_FIELD_MEDIA_ROOT` or `cwd/.local-field-media`.
- **`isValidFieldMediaStorageKey`**, **`writeLocalFieldMediaFile`**, **`readLocalFieldMediaFile`**, **`unlinkLocalFieldMediaKeys`**, **`contentTypeForFieldMediaKey`**, **`absoluteAppOriginFromRequest`** — path-safe I/O and URL building for local `storageUrl`.

### `lib/field-notes-scope.ts` — Project-level vs location-scoped field notes
- **`isProjectLevelUnitRef(unitRef)`** — true when `unitRef` is null, empty, or `||`.
- **`isCustomSiteUnitRef(unitRef)`** — true for `@custom|{id}|{name}` refs (custom site locations).
- **`PROJECT_LEVEL_UNIT_REF_OR`** — Prisma `where` fragment for project-level list queries.
- **`unitContextFromUnitRef(unitRef, labels)`** — builds `UnitContext`; pass translated `FieldNotesLocationLabels`.
- **`formatFieldNotesLocationDisplay(unitRef, projectName, projectLevelLabel, labels)`** — headline + detail for observation/issue viewers. Use `useFieldNotesLocationLabels()` in client components.

### `lib/field-notes/location-builder-tags.ts` — Project-level build phase / area tags
- **`collectLocationBuilderTagOptions(rows)`** / **`loadLocationBuilderTagOptions(db, projectId)`** — distinct `buildPhase` / `area` from Location Builder rows (excludes blank and `"0"`).
- **`validateLocationBuilderTags(unitRef, tags, options)`** — returns error string when tags are invalid or sent for location-scoped notes. Build phase must match Location Builder options. Area must match when the project has defined areas; otherwise a free-text reference label is allowed (note-only, not matrix data).
- **`builderTagRequestFields(tags)`** — omits empty tags from POST bodies.
- **`formatProjectLevelBuilderTagDetail(...)`** — appends phase/area to project-level location detail line.

### `lib/custom-site-locations.ts` — Custom site location model + unit refs
- **`CustomSiteLocation`**, **`CustomSitePlacement`**, **`customSiteUnitRef`**, **`parseCustomSiteUnitRef`**, **`isCustomSiteUnitRef`**
- **`normalizeCustomSiteLocationFields`**, **`customSiteMatchesBuildingSection`**, **`customSiteMatchesLevelSection`**
- **`customSiteDetailHeaderSegments`** — building/level chips for detail modal (standalone hides chips)

### `lib/custom-site-locations/list-custom-site-locations-for-project.ts` — Server list + serialize
Shared by `GET /api/projects/:id/custom-site-locations` and offline snapshot module `custom-site-locations`.

### `lib/custom-site-locations-api.ts` — Client fetch/CRUD for custom site locations
- **`fetchCustomSiteLocations`**, **`createCustomSiteLocation`**, **`updateCustomSiteLocation`**, **`deleteCustomSiteLocation`**
- **`fetchCustomSiteLocations`** falls back to snapshot module `custom-site-locations` when live fetch fails offline
- **`CustomSiteLocationApiError`** — structured `code`: `duplicate_name`, `invalid_scope`, `has_field_notes`

### `lib/location-kind-filter.ts` — Locations page filter by category
- **`shouldShowCustomSiteLocations`**, **`cardMatchesLocationKindFilters`** — common areas / custom locations / units filter on Field Tracker

### `lib/stage-library-field-media.ts` — Library picker staging for field uploads
Wraps **`prepareLibraryImageForFieldUpload`** from `lib/image-utils.ts` (HEIC→JPEG, timestamp burn). Used by observation/issue add modals, bulk actions, and comment attachments.

### `lib/image-utils.ts` — Client image processing (camera + library)
- **`burnTimestamp(blob, date, opts?)`** — watermark + resize for camera captures.
- **`prepareLibraryImageForFieldUpload(file, opts?)`** — HEIC/HEIF conversion via dynamic `heic2any` import, then timestamp burn.
- **`isHeicOrHeifFile`**, **`isFieldMediaImageFile`**, **`resolveClientMime`**.

### `lib/field-media-resolve.ts` — Load field-media bytes for PDF/export pipelines
Used by `lib/pdf/issues-pdf.ts` and `lib/pdf/observations-pdf.ts` to embed images as base64 data URIs.

- **`fetchFieldMediaImageAsBase64(ref)`** — tries local disk (via `storageKey`), then Supabase service-role fetch, then plain HTTP fallback. Returns `null` on failure.
- **`storageKeyFromFieldMediaUrl(url)`** — parses a `storageKey` from local proxy URLs or Supabase object paths.
- **`FieldMediaReference`** interface — `{ storageUrl, storageKey?, mimeType? }`.

### `lib/inspections/inspectionDraftDb.ts` — In-progress inspection drafts (IndexedDB)
Local-only autosave for live, retry, and calibration fills before submit.

- Store: `inspectionDrafts` in shared `cpb-command-center` DB (v2, via `inspectionIndexedDb.ts`)
- `getDraft(draftKey)` / `putDraft(draft)` / `deleteDraft(draftKey)` / `listDraftsForScope(scopeRowId)`
- Draft keys: `live:{scope}:{form}:{version}`, `retry:{scope}:{form}:{parentSubmissionId}`, `calibration:{scope}:{form}:{parentSubmissionId}`
- Orchestrated by `useInspectionOverlayDraft` + `useInspectionLeaveGuard`; cleared on successful submit

### `lib/inspections/deficiency-extraction.ts` — Normalize inspection deficiencies
Extracts failed `PASS_FAIL_DEFICIENCIES` answers from `inspection_submissions.payload` into normalized deficiency/media records.

- `extractInspectionDeficiencies(input)` — pure parser used by tests and backfill dry-runs
- `replaceInspectionDeficiencies(input, client?)` — deletes/recreates normalized rows for one submission, preserving the original payload JSON
- Used by `POST /api/inspection-submissions`, `PUT /api/inspection-submissions/[id]`, and `scripts/backfill-inspection-deficiencies.ts`

### `lib/inspections/reporting-normalization.ts` — Inspection BI/reporting mirrors
Backend-only normalization helpers that keep app UX JSON-compatible while writing BI-ready tables.

- `normalizeFormSections(sections)` — pure parser for form builder section/question JSON, including fail follow-ups
- `syncFormReportingStructure({ formId, sections })` — replaces current editable form section/question reporting rows
- `syncFormVersionReportingStructure({ formVersionId, sections })` — replaces immutable published-version section/question reporting rows
- `extractInspectionAnswers(input)` — pure parser for submitted answer payloads into typed answer rows
- `replaceInspectionAnswers(input, client?)` — deletes/recreates `inspection_answers` for one submission and returns a question-id to answer-id map
- `replaceInspectionDeficiencies({ inspectionSubmissionId, answerIdByQuestionId, ... }, client?)` — deletes/recreates `inspection_deficiencies` directly against answer ids
- Used by form save/publish routes, inspection submission POST/PUT, and `scripts/backfill-inspection-deficiencies.ts` / `npm run backfill:inspection-reporting`

### `lib/inspections/form-reporting-structure.ts` — Authoritative form relational mirrors
Load/save helpers for the form builder cutover — relational `inspection_form_*` tables are source of truth; JSON columns are stubs.

- `loadFormSectionsFromReporting(formId)` — assemble `FormSection[]` from draft mirror rows (legacy JSON fallback in GET route)
- `countFormDraftQuestions(formId)` / `countFormVersionQuestions(formVersionId)` — publish/save-version gates
- `copyFormDraftToVersionReporting(formId, formVersionId)` — copy draft mirror → version mirror on publish
- `buildFormTemplateFromVersion(form, formVersion, client?)` — assemble published template from version mirrors only
- `FORM_JSON_STUB` — empty `{}` stored on `forms.draftSections` / `form_versions.sections` for new writes
- Used by `GET/PATCH /api/forms/[id]`, publish, and save-version routes

### `lib/inspections/form-fill-validation.ts` — Inspector fill UX helpers
Pure helpers for live form validation affordances (no I/O).

- `shouldHighlightDeficiencyDescription(...)` — when to show the missing-description error on a flagged deficiency (after severity/count is set or post-submit)
- Used by `FormFillClient` / `DeficiencyEntry`

### `lib/inspections/hydrate-inspection-submission-view.ts` — Relational read hydration
Rebuilds `templateSnapshot` and `payload` from mirror tables when JSON columns hold stubs (post-cutover submissions).

- `isInspectionPayloadStub(payload)` / `isInspectionTemplateSnapshotStub(snapshot)` — detect empty/category-only JSON stubs
- `hydrateInspectionSubmissionView(submission, client?)` — joins version sections + answers/media/deficiencies for record viewer and PDF export
- `isProjectRowInstallCompleteForClearInspection(input)` (`clear-inspection-scope-gate.ts`, client-safe) — clear-inspection gate predicate; parent row **or** all sub-scope instances must be INSTALL+COMPLETE
- `assertScopeReadyForClearInspection(scopeRowId)` (`assert-scope-ready-for-clear-inspection.ts`, server-only) — API route gate using the predicate above
- `shouldCreateInspectionHistoryRow()` / `createInspectionHistoryRow()` / `upsertInspectionHistoryRow()` (`inspection-history-sync.ts`) — unified clear + calibration writes to `clear_inspections` (future `inspections`); formal clears also sync scope `inspectionStatus`
- `resolveCalibratedAgainstClearInspectionId()` / `findLatestClearInspectionIdForScope()` (`calibration-target.ts`) — links calibration history rows to the original clear inspection
- `categoryToInspectionTypeCode(category)` / `getInspectionTypeIdByCode(db, code)` (`inspection-type.ts`) — maps category → `inspection_types` FK
- Used by `GET /api/inspection-submissions/[id]` and `POST .../export-pdf`

### `lib/inspections/inspection-report-filters.ts` — Inspections report client filters
Pure helpers shared by `InspectionsReportClient` and unit tests.

- `applyInspectionReportClientFilters(submissions, filters)` — location / inspector / subcontractor / result filters
- `flattenInspectionReportSubmissions(scopeTypes, filters, scopeCode)` — single-scope or `ALL_INSPECTION_SCOPES` combined rows with scope metadata
- `countUnfilteredInspectionReportSubmissions(scopeTypes, scopeCode)` — unfiltered row count for summary "X of Y"
- `computeInspectionReportStats(submissions)` — passed, failed, calibration, and deficiency totals for the visible row set
- `hasActiveInspectionReportClientFilters(filters)` — whether any client-side filter is active

### `lib/inspections/inspection-failed-items-filter.ts` / `inspection-failed-items-export.ts` — Failed-only export toggle
Shared helpers for the "Share only failed items" checkbox on inspection CSV/PDF exports and single-submission PDF share.

- `isFailedPassFailAnswer(responseType, answer)` — pass/fail question marked fail (incl. legacy deficiency-only rows)
- `submissionHasFailedExportItems(submission)` — row has at least one failing pass/fail question
- `filterSubmissionsForFailedOnlyExport(submissions, shareOnlyFailedItems)` — omits fully passing records when toggle is on
- `FailedOnlyExportEmptyError` — thrown when a failed-only export would be empty

Used by `InspectionsReportClient`, `ProjectHubInspectionsCard`, `InspectionFillOverlay`, and PDF/CSV export routes.

### `lib/inspections/inspection-report-csv.ts` — Inspections report CSV builder
- `buildInspectionReportCsv(submissions, { shareOnlyFailedItems })` — one row per question/deficiency; omits passing inspections when failed-only mode is enabled

### `lib/feedback-urls.ts` — Shareable feedback links
- `buildFeedbackDetailAbsoluteUrl(origin, locale, feedbackId, environment?)` — uses `getPathname` for `/{locale}/feedback/{id}`; optional `environment` query for merged prod rows

### `lib/feedback-agent-prompt.ts` — Pasteable AI / agent context
- `buildFeedbackAgentPromptMarkdown(report, comments, { appDeepLink })` — English markdown bundle (human id `FB-####`, UUID, deep link, fields, chronological comments + attachment URLs) for pasting into coding assistants

### `lib/linkify-urls.ts` — Autolink segments in plain text
- `segmentPlainTextWithUrls`, `toSafeHttpUrl`, `stripTrailingPunctuationFromUrl` — pure parsing for safe React links (no HTML injection). Composed with `@mention` highlighting via `renderMentionNodesWithLinkifiedUrls` in `lib/mention-render.tsx` (feedback comment thread).

### `lib/maps-url.ts` — Google Maps search URLs
- `buildGoogleMapsSearchUrl(address)` — trims input; returns `https://www.google.com/maps/search/?api=1&query=…` or `null` when empty. Used by `ProjectSiteLocationLink` on the projects list.

### `lib/feedback-environment.ts` — Merge / query helpers
- `FeedbackEnvironment`, `FeedbackListApiResponse`, `FeedbackListProdFeedStatus`
- `feedbackRequestSearchParams` — `NextRequest` or plain `Request` (tests)
- `parseFeedbackEnvironmentParam` — validates `environment` search param
- `parseFeedbackEnvironmentFromRequest` — reads `?environment=` from the request

### `lib/feedback-bridge-auth.ts` — Internal bridge auth
- `verifyFeedbackBridgeBearer(req)` — Bearer secret check (timing-safe digest compare)
- `getFeedbackBridgeSecret`, `isFeedbackBridgeConfiguredOnThisServer`

### `lib/feedback-prod-client.ts` — Dev → prod HTTP (server-only)
- `isFeedbackProdMergeEnabled`, `getFeedbackBridgeProdBaseUrl`, `fetchProdInternalFeedback`

### `lib/feedback-prod-proxy.ts` — Session + merge gate (server-only)
- `sessionMayProxyProdFeedback`, `proxyProdFeedbackPath` — inbox + merge required to proxy `?environment=production` traffic to prod internal routes

### `lib/rad-dash-webhook.ts` — Shared payload types for Field Tracker → Rad-Dash integration
- Exports `RadDashProject`, `FieldTrackerWebhookPayload`, and `FieldTrackerFeedbackItem` interfaces
- Used by `app/api/webhooks/rad-dash-projects/route.ts` (GET project list) and `app/api/webhooks/send-to-rad-dash/route.ts` (POST tickets)
- Both routes derive the Rad-Dash base URL from `RAD_DASH_WEBHOOK_URL` (`.origin`) and authenticate with `RAD_DASH_WEBHOOK_SECRET`

---

### `lib/permissions.ts` — Authorization
Exports `PERMISSIONS` catalog and `hasPermission()` function.

```typescript
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

hasPermission("ADMIN", PERMISSIONS.INVITE_MEMBER);   // → true
hasPermission("MEMBER", PERMISSIONS.MANAGE_ROLES);  // → false
```

`ROLE_PERMISSIONS` in code defines bootstrap defaults; runtime role grants come from `role_permissions` (DB) via `lib/role-permission-cache.ts`. `UserSpecialPermission` overrides (per-user grants) are checked on top of role defaults in route handlers.

**Bootstrap scripts (Railway `railway-start.sh`):** `bootstrap:roles` → `bootstrap:permissions` → `bootstrap:role-permissions`.

### `lib/ensure-permission-rows.ts` — Catalog → DB sync on write
- `ensurePermissionRows(db, codes)` — upserts missing `permissions` rows from `PERMISSION_METADATA` before Role Manager saves `role_permissions`. Fixes environments where the legacy migration seed only has ~7 codes.

### `lib/role-permission-cache.ts` — DB-backed role permission cache
- `refreshRolePermissionCache()` — loads all `role_permissions` into an in-memory map (60s TTL).
- `invalidateRolePermissionCache()` — called after Role Manager writes.
- `hasPermission()` uses cache when loaded; falls back to `ROLE_PERMISSIONS` before first warm.

### `lib/permission-metadata.ts` — Permission labels for Role Manager UI
Exports `PERMISSION_METADATA`, `ROLE_GRANTABLE_PERMISSIONS`, and `permissionLabel()`.

**Active permissions:**
- `invite:member` — ADMIN only
- `view:team` — ADMIN + MEMBER
- `manage:roles` — ADMIN only
- `remove:member` — ADMIN only
- `upm:view` (`VIEW_UPM`) — ADMIN, DESIGNER, DEVELOPER, CONTROLS_MANAGER, PROJECT_MANAGER. Grants Field Tracker read access.
- `upm:edit` (`EDIT_UPM`) — ADMIN, CONTROLS_MANAGER only. Grants full CRUD on Field Tracker (UPM) matrix rows. Does NOT grant stage/status update rights.
- `unit:status-manage` (`MANAGE_UNIT_STATUS`) — ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER, PROJECT_MANAGER. Grants write access to `scopeStage`, `scopeStatus`, and `inspectionStatus` on unit rows (the Units page stage/status pickers). Intentionally absent from CONTROLS_MANAGER (they own Field Tracker data, not install stage tracking).
- `projects:manage` (`MANAGE_PROJECTS`) — ADMIN, TEAM_LEAD, INSTALL_MANAGER, PROJECT_MANAGER. General project CRUD rights. Does NOT grant Field Tracker access.
- `forms:manage` (`MANAGE_FORMS`) — ADMIN by default; other roles via Users → special permission **Manage Forms**. Gates Form Builder nav, `/forms` pages, and form CRUD APIs. Published forms remain readable via `GET /api/forms?status=published` and `GET /api/forms/[id]` when `status === PUBLISHED` (inspection picker). Helper: `canManageForms(roleCode, specialPerms?)`.

**`getProjectNavAccess(roleCode)`** — computes which tabs are visible inside a project workspace:
- `canViewUPM`: `VIEW_UPM` holders (ADMIN, DESIGNER, DEVELOPER, CONTROLS_MANAGER, PROJECT_MANAGER)
- `canViewUnits`: `true` for all authenticated roles (all roles may see the Units page; what they can *do* is controlled by `MANAGE_UNIT_STATUS` and `EDIT_UPM`)
- `canViewDocuments`: `true` for all authenticated roles

---

### `lib/production-deployment.ts` — Canonical production process detection
`isStrictProductionDeployment()` is true when `NODE_ENV === "production"` and the deployment is not classified as dev/staging via `APP_ENV`, `RAILWAY_ENVIRONMENT_NAME`, or `RAILWAY_GIT_BRANCH=dev`. Intentionally ignores `DEVTOOLS_ENABLED` — that flag must not weaken production data rules.

### `lib/production-project-access.ts` — Test projects & strict-prod mutations
Enforces:
- **`Project.isTestProject`**: in strict production, only **ADMIN**, **DEVELOPER**, and **DESIGNER** (real session role from `getSession`) may list, read, or mutate test projects; other roles get **404** on project-scoped APIs.
- **Non-test projects in strict production**: **DESIGNER** and **DEVELOPER** cannot mutate project-linked data (**403**). **ADMIN** must have an active **masquerade** as a user whose role has `MANAGE_PROJECTS`, `EDIT_UPM`, or `MANAGE_UNIT_STATUS` (and is not Designer/Developer) for **UPM, unit status, album uploads, and other structural project mutations**.
- **Field notes** (observations, issues, comments, resolve/reopen): **ADMIN** may mutate real production projects **without masquerade** via `enforceProductionFieldNotesMutation` / `checkProductionFieldNotesMutationAllowed`.

Route handlers use `enforceProjectReadVisibility`, `enforceProductionProjectMutation` (structural edits), `enforceProductionFieldNotesMutation` (observations/issues routes), and (for `POST /api/projects`) `checkProductionProjectCreateAllowed` / `checkProductionTestProjectFlagPatchAllowed`.

---

### `lib/email.ts` — Transactional Email
Wraps Resend SDK. Automatically switches to Mailpit SMTP in dev.

```typescript
import { sendInviteEmail } from "@/lib/email";
await sendInviteEmail({ to: "user@example.com", token: inviteTokenPlaintext, inviterName: "Phil" });
```

Transport selection logic (see `lib/email.ts`):
- `SMTP_HOST` set → nodemailer SMTP (local Mailpit by default: host `localhost`, port `1025`; optional `SMTP_USER` / `SMTP_PASS`, `SMTP_UI_PORT` for Mailpit web UI)
- `RESEND_API_KEY` missing or placeholder (`re_YOUR…`) → code still picks the **SMTP** transport. That is only safe when **`SMTP_HOST` is set** (e.g. local Mailpit). If `SMTP_HOST` is unset, nodemailer defaults to `localhost:1025`, which typically **fails on Railway** — use a real Resend key in production and leave `SMTP_HOST` unset.
- Valid `RESEND_API_KEY` and **no** `SMTP_HOST` → **Resend** (typical **Railway production**)

Also: `EMAIL_FROM` (default sender), `NEXTAUTH_URL` (base URL for invite/reset links), `DEV_EMAIL_OVERRIDE` (non-prod only, redirects all recipients). Forgot-password and invite flows require a working transport + `NEXTAUTH_URL` pointing at the deployed app.

---

### `lib/invites.ts` — Client-Side Invite Utilities
Thin client-side fetch wrapper for invite operations. Import in client components.

```typescript
import { resendInvite } from "@/lib/invites";

const invite = await resendInvite(inviteId);  // Throws with message on non-OK response
```

Currently exports only `resendInvite`. Server-side invite creation logic lives in `app/api/invites/route.ts` directly.

---

### `lib/browser-speech.ts` — Client voice-to-text (Web Speech API)
Helpers for **browser / OS speech recognition** (no server STT). Used by `components/ui/DictationButton.tsx` on observation/issue forms and comment threads.

- `appendTranscriptSegment(current, segment, maxLength?)` — append dictated text with spacing and optional cap
- `getSpeechRecognitionConstructor()` / `isBrowserSpeechRecognitionSupported()` — feature-detect `SpeechRecognition` / `webkitSpeechRecognition`
- `localeToSpeechRecognitionLang(locale)` — map next-intl locale to `en-US` / `es-ES` for `recognition.lang`

**Support:** Chrome, Edge, Safari (varies by OS); Firefox often lacks the API — the mic control is hidden when unsupported.

---

## Projects

### `lib/projects.ts` — API `Project` type & status labels
```typescript
export type Project = { id, projectName, siteLocation, status, lifecycleStatus, startDate, ... };
export const PROJECT_STATUSES = ["Active", "Completed", "Planning", "On Hold"] as const;
export const SEARCH_DEBOUNCE_MS = 300;

/** Maps `mapUnifierStatus()` keys → API display status strings */
export const statusFromDb = { Active: "Active", Completed: "Completed", Planning: "Planning", OnHold: "On Hold" } as const;
```
Display fields on `Project` are filled by `lib/project-unifier-merge.ts`, not read from Postgres. **`status`** is Unifier `CP_PROJECT_PHASEPD` (verbatim UI label). **`lifecycleStatus`** is `UUU_SHELL_STATUS` mapped — filters, badge colors, portfolio AI. **`startDate`** is `UNIFIER_SYS_PROJECT_INFO.STARTDATE` (by `PID` = `unifierPid`), with fallback to shell `CP_OP_FDD_DOP` when missing. **`siteLocation`** is address (`CP_GEN_ADDRESS_TB2000`) plus `CP_GEN_STATE_PD` via `formatUnifierSiteLocation` when state is not already redundant at the end of the line.

### `lib/project-unifier-merge.ts` — DB row + Unifier shell → API `Project`
```typescript
import {
  enrichProjectList,
  enrichProjectListResilient,
  enrichProjectById,
  mergeProjectWithShell,
  resolveShellUnifierPid,
} from "@/lib/project-unifier-merge";

// List: `getProjects()` + `getSysProjectStartDateByPidMap()` (both cached; warmed together on list refresh)
await enrichProjectList(dbRows);
// Dashboard SSR / GET /api/projects — never throws; returns unifierAvailable (API route sets x-unifier-available header):
const { projects, unifierAvailable } = await enrichProjectListResilient(dbRows);

// Single project: `getProjectByPid` then sys start map (cache hit after shells load)
await enrichProjectById(id);
```
Used by `/api/projects`, `/api/projects/[id]`, `/api/ai/analyze`, and server layouts that need display metadata. Test projects merge Unifier metadata via `sourceUnifierPid` when set and append ` (TEST)` to the display name.

### `lib/custom-site-location-validation.ts` — Custom site scope + name checks
```typescript
import { validateCustomSiteLocationScope, customSiteLocationNameTaken } from "@/lib/custom-site-location-validation";
```
Server-side validation for POST `/custom-site-locations`: placement rules, building/level existence in UPM `project_rows`, case-insensitive duplicate name per project.

### `lib/project-favorites.ts` / `lib/project-favorites-shared.ts` — Per-user pinned projects
```typescript
import { enrichProjectsWithFavorites, favoriteOwnerFromEffectiveSession } from "@/lib/project-favorites";
import { sortProjectsWithFavorites, compareProjectsByField } from "@/lib/project-favorites-shared";
```
Server module loads `UserProjectFavorite` rows for the real logged-in user (via `favoriteOwnerFromEffectiveSession` + `resolveSessionToDbUserId`), sets `isFavorite` on each `Project`, and sorts favorites first. Shared sort helpers (no DB import) are used by `ProjectsTable` client re-sort. Toggle: `PATCH /api/projects/[id]/favorite`.

### `lib/bi-project-access.ts` — BI API test-clone whitelist
```typescript
import { biProjectListWhere, biProjectByIdWhere } from "@/lib/bi-project-access";
```
Default BI filters exclude `isTestProject: true`. When a project ID appears on the API key's `allowedProjectIds`, test clones are included for that ID only.

### `lib/test-data-seed/` — Admin batch seeding on test projects
```typescript
import { seedTestData, removeTestDataBatch } from "@/lib/test-data-seed/seed-test-data";
await seedTestData(projectId, adminUserId, { userIds: ["..."], issues: { count: 10 } });
```
Generates backdated issues, observations, FORM-based clear inspections (with failed retries), and calibration inspections on scopes with existing clear history on `isTestProject` sandboxes only. Uses shared test media pool (`scripts/bootstrap-test-media.ts`) and `TEST_SUB` install team for auto-promote. Batch cleanup via `testSeedBatchId` FKs.

---

### `lib/parse-spreadsheet-number.ts` — UPM / Excel numeric strings
Parses numbers pasted from US-locale spreadsheets: strips comma thousands separators before `parseFloat`. Used by UPM QTY validation (`lib/upm-parse.ts`), live preview edits (`CreateProjectModal`), and `mapRowToColumns` decimal fields (`lib/project-rows.ts`). Does not handle European `1.234,56` format.

```typescript
import { parseSpreadsheetNumber, isValidSpreadsheetNumberString } from "@/lib/parse-spreadsheet-number";

parseSpreadsheetNumber("1,200"); // 1200
isValidSpreadsheetNumberString("1,200"); // true
```

---

### `lib/sub-scopes.ts` — Sub-Scope Service
Business logic for `ProjectSubScope` (definitions) and `ProjectSubScopeInstance` (per-row tracking).

```typescript
import {
  createSubScopesWithInstances,
  getSubScopesForProject,
  hasSubScopeInstances,
  autoCreateInstancesForNewRows,
} from "@/lib/sub-scopes";

// Create sub-scope definitions + auto-create instances for all matching rows
await createSubScopesWithInstances(db, {
  projectId, unitType, scopeTypeId,
  subScopes: [{ name: "Kitchen Cabinetry" }, { name: "Bath Cabinetry" }],
  createdById: session.user.id,
});

// List all definitions for a project grouped by (unitType, scopeType)
const groups = await getSubScopesForProject(db, projectId);

// Check if a row is blocked from direct stage/status updates
const blocked = await hasSubScopeInstances(db, rowId); // true → return 409

// Backfill instances for newly-uploaded rows
await autoCreateInstancesForNewRows(db, projectId, newRowIds);
```

**Key rules:**
- `createSubScopesWithInstances` requires ≥2 sub-scope names and at least 1 matching row in the project.
- All DB writes use array-form `$transaction([...])` (PgBouncer-safe).
- `hasSubScopeInstances` is used by `PATCH /api/projects/[id]/units/[rowId]` before any `scopeStage`/`scopeStatus` write.
- `autoCreateInstancesForNewRows` is non-fatal — failures are logged as warnings so UPM uploads always succeed.

---

### `lib/project-rows.ts` — UPM Row Processing
Handles the transformation from parsed Excel rows to DB records.

```typescript
import { insertProjectRows, mapRowToColumns, rowKey } from "@/lib/project-rows";

// insertProjectRows — bulk insert from parsed UPM data
await insertProjectRows(projectId, parsedRows);

// mapRowToColumns — maps raw Excel column index → named field
const mapped = mapRowToColumns(rawRow);

// rowKey — generates a stable dedup key per row (building+level+unit+desc)
const key = rowKey(row);
```

---

### `lib/project-row-global-search.ts` — Field Tracker “all columns” search
Builds Prisma `WHERE` clauses and optional `?search=` normalization for `GET /api/projects/[id]/units`. Matches `project_rows` string fields plus related lookup `name`/`code` (scope, location, cost, installer, UOM). Tour demo filtering uses `tourDemoRowMatchesGlobalSearch`.

---

### `lib/unit-scope-progress.ts` — Unit install-complete progress
Pure helpers for **Field Tracker unit cards**: each scope is **one equal share** of 100%. Only rows with **`scopeStage === INSTALL`** and **`scopeStatus === COMPLETE`** count as filled. Other stage/status combinations do not advance the bar (workflow only). Data comes from `project_rows.scopeStage` / `scopeStatus` (Prisma enums), not separate ID tables.

```typescript
import {
  unitInstallCompletePercent,
  countInstallCompleteScopes,
  type ScopeForUnitProgress,
} from "@/lib/unit-scope-progress";

// `scopes` should match `ScopeStage` / `ScopeStatus` (same as project row APIs)
const pct = unitInstallCompletePercent(scopes); // 0–100, rounded
const done = countInstallCompleteScopes(scopes);
```

Used by `components/projects/UnitCards.tsx` for list rows, modals, and mobile card progress UI (grid uses per-scope tiles instead of the aggregate bar).

---

### `lib/location-builder-display.ts` — Build phase / area display helpers
Pure helpers for **Location Builder** metadata on the units page. Treats blank and `"0"` as undefined. **`cardLocationBuilderFields`** resolves per-card phase and area from the card fields or the first scope row that defines them. **`groupIntoCards`** (in `UnitCards.tsx`) merges non-empty phase/area from later scope rows when the first row for a unit is blank. **`sharedLocationBuilderFields`** returns uniform phase/area across a card set for level/building header suffixes. Used by `LocationBuilderMeta` and `UnitCards` level/building bars.

---

### `lib/scope-square-style.ts` — Grid scope mini-squares
Pure helpers for **Field Tracker grid mode**: abbreviation text (`scopeType.code` or initials), semantic enum, and CSS token choices (fill/border, dashed until INSTALL+COMPLETE, **FAILED inspection** over **BLOCKED**). Consumed by `components/projects/ScopeStatusSquare.tsx` and `UnitCards` grid tiles.

---

### `lib/scope-combined-options.ts` — Combined scope stage+status picker options
Centralises the combined stage+status picker options used across all scope pickers in `UnitCards.tsx`.

Key exports:
- `CombinedScopeOption` — interface describing a picker row (key, label, stage, status, colors)
- `SCOPE_COMBINED_OPTIONS` — full 4-item array: In Staging, In Assembly, Install: In Progress, Install: Complete
- `getScopeCombinedOptions(skipAssembly)` — returns the filtered list (omits "In Assembly" when `skipAssembly` is true)
- `scopeTypeSkipsAssemblyStage(scopeType)` — returns true for countertop scopes (`code === "TOP"` or name contains "countertop")
- `effectiveStageStatusForCombinedUi(stage, status, skipAssembly)` — remaps legacy `ASSEMBLY/IN_PROGRESS → STAGING/IN_PROGRESS` for display when `skipAssembly` is true; identity otherwise
- `combinedOptionDisplay(stage, status, skipAssembly?)` — returns display metadata (label, color, bg) respecting the remap
- `isCombinedMatch(stage, status, opt, skipAssembly?)` — returns true when the effective stage+status matches the given option

```typescript
import { scopeTypeSkipsAssemblyStage, getScopeCombinedOptions } from "@/lib/scope-combined-options";
const skipAssembly = scopeTypeSkipsAssemblyStage(scope.scopeType);
const options = getScopeCombinedOptions(skipAssembly);
```

Countertop scopes (scopeType code "TOP") skip the Assembly stage in the picker UI entirely. Legacy ASSEMBLY/IN_PROGRESS data is remapped to display as "In Staging" without any database write.

---

### `lib/scope-install-complete-gate.ts` — Client install-complete blocking (FB-0027)
Mirrors server rules for when open blocking issues prevent marking install complete (verified or unverified). Used by `UnitCards` pickers, offline `useScopePatch` enqueue guard, and queued status edit sheets.

Key exports:
- `isTransitionToInstallCompleteScope(prevStage, prevStatus, nextStage, nextStatus)` — true when moving into INSTALL+COMPLETE or INSTALL+PENDING_VERIFICATION
- `scopeRowHasOpenBlockingIssueForInstallComplete(issues, rowId)` — snapshot/issue-list check for row-level blocking
- `subScopeInstanceHasOpenBlockingIssueForInstallComplete(issues, rowId, instanceId)` — row or sub-scope instance blocking

Companion: `isInstallCompleteCombinedOptionKey(key)` in `lib/scope-combined-options.ts` identifies both install-complete picker keys.

---

### `lib/upm-parse.ts` — UPM Excel Parser
Parses the Unit Plan Matrix Excel file into `ProjectRow[]`.

```typescript
import { parseUPM, parseUPMFromFile } from "@/lib/upm-parse";

// From a File object (client-side upload)
const rows = await parseUPMFromFile(file);

// From a buffer (server-side)
const rows = parseUPM(buffer);
```

Returns an array of raw row objects that match the UPM spreadsheet column structure. Pass to `insertProjectRows()` for DB persistence.

---

### `lib/upm-export.ts` — Field Tracker spreadsheet export
Builds a re-uploadable `.xlsx` from unit rows (same header names accepted by `parseUPM` / `mapRowToColumns`).

```typescript
import {
  fieldTrackerRecordFromProjectRow,
  downloadFieldTrackerXlsx,
  FIELD_TRACKER_IMPORT_HEADERS,
} from "@/lib/upm-export";

const records = apiUnits.map(fieldTrackerRecordFromProjectRow);
downloadFieldTrackerXlsx(records, "MyProjectName");
```

Used by the Field Tracker table view (`ProjectDetailView` on the project UPM route). The workbook has a **UPM** data sheet and a **Readme** sheet (English) that explains merge / append / overwrite for local upload testing. Numeric cells are rounded for stable re-import. Scope stage / inspection status are app-only and are not written to the file.

### `lib/activity-hidden-events.ts` — Activity feed exclusion list
Shared `ActivityEventType` exclusions for activity GET routes and PDF/XLSX exports: markup annotation churn, legacy pre-form `CLEAR_INSPECTION_*` toggles, and (for non-squad roles) security rate-limit events.

### `lib/activity/hydrate-activity-page.ts` — Activity list read-time enrichment
Chains inspection → subcontractor → media preview hydration for activity GET routes and offline prefetch.

```typescript
import { hydrateActivityPage } from "@/lib/activity/hydrate-activity-page";

const enriched = await hydrateActivityPage(page);
```

### `lib/activity-media-metadata.ts` — Activity media preview hydration
Server-side: batches `mediaAttachment` / `inspectionAnswerMedia` lookups and merges `mediaPreviews` into event metadata at read time (never persisted on the row). Handles visible events: issues, observations, inspections, and unit album uploads.

### `lib/activity-media-previews.ts` — Client-safe preview helpers
`readActivityMediaPreviews()`, `ACTIVITY_MEDIA_PREVIEWS_KEY`, `ACTIVITY_MEDIA_PREVIEW_LIMIT` — shared by `ActivityMediaStrip` and export formatters; no DB imports.

### `lib/export/activity-export-format.ts` — Activity export row formatting
Shared summary/location/event-label helpers for PDF and Excel activity log exports. **No Puppeteer dependency** — safe to import from XLSX routes.

### `lib/export/activity-xlsx.ts` — Activity log Excel export
Builds a tabular `.xlsx` from activity log events for project and dashboard exports. Uses `lib/export/activity-export-format.ts` for row text.

```typescript
import { buildActivityXlsx } from "@/lib/export/activity-xlsx";

const buffer = buildActivityXlsx({
  events,
  projectLabelById, // optional — adds Project column for dashboard exports
});
```

Used by `POST /api/projects/[id]/activity/export-xlsx` and `POST /api/activity/export-xlsx`.

### `lib/field-tracker-units.ts` — Field Tracker batch size
Exports `FIELD_TRACKER_UNITS_PAGE_LIMIT` (50) and `FIELD_TRACKER_SEARCH_DEBOUNCE_MS` (650) for `GET /api/projects/[id]/units?limit=` and Field Tracker table search debouncing — shared by the **units** page (`UnitCards`) and **table** (`ProjectDetailView`).

### `lib/locations-list-filters-session.ts` — Locations page filter persistence (client)
Per-project `sessionStorage` read/write for the **Locations** (`UnitsPageClient`) toolbar search and filter panel (`ActiveFilters`). Key: `locationsListFilters:<projectId>`. Survives in-tab navigation; cleared when the tab closes. Mirrors `lib/projects-list-filters-session.ts` but scoped per project.

```typescript
import {
  readLocationsListFiltersSession,
  writeLocationsListFiltersSession,
} from "@/lib/locations-list-filters-session";

const saved = readLocationsListFiltersSession(projectId);
writeLocationsListFiltersSession(projectId, { searchQuery, filters });
```

### `lib/bulk-scope-type-groups.ts` — Bulk sheet scope-type rows
`computeBulkScopeTypeGroups`: groups selected `ScopedRow`s by canonical scope type for `BulkActionsSheet`. **Unit counts** are distinct `unitKey`s (multiple project rows of the same type in one unit count as one unit).

---

## Unifier Integration

### `lib/unifier/projects-list-header.ts` — Unifier picker response header
Exports `CC_UNIFIER_LINKED_COUNT_HEADER` (`X-CC-Unifier-Linked-Count`): set on `GET /api/unifier/projects` with the count of Command Center projects already linked to Unifier (excluded from the JSON list). The Create Project modal reads it to explain “available to import” vs already imported.

---

### `lib/unifier/client.ts` — PDS API Client
Low-level Unifier API client. Handles pagination and auth.

```typescript
import { fetchAllRows } from "@/lib/unifier/client";

const rows = await fetchAllRows(endpoint);             // All rows — unbounded pagination
const rows = await fetchAllRows(endpoint, { maxRows: 200 }); // Stop after 200 rows
```

**Always pass `maxRows` when you plan to filter or slice afterward.** Fetching unbounded rows then calling `.slice()` or in-memory filter causes full-table scans. Example: a 5000-row cap for task routes; `limit * 10` for preview/explore routes.

When `UNIFIER_MOCK=true`: returns safe static data without hitting the real API.

---

### `lib/unifier/service.ts` — Unifier Business Logic
Higher-level service built on top of the client.

```typescript
import {
  getProjects,
  getProjectByPid,
  getSysProjectStartDateByPidMap,
  mapUnifierStatus,
  unifierDateStringToIso,
} from "@/lib/unifier/service";

const projects = await getProjects();                         // Shells + warms PID → STARTDATE cache
const startDates = await getSysProjectStartDateByPidMap();   // Same TTL; single fetch if cold
const project = await getProjectByPid("UE-PRJ-12345");       // Single shell from cached list
const status = mapUnifierStatus(unifierStatusCode);          // Maps Unifier status → ProjectStatus
// unifierDateStringToIso — normalize PDS date strings to YYYY-MM-DD (merge fallback)
```

**`UnifierProject.location`** (Create Project picker, confirm step, API `siteLocation`) is filled from **`CP_GEN_ADDRESS_TB2000`**, not **`UUU_LOCATION`** — the latter is often an internal/site code (e.g. numeric), not a human address line. **`formatUnifierSiteLocation(address, state)`** (`lib/unifier/site-location-display.ts`) appends **`CP_GEN_STATE_PD`** when present and not already at the end of the address string.

### `lib/unifier/site-location-display.ts` — Address + state for UI
```typescript
import { formatUnifierSiteLocation } from "@/lib/unifier/site-location-display";

formatUnifierSiteLocation(shell.location, shell.state); // e.g. "100 Main St, TX"
```
Used by `lib/project-unifier-merge.ts` and the Create Project confirm step.

---

### `lib/project-site-location-backfill.ts` — `siteLocation` vs Unifier address
`siteLocationFromUnifierShell(address)` — returns trimmed string or `null` if Unifier has no address (skip DB update).

**Backfill script:** `scripts/backfill-project-site-location-from-unifier.ts` — `npm run backfill:site-location` (dry-run) / `npm run backfill:site-location:execute`. Needs `DATABASE_URL` + Unifier env (or `UNIFIER_MOCK=true`).

---

### `lib/unifier/schema-definition.ts` — Unifier Table Schema Definitions
Typed constant containing all available Unifier PDS tables and their columns.
Source of truth for the DevTools Explorer allowlist and column metadata.

```typescript
import { UNIFIER_SCHEMA, getTableDef, ALLOWLISTED_TABLE_NAMES } from "@/lib/unifier/schema-definition";

const allTables = UNIFIER_SCHEMA;                                 // 30+ table definitions
const def = getTableDef("UNIFIER_UXSUB");                        // Single table def
const allowed = ALLOWLISTED_TABLE_NAMES.has("UNIFIER_UXSUB");   // Allowlist check
```

Each entry: `{ tableName, displayName, description, columns[], integrated?, isLineItem? }`
Columns have `{ code, label }` — `code` is the PDS query column name, `label` is human-readable.

---

### `lib/unifier/users.ts` — Unifier User Service
Fetches Unifier user accounts and generates link suggestions.

```typescript
import { getUnifierUsers, suggestUserLinks } from "@/lib/unifier/users";

const users = await getUnifierUsers();                    // All users from UNIFIER_SYS_USER_INFO
const suggestions = await suggestUserLinks(ccUsers);      // Auto-match by email
// suggestions: [{ ccUserId, ccEmail, unifierUserId, unifierUsername, confidence: 'exact' }]
```

Cache: 5-minute TTL (same pattern as `service.ts`).

---

### `lib/unifier/subcontractors.ts` — Subcontractor directory + PO/pay-app raw fetches
```typescript
import {
  getSubcontractorsForPicker,
  getRawSubcontractors,
  getRawPurchaseOrders,
  getRawPayApplications,
} from "@/lib/unifier/subcontractors";

const list = await getSubcontractorsForPicker(); // UNIFIER_UXSUB → { id, name }[], cached 5m
```
Field Tracker stores the chosen `id` / `name` on `project_rows` (`unifierSubcontractorId` / `unifierSubcontractorName`).
Tables: `UNIFIER_UXSUB`, `UNIFIER_UXPOS`, `UNIFIER_UXSUM`. No normalization yet — returns raw rows.

---

### `lib/unifier/reports.ts` — Reports Service (Stub)
```typescript
import { getRawProjectStatusReports, getRawDailyActivityReports } from "@/lib/unifier/reports";
```
Tables: `UNIFIER_UXPSR`, `UNIFIER_UXUEDR`. No normalization yet.

---

### `lib/unifier/inspections.ts` — Inspections Service (Stub)
```typescript
import { getRawTurnAroundInspections, getRawClearanceInspections } from "@/lib/unifier/inspections";
```
Tables: `UNIFIER_UXTACIN`, `UNIFIER_UXCLEARI`. No normalization yet.

---

### `lib/unifier/financials.ts` — Financials Service (Stub)
```typescript
import { getRawContracts, getRawPotentialChangeOrders } from "@/lib/unifier/financials";
```
Tables: `UNIFIER_UXUECON`, `UNIFIER_UXPCO`. No normalization yet.

---

### `lib/unifier/schedule.ts` — Schedule Service (Stub)
```typescript
import { getRawP6Activities } from "@/lib/unifier/schedule";
```
Table: `UNIFIER_P6_ACTIVITY`. No normalization yet.

---

### `lib/unifier/locations.ts` — Locations Service (Stub)
```typescript
import { getRawLocations } from "@/lib/unifier/locations";
```
Table: `UNIFIER_UXLOC`. No normalization yet.

---

## AI / Gemini

### `lib/ai/gemini.ts` — Gemini AI Client
Wraps the `@google/generative-ai` SDK. Guarded by `isAIEnabled()` which checks for `GEMINI_API_KEY`.

```typescript
import {
  isAIEnabled, analyzeProjectUnits, generateBriefing, analyzePortfolio,
  freeformPrompt, generateReleaseTour, generateReleaseVerification,
  generateDailyBriefingReport, analyzeUnifierTable,
} from "@/lib/ai/gemini";
import type { UnifierTableInput } from "@/lib/ai/gemini";

if (!isAIEnabled()) { /* GEMINI_API_KEY not set */ }

const analysis = await analyzeProjectUnits(unitRows, projectSummary);
const briefing = await generateBriefing(unitRows, projectSummary);
const portfolio = await analyzePortfolio(allProjects);
const result = await freeformPrompt(userPrompt);

// Auto-generate a guided tour for a release
const steps = await generateReleaseTour({ title, branch, environment, changes });

// Generate a QA verification checklist for a release
const checklist = await generateReleaseVerification({ title, branch, environment, changes });

// Generate Phil's daily morning briefing (two-stage: search grounding + structured JSON)
const report = await generateDailyBriefingReport(ctx);

// Analyze a Unifier table's schema + sample rows for dashboard integration guidance
const tableAnalysis = await analyzeUnifierTable(tableDef, sampleRows);
```

Types live in `lib/ai/types.ts`: `AIUnitCard`, `AIUnitScopeRow`, `InsightReport`, `ReleaseTourInput`, `GeneratedTourStep`, `GeneratedVerificationStep`, `DailyBriefingReport`, `DailyBriefingContext`, `UnifierTableAnalysis`.

### `lib/ai/gemini-files.ts` — Gemini Files API uploads
Multipart upload + poll-until-`ACTIVE` helpers used by feedback assist: `uploadVideoForFeedback`, `uploadImageForFeedback`. Returns `UploadedFileRef` (`fileUri`, `mimeType`, `expiresAt`) for `fileData` parts in `generateContent`.

Feedback-assist Gemini entry points also include `generateFeedbackAssistTurn`, `generateFeedbackAssistVideoTurn`, and `generateFeedbackAssistCalibrate` (same `FEEDBACK_ASSIST_MODEL`).

**`analyzeUnifierTable(tableDef, sampleRows, columns): Promise<UnifierTableAnalysis>`**
- Sends a Unifier table's schema + up to 10 sample rows to `gemini-2.5-flash`
- Returns structured analysis: `integrationStatus`, `relatedDashboardFeatures`, `suggestedIntegrations`, `newFeatureIdeas`, `dataQualityNotes`
- Automatically redacts PII fields (EMAIL, TOKEN, SECRET, etc.) before sending to Gemini
- Called by `POST /api/devtools/unifier-analyze` from the Unifier Explorer DevTools panel
- `UnifierTableInput` type is exported directly from `lib/ai/gemini.ts` (not `lib/ai/types.ts`)

**`generateReleaseTour(release: ReleaseTourInput): Promise<GeneratedTourStep[]>`**
- Uses `gemini-2.5-flash` with a strict JSON schema to generate one tour step per meaningful user-facing change
- Each step includes `pageUrl` (locale-prefixed, e.g. `/en/projects`), `elementSelector` (best-effort CSS selector), `title`, `description`, and `voiceText`
- Falls back to a single overview step if no routes are present in the changes list
- Throws if `GEMINI_API_KEY` is not set — callers should guard with `isAIEnabled()` first

**`generateDailyBriefingReport(ctx): Promise<DailyBriefingReport>`**
- Two-stage pipeline: Stage 1 uses `gemini-2.0-flash` with Google Search grounding for live tech pulse; Stage 2 uses `gemini-2.5-flash` with responseSchema for the full structured briefing JSON
- Takes ~15–30s — returns `DailyBriefingReport` matching the shape in `lib/ai/types.ts`

**Rate limiting:** The `/api/ai/analyze` route enforces a 30-second per-project cooldown (in-memory `Map` — resets on server restart).

---

## DevTools Guards

### `lib/devtools-env.ts`
```typescript
import { isDevToolsAllowed } from "@/lib/devtools-env";
// Returns true only in dev/admin environments; false in production
```

### `lib/devtools-auth.ts`
```typescript
import { requireDevToolsAdmin, requireDevToolsAdminWithSession } from "@/lib/devtools-auth";

// Simple guard (no session needed beyond auth check):
const guard = await requireDevToolsAdmin();
if (guard instanceof NextResponse) return guard;

// Combined guard + session (preferred when you need userId):
const { guard, session } = await requireDevToolsAdminWithSession();
if (guard) return guard;
const userId = session.user.id;
```
Use `requireDevToolsAdminWithSession()` in routes that need the user ID — it calls `auth()` only once.

### `lib/api-logger.ts` — Structured API Route Logger
Emits structured `[API]` prefixed log lines for every route outcome. Suppressed in production and in Vitest runs.

```typescript
import { logApi, apiTimer } from "@/lib/api-logger";

const t = apiTimer();
// ... route logic ...
logApi("POST", "/api/projects", 201, 'Created "X"', t(), responseData);
// → [API] POST /api/projects → 201 ✓ Created "X" (34ms)\nResponse: {...}
```

Active when `NODE_ENV !== "production"` OR `isDevToolsAllowed()`. Messages with the `[API]` prefix are detected by `ServerLogs.tsx` for richer DevTools styling. Status ≥ 500 → `console.error`; 4xx → `console.warn`; 2xx/3xx → `console.info`.

---

### `lib/dev-logger.ts` — Dev Log Ring Buffer / SSE Interceptor
Patches global `console` methods to capture log entries into a 500-entry in-memory ring buffer and push to any active SSE subscribers. Used by the DevTools Server Logs panel.

```typescript
import { getLogBuffer, subscribeToLogs } from "@/lib/dev-logger";

const snapshot = getLogBuffer();                          // LogEntry[] — current buffer
const unsub = subscribeToLogs((entry) => send(entry));   // Subscribe to live entries
unsub();                                                  // Unsubscribe when SSE closes
```

Buffer persists on `globalThis` to survive Next.js hot-reloads. Active only in non-prod (`NODE_ENV !== "production"` OR `isDevToolsAllowed()`). Max 500 entries; older entries are evicted.

---

### `lib/changelog-parser.ts`
Parses `CHANGELOG.md` into structured `ParsedRelease` objects for the Release Verification system.

```typescript
import { parseChangelog, inferRoute } from "@/lib/changelog-parser";

const releases = parseChangelog(content);                        // [Merged] entries only
const all = parseChangelog(content, { includeInProgress: true }); // + [In Progress]
const route = inferRoute("feat/units-page", "Unit cards");       // → "/projects"
```

### `lib/msw/browser.ts` + `lib/msw/browser-handlers.ts`
MSW browser-side service worker for **sandbox mode** (DevTools Release Checklist tab).

```typescript
import { startSandbox, stopSandbox, isSandboxActive } from "@/lib/msw/browser";
await startSandbox();   // Intercepts API mutation calls; real data is read-only
await stopSandbox();    // Restores normal API calls
```

Handlers are defined in `lib/msw/browser-handlers.ts`. Only mutation routes are mocked (POST/PATCH/DELETE); GETs pass through so the UI still shows real data.

---

## Validation Schemas

Shared Zod schemas (used on both server and client):

| File | Exports |
|------|---------|
| `lib/validations/auth.ts` | `loginSchema`, `registerSchema`, `acceptInviteSchema` |
| `lib/validations/invite.ts` | `createInviteSchema` |

**Import convention:** Always import from `@/lib/validations/<file>` in forms and route handlers to stay in sync.

---

## i18n Infrastructure

| File | Purpose |
|------|---------|
| `i18n/routing.ts` | Defines supported locales (`en`, `es`) and default locale |
| `i18n/request.ts` | Server-side locale resolution for `getTranslations()` |
| `i18n/navigation.ts` | Re-exports locale-aware `Link`, `useRouter`, `usePathname` |

Always import navigation from `@/i18n/navigation`, not from `next/link` or `next/navigation`.

---

### `lib/azure-keyvault.ts` — Azure Key Vault Client
Fetches Unifier API credentials (`UNIFIER_CLIENT_ID`, `UNIFIER_CLIENT_SECRET`) from Azure Key Vault at runtime.

```typescript
import { getUnifierCredentials } from "@/lib/azure-keyvault";
const { clientId, clientSecret } = await getUnifierCredentials();
```

**Behavior:**
- Uses `@azure/keyvault-secrets` `SecretClient` with `DefaultAzureCredential`
- Module-level cache: credentials are fetched once per server process and reused
- Fallback: if `AZURE_KEYVAULT_URL` is not set, falls back to `UNIFIER_CLIENT_ID` / `UNIFIER_CLIENT_SECRET` env vars directly
- Excluded from test coverage (external service, credential-dependent)

---

---

### `lib/github-activity.ts` — GitHub Activity Fetcher (Morning Briefing)
Fetches merged PRs and commits from the `cp-build-dev-ops/command-center-reboot` repo for a given date. Used exclusively by the Morning Briefing pipeline.

```typescript
import { fetchYesterdayActivity } from "@/lib/github-activity";

const { mergedPRs, recentCommits } = await fetchYesterdayActivity(yesterday);
```

**Behavior:**
- Uses `GITHUB_TOKEN` env var via `Authorization: Bearer` header
- Returns empty arrays (never throws) if `GITHUB_TOKEN` is missing or the GitHub API fails
- `fetchMergedPRs(date)` — looks back 60 recently-closed PRs, filters by `merged_at` on the given UTC date
- `fetchRecentCommits(date)` — fetches commits using `since`/`until` query params for the UTC day window
- `fetchYesterdayActivity(date)` — convenience wrapper that calls both in parallel

**Env var required:** `GITHUB_TOKEN` (set in Railway dev + prod)

---

## Tour System

### `lib/site-tour-steps.ts` — Site Tour Step Definitions

Source of truth for the hardcoded site walkthrough tour. Exports the full step list and all related types.

```typescript
import { SITE_TOUR_STEPS } from "@/lib/site-tour-steps";
import type { SiteTourStep, TourAutoInteract, LocalizedString } from "@/lib/site-tour-steps";
```

**Key contracts:**
- Each step's `title`, `description`, and `voiceText` are `LocalizedString` objects `{ en: string, es: string }` — NOT plain strings. `TourPlayer` calls `localize(field, lang)` to extract the correct locale at runtime.
- `pageUrl` may contain the `{{PROJECT_ID}}` template literal — the API route (`GET /api/site-tour`) and `TourPlayer` replace it with `TOUR_DEMO_PROJECT_ID` at launch time.
- `autoInteract` field (optional): `{ type: "type" | "click" | "dispatch", text?, eventName?, cleanupOnLeave? }` — drives `TourPlayer`'s automated interactions during the tour.
- Steps are ordered by `step.order` (1-based). `TourPlayer` sorts by `order` before playback.

---

### `lib/tour-demo-data.ts` — In-Memory Tour Demo Project

Defines fully in-memory fake data used only during the site tour. **No DB records are created.**

```typescript
import {
  TOUR_DEMO_PROJECT_ID,  // "tour-demo-project" — reserved sentinel string
  TOUR_DEMO_PROJECT,
  TOUR_DEMO_UNIFIER_PROJECT,
  TOUR_DEMO_UNITS,
  TOUR_DEMO_UPM_HEADERS,
  TOUR_DEMO_UPM_ROWS,
} from "@/lib/tour-demo-data";
import type { UpmSpreadsheetRow } from "@/lib/tour-demo-data";
```

**Critical contract — `TOUR_DEMO_PROJECT_ID`:** The string `"tour-demo-project"` is a reserved sentinel. Any API route or page component that receives this as a `projectId` must short-circuit to return in-memory demo data instead of querying Prisma. Current locations that implement this bypass: `GET /api/projects/[id]`, `GET /api/projects/[id]/units`, `GET /api/site-tour`, and `app/[locale]/(project)/projects/[id]/page.tsx`.

**Shared localStorage key — `cc-tour-step-edits`:** `SiteTourInspector` writes edited step content under this key. `TourPlayer` reads and merges it on every site tour launch. Never write to this key from other components.

---

## Offline

### `lib/offline/modules.ts` — Offline Module Registry
Defines the list of data modules users can choose to cache for offline use.

```typescript
import { OFFLINE_MODULES, OFFLINE_MODULE_MAP, ALWAYS_CACHED_MODULES } from "@/lib/offline/modules";

// All available modules (shown in OfflinePreferences UI)
const modules = OFFLINE_MODULES;          // OfflineModule[] with id, label, description, estimatedSize, available, category

// Fast lookup by id
const teamModule = OFFLINE_MODULE_MAP["team-directory"];

// Always-cached regardless of user preference
ALWAYS_CACHED_MODULES  // → ["my-profile"]
```

`available: false` modules appear in the UI but are disabled until the backing tool exists. Categories: `"core"` | `"projects"` | `"reporting"`. The snapshot API route (`GET /api/offline/snapshot`) uses these IDs to decide what data to bundle. Per-project bundle also includes implicit modules `subcontractors`, `published-forms`, `inspection-submissions`, `inspections-reports`, `activity-pages`, `entity-comments`, `sub-scopes`, and `custom-site-locations` (see `PROJECT_BUNDLE_MODULE_IDS`). `lib/offline/project-warm-paths.ts` lists HTML sub-pages and per-project API URLs warmed during pre-download (includes `/log/inspections`, inspections-report API; excludes `/reports/*`). Auto-warm on project entry uses `warmHtml: "minimal"` (en-only subset); full pre-download uses `warmHtml: true`. Background resync album policy: once per session all units, then session-touched units only (`lib/offline/album-warm-session.ts`).

### `lib/project-units-serialize.ts` — Unit Row Serialization
Shared Prisma include + `serializeUnitRow` used by `GET /api/projects/:id/units` and `serializeProjectUnitsForSnapshot()` for offline bundles. Keeps cached unit rows aligned with live API shape (`unifierSubId`, `installer`, `subScopeInstances`, `issueMeta`, grid inspection enrichment).

### `lib/issues/responsible-parties.ts` — Multi-party issue tags
Normalizes `responsibleParties` input (dedupe, max 12), resolves legacy single `responsibleParty` request field to catalog string codes, and syncs `issue_responsible_party_tags` join rows (`partyCode`) while keeping `responsiblePartyCode` set to the first party.

### `lib/issues/serialize-issue-parties.ts` — API `responsibleParties` array
Maps Prisma `responsiblePartyTags.partyCode` (or fallback `responsiblePartyCode`) into the `responsibleParties` string-code array on issue list/detail/offline snapshot responses.

### `lib/issues/issue-api.ts` — Issue API client field aliases
Mirrors `lib/observations/observation-api.ts`: maps Prisma `issueTypeCode`/`responsiblePartyCode` to client-facing `issueType`/`responsibleParty` on issue list, detail, and create responses (`serializeIssuesForApiClient`, `serializeIssueForApiClient`).

### `lib/issues/issue-catalog.ts` — Issue type + party catalog validation
Fetches active/manage issue type and responsible party catalog rows; `assertActiveIssueTypeCode` / `assertActivePartyCodes` guard issue create/update/bulk routes against inactive or unknown catalog codes.

### `lib/observations/observation-catalog.ts` — Observation type catalog validation
Fetches active/manage observation type catalog rows; `assertActiveObservationTypeCode` guards observation create/update routes against inactive or unknown type codes.

### `lib/project-settings/reorder-catalog.ts` — Catalog reorder helper
Shared client helper for catalog manage UIs: computes next `sortOrder` values after drag-and-drop reorder and posts the ordered code list to catalog manage API routes.

### `lib/issues/issueDisplay.ts` — Issue label helpers
Includes `formatResponsibleParties()` for comma-separated display of multiple responsible parties in logs, PDF export, and detail modals.

### `lib/issues/missing-materials.ts` — Missing Materials issue fields
Zod schemas and helpers for `MISSING_MATERIALS` issues: `validateMissingMaterialsForIssueType()`, `missingMaterialsFieldsComplete()` (form gating), `parseMissingMaterialQuantity()`, `resolveSelectedScopeUom()` (UOM from tagged scopes), and `formatMissingMaterialQuantityDisplay()` for detail views.

### `lib/offline/snapshot-cache.ts` — Snapshot Cache Reader
Client-side helpers to locate and parse entries in Cache Storage `offline-data-v1`. Prefer project-scoped snapshot keys (`?projectIds=` includes current project). Used by unit list, issues log, subcontractor picker, published-forms fallback, inspection submissions (`submissionsApi`), and inspections log (`InspectionsReportClient` reads `inspections-reports`).

### `lib/offline/snapshot-project-reads.ts` — Snapshot Read Helpers (Client)
Typed readers for project-scoped snapshot modules: activity first page (`activity-pages`), issues/observations lists, project-level field notes, projects list, entity comments, and album rows. Used by log clients, hub cards, `CommentThread`, and `ProjectsTable` when live fetch fails offline.

### `lib/activity/fetch-activity-list-for-offline.ts` — Activity Snapshot Serializer (Server)
First-page activity fetch for offline snapshot bundling (`activity-pages` module).

### `lib/offline/serialize-entity-comments-for-snapshot.ts` — Entity Comments Snapshot (Server)
Serializes issue and observation comment threads into the `entity-comments` snapshot module.

### `lib/offline/album-warm-session.ts` — Session album warm policy
- `planBackgroundAlbumWarm()` — first background resync per project per tab warms all unit album API routes; later resyncs warm only `markUnitAlbumTouched()` unit refs
- `markUnitAlbumTouched()` — called from `UnitCards`, `UnitMediaViewRow`, `UnitPhotoAlbum` when user views a unit
- Full pre-download (`warmHtml: true`) bypasses this and always warms every unit

### `lib/offline/pre-download-batch.ts` — Pre-download concurrency
Prod-safe batch sizes for manual pre-download: core APIs (8), album APIs (12), HTML sub-pages (6), hub iframe parallel (2), media (10).

### `lib/offline/warm-field-media-urls.ts` — Field Media Prefetch
During full pre-download, prefetches attachment/storage URLs from snapshot JSON into the runtime cache so photos load offline after warm completes. `collectFieldMediaUrls()` lists capped URLs for progress; runs in parallel with HTML sub-page warm.

### `lib/offline/pages-cache.ts` — pages-v1 + offline navigation
Stores warmed HTML in `pages-v1` and prefetches linked `/_next/static/` assets. `openCachedProjectPage()` uses `location.assign` (not `document.write`) so CSS/JS load correctly offline.

### `lib/offline/warm-page-via-frame.ts` — Full document warm
Loads project hub pages in a hidden iframe during pre-download so the browser (and SW) cache CSS/JS/font chunks that a bare HTML fetch misses.

### `lib/offline/run-batched-frame-loads.ts` — Parallel iframe warm
Runs `warmPageViaHiddenFrame()` in small parallel batches (default 2) for en/es hub pages during pre-download.

### `lib/inspections/sync-network-errors.ts` — Offline sync error classification
Detects transient fetch / service-worker failures so queued inspections defer without a false `lastSyncError` in the upload queue.

### `lib/offline/warm-page-static-assets.ts` — Static chunk prefetch
Parses warmed HTML for `/_next/static/` URLs and caches them in `next-static-assets` during pre-download. Cache lookups use `ignoreSearch: true` so dev `?v=` timestamps still match offline.

### `public/offline-sw-routes.js` — Dev offline SW routes
When `PWA_DEV_ENABLED=true`, imported into the dev SW to serve `pages-v1` + `next-static-assets` (with `ignoreSearch` for static) before next-pwa's dev NetworkOnly rule.

### `lib/offline/offline-prefs-local.ts` — Offline Prefs localStorage Mirror
Persists `offlineProjectIds` + `projectSyncedAt` to `localStorage` so pre-download state survives reload while offline. `isProjectPreDownloaded()` combines both signals.

### `lib/offline/offline-project-navigation.ts` — Offline Project Opens
When offline and pre-downloaded, tries `openCachedProjectPage()` first, then production SW `location.assign`. Returns `unavailable` only when neither can open — UI shows a short user-facing message, never dev instructions.

### `lib/offline/connectivity.ts` — Connectivity Quality
Shared probe for offline vs slow vs good (`GET /api/connectivity`, 3s budget — no DB). `probeConnectivityQuality()` / `useConnectivityMode` drive the slow-connection banner; `isConnectionGood()` gates `background-sync` snapshot refresh. `fetchWithTimeout()` caps inspection media uploads in `inspection-media-blobs.ts`. `subscribeConnectivityQuality()` notifies `useInspectionSync` on slow→good so pending inspections retry. **Inspection sync is not gated on probe quality** — `tryFlushPending()` runs whenever `navigator.onLine` (coalesced in-flight), on mount, reconnect, `visibilitychange` when the tab is visible, slow→good, and every 60s while visible.

### `lib/offline/browser-online-status.ts` — Shared online flag
Single `useSyncExternalStore` source for `useOfflineStatus` (all consumers share one snapshot). Reconciles `navigator.onLine` every 2s while visible, on tab focus/`pageshow`, after successful mutation flush, and via **`probeConnectivityQuality({ ignoreNavigatorOffline: true })`** when the browser still claims offline after airplane mode (iOS lag).

### `lib/offline/offline-upload-progress.ts` — Upload queue progress bus
Shared `{ done, total, currentItemId, phase, kind }` snapshot during mutation + inspection flush. **`OfflineIndicator`** strip and **`OfflineCachePanel`** row highlights subscribe via `useSyncExternalStore`.

### `lib/inspections/inspection-media-blobs.ts` — Local-First Inspection Media
On submit, stores new photo/video `File` objects in `cc-offline-blobs` (`pendingBlobId` on `CapturedMediaItem`) without network uploads. `syncOne` resolves pending blobs and uploads via `fetchWithTimeout` before POSTing the inspection. Local blobs are deleted only after **all** pending media in a sync batch upload successfully (prevents slow-network partial failures from orphaning photos). `rehydratePendingInspectionMediaForDisplay()` restores thumbnails when reopening a queued inspection from the upload queue.

### `lib/inspections/reclassify-submission-calibration-eligibility.ts` — Reclassify UI eligibility (client-safe)
Pure helpers for scope hub / inspection detail: `isClearSubmissionForReclassify()`, `findDefaultCalibratedAgainstSubmissionId()`, `canReclassifyClearSubmissionToCalibration()`. No DB imports — safe for client bundles.

### `lib/inspections/reclassify-submission-calibration.ts` — Reclassify clear → calibration (server)
`reclassifyClearSubmissionToCalibration()` updates `templateSnapshot` category stub and `clearInspection` type/link for an existing synced clear submission. Used by `PATCH /api/inspection-submissions/[id]/reclassify-calibration` (`CALIBRATE_INSPECTION` permission).

### `lib/inspections/inspection-sync-status.ts` — Mobile Footer Sync Toast
Event bus consumed by `OfflineIndicator` bottom strip (via `OfflineSyncProvider`) — avoids Sonner toasts and duplicate top banners after form submit (clear inspections, documentation, retries).

### `lib/inspections/inspection-draft-discovery.ts` — Resume Draft Discovery
`listResumableLiveDrafts()` + `draftToStoredForm()` power the "Resume draft" shortcut in inspection start sheets without re-navigating category → scope → form.

### `lib/inspections/inspection-sync-failure-report.ts` — Sync failure strip copy
Maps `InspectionSyncAuthRequiredError`, `InspectionSyncExhaustedError`, `InspectionSyncPreservedError`, and `InspectionSyncRejectedError` to user-facing status for `InspectionSyncStatusStrip`. Uses translated `messages.*` titles for auth/exhausted/preserved paths. **`InspectionSyncPreservedError`:** server rejected upload but the row stays in IndexedDB (never auto-discarded on 400/422/409) — all inspection types including calibrations.

### `lib/offline/enqueue-mutation-with-blobs.ts` — Verified offline media enqueue
Shared helper for offline creates that attach photos: `storeVerifiedBlobIds()` (read-back after IDB write, rollback on partial failure), `enqueueMutationWithVerifiedBlobs()` (store → enqueue → verify blobs still readable), and `offlineAttachmentFieldsFromStaged()` for captions/annotations. Used by issue/observation modals, `observation-offline-save.ts`, and `CommentThread` offline comments. Mirrors the status-photo durability pattern so queue rows never reference missing `cc-offline-blobs` entries.

### `lib/offline/custom-site-location-offline.ts` — Offline custom location create
Queues `create-custom-site-location` mutations when airplane mode blocks POST, with optimistic `CustomSiteLocation` rows, offline duplicate-name checks against snapshot + pending queue, and snapshot write-through via `patchOfflineSnapshot`. After sync, `custom-site-unit-ref-remap.ts` remaps `@custom|offlineId|name` unitRefs on pending issues/observations to the server-assigned location id.

### `lib/offline/mutation-queue.ts` — Observations, issues, status changes
Queued mutations (`create-observation`, `create-issue`, `add-comment`, `unit-status`) are never deleted on 4xx or after `MAX_ATTEMPTS`; only successful uploads remove rows. `flushMutationQueue(_, { manual: true })` and `resetMutationAttemptsForManualRetry()` bypass the automatic retry cap.

### `lib/inspections/useInspectionSync.ts` — Pending inspection flush + UI state
Coalesced `tryFlushPending()` on mount/reconnect/visibility; flushes inspections **sequentially** (one at a time) with progress on `offline-upload-progress`. Exposes `pendingInspectionCount`, `flushPendingInspections({ manual })` (resets attempt counters). **`OfflineIndicator`** renders a persistent bottom **Sync now** bar while `pendingCount + pendingInspectionCount > 0`, flushing both queues.

### `lib/inspections/sync-error-history.ts` — Offline sync attempt log
Persists per-inspection sync failure attempts in IndexedDB (`syncErrorHistory` on pending inspection rows). `sortSyncErrorsLatestFirst()` orders attempts for activity cards and the sync error detail modal.

### `lib/inspections/report-inspection-sync-activity.ts` — Client activity upsert
Fire-and-forget `POST /api/projects/:id/activity/inspection-sync-failed` after a background sync failure so the project activity feed shows `INSPECTION_SYNC_FAILED` even when the device is offline-first.

### `lib/activity/activity-sync-failure.ts` — Activity feed sync-failure helpers
`isInspectionSyncFailureEvent()` detects `INSPECTION_SYNC_FAILED` and legacy `INSPECTION_SUBMITTED` + `syncFailed`. `filterPendingSyncFailuresDeduped()` drops optimistic pending rows when the server already logged the same `offlineMutationId`.

### `lib/activity/inspection-sync-failure-labels.ts` — Sync-failure canonical labels
`UNKNOWN_INSPECTION_FORM_NAME` and `INSPECTION_SYNC_FAILED_DEFAULT_MESSAGE` — shared English fallbacks for activity metadata and export descriptions when template name or error text is missing.

### `lib/activity/upsert-inspection-sync-failed-log.ts` — Server-side sync-failure activity row
Upserts (or creates) an `INSPECTION_SYNC_FAILED` activity log entry keyed by `offlineMutationId` in metadata. Used by `POST .../activity/inspection-sync-failed`.

### `lib/inspections/client-submission-category.ts` — Submission category labels
Normalizes inspection submission categories for grid/hub display and calibration outcome resolution.

### `lib/inspections/resolve-grid-submission-category.ts` — Grid tile submission category
Resolves which submission category drives scope grid tile styling (clear vs calibration vs documentation).

---

## Design Tokens

### `lib/design-tokens-server.ts` — Server-Side Token Persistence
Server-only helpers for reading and writing design token overrides to the `DesignTokenSnapshot` DB row.

```typescript
import {
  getDesignTokenOverrides,
  saveDesignTokenOverrides,
  buildInlineTokenCSS
} from "@/lib/design-tokens-server";

// Read current overrides (never throws — returns empty on DB error)
const { overrides, savedById, savedByName, savedAt } = await getDesignTokenOverrides();

// Persist new overrides
await saveDesignTokenOverrides({ "--primary-500": "#3b82f6" }, userId, userName);

// Build a safe CSS string for <style> injection
const css = buildInlineTokenCSS(overrides);
// → ":root{--primary-500:#3b82f6}"
```

**Import in:** Server Components, API routes, Server Actions only (never client components). `buildInlineTokenCSS` sanitises values — strips `; < > { }` to prevent CSS injection.

---

## Portfolio progress report (`lib/reports/`)

Global Progress Report (portfolio view): two-tier API + shared compute layer.

| Module | Purpose |
|--------|---------|
| `portfolio-progress-types.ts` | Shared TS contracts (`PortfolioProjectSnapshot`, list/detail responses) |
| `portfolio-progress-query.ts` | Zod query parsing for compare-period params (`preset`, `from`, `to`) |
| `portfolio-progress-period.ts` | Compare-period presets, `resolveComparePeriodRange`, display labels |
| `portfolio-snapshot-to-grid.ts` | Client-safe `portfolioSnapshotToLevelScopeReport` (no DB imports) |
| `compute-portfolio-progress.ts` | Maps `ProjectRow` → scope summaries + level grid |
| `compute-portfolio-deltas.ts` | Activity-log reverse replay for verified/sub % deltas and unit counts |
| `portfolio-progress-service.ts` | DB load + orchestration for list/detail API routes |
| `portfolio-progress-filters.ts` | Client-side PM/IM filter helpers (`uniqueProjectManagers`, `projectMatchesPeopleFilters`) |
| `portfolio-progress-client.ts` | Client URL builders for `GET /api/reports/global-progress` |
| `portfolio-progress-export.ts` | Assembles PDF export payload from live snapshot |
| `portfolio-progress-display.ts` | UI/PDF delta formatting — positive-only `+N%`, zero/negative/null → `0%` |
| `level-scope-building-display.ts` | Building badge label (`Building 1`) for level scope grid |
| `portfolio-export-format.ts` | PDF inline labels (`formatExportDeltaText`, unit count strings) |
| `portfolio-progress-wireframe-data.ts` | **Tests only** — Hannah's fixture projects |

**Level grid math** reuses [`lib/level-scope-report.ts`](../../lib/level-scope-report.ts) (`buildLevelScopeReport`, `buildLevelKey`, `subPct` on cells).

**API routes:** `GET /api/reports/global-progress`, `GET /api/reports/global-progress/[projectId]`, `POST /api/reports/global-progress/export-pdf`.

---

## Field daily report (`lib/field-daily-report/`)

Install Manager daily log from Field Tracker activity: status rollups, inspections, issues, observations. Global report at `/reports/field-daily` plus per-project hub card.

| Module | Purpose |
|--------|---------|
| `types.ts` | Snapshot DTOs (`FieldDailyReportProjectSnapshot`, listed items) |
| `timezone.ts` | Org TZ day bounds (`America/Denver`), `todayReportDateInOrgTz` |
| `event-sets.ts` | Which `ActivityEventType` values feed each section |
| `build-project-snapshot.ts` | Status rollup, progress counts, listed items from activity rows |
| `service.ts` | `generateFieldDailyReport`, `fetchFieldDailyReport`, comment upsert |
| `project-hub-service.ts` | Hub payload, history pagination, per-project `generateProjectFieldDailySlice` |
| `report-lock.ts` | `pg_advisory_xact_lock` per `(installManagerUserId, reportDate)` — serializes global vs hub generate |
| `auth.ts` | `canUseFieldDailyReport`, `canGenerateFieldDailyReport`, `canGenerateProjectFieldDailyReport` |
| `project-scope.ts` | `loadReportProjects` (date-scoped report view for admin) + `loadBackfillProjects` (all active projects for backfill picker) |
| `normalize-project-snapshot.ts` | Re-hydrates stale snapshot JSON on read (issues, locations, teams on site) |
| `location-label.ts` | Unit/building/level labels from activity metadata and `unitRef` |
| `project-progress.ts` | Live % complete + day delta at generation time |
| `daily-manpower-meta.ts` | `toDailyManpowerMetaDto()` — maps `dailyManpowerSetAt` / set-by user to API DTO |
| `log-daily-manpower-activity.ts` | Appends `FIELD_DAILY_DAILY_MANPOWER_SET` rows to project/global activity feeds when manpower changes |

**API routes:** `GET/POST /api/reports/field-daily`, `GET/POST /api/projects/[id]/field-daily`, `PUT .../comments`, `GET .../hub`, `GET .../history`, `GET .../slice`.

**Scheduled generate:** `lib/field-daily-report/scheduled-generate.ts` — `runScheduledFieldDailyReports()` loops active install managers at org-TZ midnight for the prior day. `POST /api/internal/field-daily/scheduled-generate` (Bearer `FIELD_DAILY_CRON_SECRET`). GitHub Actions: `field-daily-scheduled.yml`. Local: `npm run field-daily:scheduled` with `FIELD_DAILY_CRON_FORCE=1`.

**UI:** `FieldDailyReportClient`, `ProjectHubDailyReportCard`, `useFieldDailyDetailModals` (opens existing issue/observation/inspection modals).

---

## Global inspections report (`lib/inspections/`, `lib/reports/`)

Cross-project clear inspections: global log, pass/fail rates, and deficiency rollups.

| Module | Purpose |
|--------|---------|
| `fetch-global-inspections-report.ts` | Loads accessible projects and flattens submission rows for the global API |
| `build-global-inspections-report-view.ts` | Rebuilds project-style scope groupings from flat global rows (inspection log tab) |
| `inspection-report-period.ts` | Shared date presets (`all`, `1w`, `30d`, `custom`) for global report clients |
| `inspection-pass-fail-rollups.ts` | Pass/fail rate rollups by IM, PM, subcontractor, or project |
| `inspection-deficiency-section-rollups.ts` | Deficiency counts by form section; group rollups for accordion views |

**API route:** `GET /api/reports/global-inspections`.

---

## PDF generation (`lib/pdf/`)

Server-only Puppeteer builders for dashboard and field exports (observations, issues, activity, level-scope reports, **inspection submissions**). Each module exposes a `build*Pdf` function that returns a `Buffer`; API routes wrap it with `NextResponse` and attachment headers.

**Chromium resolution** is centralized in [`lib/pdf/puppeteer-launch.ts`](../../lib/pdf/puppeteer-launch.ts): **`CHROME_EXECUTABLE_PATH` / `PUPPETEER_EXECUTABLE_PATH`** must **`existsSync`**, and **on Windows must end in `.exe`** (rejects bare `%TEMP%/chromium` paths from Sparticuz); **Linux + production** dynamically imports **`@sparticuz/chromium-min`** only on that combo (Railway Dockerfile installs required `.so`s); **Windows and macOS** never load Sparticuz and resolve installed Chrome / Edge / Brave paths (Canary/Beta/Dev variants included). Builders call **`launchPdfPuppeteerBrowser()`**, which passes **`executablePath` explicitly** to `puppeteer-core` (`headless: true`)—do not scatter raw `puppeteer.launch(...)` spreading options.

If PDF export breaks locally **before** verifying the HTTP route, run **`npm run smoke:pdf-browser`** to confirm Puppeteer resolves a real `.exe`/browser without involving Next `.next/` output.

**Unified PDF export errors:** [`lib/pdf/pdf-export-errors.ts`](../../lib/pdf/pdf-export-errors.ts) logs the underlying failure and returns `500` JSON with `error`, optional `code` (`PDF_BROWSER_NOT_CONFIGURED`, `PDF_BROWSER_LAUNCH_FAILED`, `PDF_RENDER_FAILED`), and **non-production-only** truncated `details` via `isNonProd()`. Client code should show user-facing messages with [`lib/format-pdf-export-error-toast.ts`](../../lib/format-pdf-export-error-toast.ts) so `details` is appended after an em dash when the API exposes it.

**Save to device album:** [`lib/save-to-photos-preference.ts`](../../lib/save-to-photos-preference.ts) — device-local `localStorage` preference (`cc-save-to-photos`) for duplicating Field Tracker camera captures to the native photo album via Web Share (`shareFilesToDevice`). Toggled only in `CameraCapture` (Save button); persists across sessions. Requires `navigator.share` — hide toggle when unavailable.

**Mobile PDF delivery:** [`lib/deliver-pdf-blob.ts`](../../lib/deliver-pdf-blob.ts) — desktop browsers (Mac/Windows/Linux), including narrow viewports and installed desktop PWAs, auto-download via anchor (`deliverPdfBlob`). iOS/Android defer until a fresh tap: `deliverPdfBlobOnUserGesture()` opens the native share sheet when supported, otherwise Android downloads or iOS opens in a new tab. `isMobilePdfDelivery()` keys off iOS/Android device UA — not viewport width or desktop PWA.

**Image prefetch for PDF embeds:** [`lib/pdf/fetch-image-for-pdf.ts`](../../lib/pdf/fetch-image-for-pdf.ts) — server-side prefetch of attachment bytes must **forward the export request’s `Cookie` header** for same-origin **`/api/upload/field-media/file`** URLs (session-gated local disk storage). **`resolveUrlForPdfImageFetch`** rewrites those URLs to **`absoluteAppOriginFromRequest(req)`** so a stored `localhost:3002` link still works when the user exports from another port. Supabase signed URLs are unchanged and need no cookie.

**Cover title from JSON bodies:** [`lib/pdf/normalize-cover-title-from-body.ts`](../../lib/pdf/normalize-cover-title-from-body.ts) — **`normalizePdfCoverTitleFromBody`** trims and caps (**200 chars**) optional `coverTitle` / `coverTitleLine` on issue and observation PDF export routes so non-string request fields never reach Puppeteer HTML builders.

---

## Scripts (not imported — run via CLI)

| Script | Purpose |
|--------|---------|
| `scripts/smoke-pdf-browser.ts` | Verifies Puppeteer resolves Chrome/Edge (`npm run smoke:pdf-browser`; loads `.env`, no `.next`). |
| `scripts/pdf-next-bundle-guard.cjs` | Runs on **`npm run prestart`**, loads `.env`, and scans `.next/server` only when `PDF_NEXT_BUNDLE_GUARD=1` or `APP_ENV=dev`; exits non-zero if it finds the stale observations-PDF launcher string (prompts wipe `.next` + `npm run build`). |
| `scripts/bootstrap-admin.ts` | One-time admin user creation (idempotent) |
| `scripts/deploy-railway.sh` | Railway deploy helper for dev/prod environments |
| `scripts/rerun-blocked-bot-ci.ts` | Reruns `action_required` CI on trusted bot PRs (Dependabot, metrics-auto, session-checklist). Agent: `npm run bot-pr:rerun-ci` |

### `lib/bot-pr-trusted.ts` — Bot PR auto-merge allowlist

Pure trust gate for bot-authored PRs agents may rerun CI on and auto-merge without Phil: Dependabot (non-security paths), `metrics-auto` label, session-checklist-only docs, metrics JSONL/dashboard files only.

Run bootstrap with: `npm run bootstrap:admin`
