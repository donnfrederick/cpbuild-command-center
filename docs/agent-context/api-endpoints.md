# API Endpoint Map — CP Build Command Center

> All routes under `app/api/`. All routes require an authenticated session unless noted. DevTools routes require admin session AND `isDevToolsAllowed()` guard.

## Auth Routes

### Auth.js Handler
```
ANY  /api/auth/[...nextauth]
```
Handles login, logout, session callbacks. Managed by Auth.js — do not modify the handler directly; configure in `lib/auth.ts`.

### Password Management
```
POST /api/auth/forgot-password
```
- Input: `{ email: string }`
- Effect: Creates `PasswordResetToken`, sends reset email via Resend
- Public (no session required)
- Also enforces per-email token cap (`MAX_RESETS_PER_HOUR`) and **per client IP** sliding-window outbound throttling via [`lib/email-outbound-rate-limit.ts`](../../lib/email-outbound-rate-limit.ts) (same generic 200 when throttled — no enumeration leak). IP throttles emit `[email_security]` JSON lines (`forgot_password_ip_throttled`) for log monitoring.

```
POST /api/auth/reset-password
```
- Input: `{ token: string, password: string }`
- Effect: Validates token hash, updates `User.passwordHash`, marks token used
- Public

```
POST /api/auth/change-password
```
- Input: `{ currentPassword: string, newPassword: string }`
- Requires: authenticated session
- Effect: Verifies current password, updates hash

---

## Invite Routes

```
GET  /api/invites
```
- Auth: ADMIN only (`invite:member` permission)
- Returns: list of all invites with status (pending / accepted / expired)

```
POST /api/invites
```
- Auth: ADMIN only
- Input: `{ email: string, roleId: string }`
- Effect: Creates `Invite` record, sends invite email with tokenized link
- Returns: created invite object (201)
- **429** `INVITE_EMAIL_RATE_LIMITED` when the inviter exceeds the hourly outbound invite-email cap ([`lib/email-outbound-rate-limit.ts`](../../lib/email-outbound-rate-limit.ts))
- **429** `INVITE_RECIPIENT_EMAIL_RATE_LIMITED` when too many invite emails (create + resend combined) target the same recipient address in a rolling 24h window — `[email_security]` `invite_recipient_email_throttled`

```
POST /api/invites/[id]/resend
```
- Auth: ADMIN only
- Effect: Resets expiry, resends invite email
- **429** `INVITE_EMAIL_RATE_LIMITED` — shares the same per-inviter hourly cap as `POST /api/invites`
- **429** `INVITE_RECIPIENT_EMAIL_RATE_LIMITED` — shares the same per-recipient rolling-day cap as `POST /api/invites`

```
GET  /api/invites/validate
```
- Query: `?token=<invite_token>`
- Public (no session)
- Returns: invite metadata if token valid and not expired/accepted
- Related table: `Invite`

```
POST /api/invites/accept
```
- Input: `{ token: string, name: string, password: string }`
- Public (no session — user doesn't have account yet)
- Effect: Creates `User`, marks invite `acceptedAt`, signs user in
- Related table: `Invite`, `User`

---

## Project Routes

```
GET  /api/projects
```
- Auth: any authenticated user
- Returns: enriched `Project[]` — DB rows merged with Unifier shells via `enrichProjectList`, then sorted with the user's **favorites pinned first** (favorite order = `createdAt` asc on `UserProjectFavorite`), then alphabetically by `projectName` within each group. Each item includes **`isFavorite`** (per real logged-in user, not role-preview), **`status`** (Unifier `CP_PROJECT_PHASEPD`, display text), **`lifecycleStatus`** (`UUU_SHELL_STATUS` mapped for filters / AI), and **`isTestProject`**.
- Note: Always filters `deletedAt: null`. Rows with **`isTestProject: true`** are omitted unless the viewer’s real role is **ADMIN**, **DEVELOPER**, or **DESIGNER** (strict production test sandbox visibility).
- Related table: `Project` (slim) + Unifier PDS cache

```
POST /api/projects
```
- Auth: role with `MANAGE_PROJECTS` or `CREATE_PROJECT`
- Input: `{ unifierPid, installManagerId?, installManagerName?, projectManagerId?, upmData?, isTestProject? }` — no denormalized Unifier display fields. Optional **`isTestProject`** (default false): in strict production, **Designer/Developer** may only create with `isTestProject: true`; only Admin/Developer/Designer may set the flag to true.
- Returns: enriched `Project` plus `restored`, `unitsCount` (201 create / 200 restore)

```
PATCH /api/projects/[id]/favorite
```
- Auth: session + resolvable DB user (`resolveSessionToDbUserId`)
- Body: `{ favorite: boolean }`
- Effect: Creates or removes a `UserProjectFavorite` row for the real logged-in user (not role-preview). Project must be visible to the effective role (same test-project squad rules as list).
- Returns: `{ projectId, favorite }`

```
GET  /api/projects/[id]
```
- Returns: single enriched `Project` (`enrichProjectById`). Test projects return **404** for users outside Admin/Developer/Designer (real session).

```
PATCH /api/projects/[id]
```
- Input: `{ installManagerId?, installManagerName?, projectManagerId?, isTestProject? }` (nullable optional where noted). Only Admin/Developer/Designer may change **`isTestProject`** in strict production.
- Effect: Updates CC-owned assignment fields; response is re-enriched from Unifier. In strict production, project mutations are additionally gated by `lib/production-project-access.ts` (Designer/Developer blocked on non-test projects; Admin requires masquerade as an operational role).

```
DELETE /api/projects/[id]
```
- Effect: Soft delete — sets `deletedAt`, does not remove from DB
- **Test projects** (`isTestProject: true`): requires **ADMIN** role (not just `MANAGE_PROJECTS`)

```
POST /api/projects/[id]/seed-test-data
```
- Auth: **ADMIN** only; project must be `isTestProject: true` and not soft-deleted
- Body: `{ issues?: { count, resolvedRatio?, commentRatio? }, observations?: { count, withMediaRatio? }, clearInspections?: { count, passedRatio? }, calibrations?: { count, passedRatio? }, dateRangeDays?, userIds: string[], randomSeed? }` — per-type max 500; at least one count > 0
- Effect: Creates `TestSeedBatch` + tagged issues, observations, FORM-based clear inspections (published CLEAR_INSPECTION templates; includes failed retries and stuck-failed scopes), calibration inspections on scopes with existing clear history, activity logs. No notification/email side effects. Clear inspection seeding auto-promotes eligible rows to INSTALL+COMPLETE, skips rows with existing inspection history, and skips rows with no matching published form for their scope type. Calibrations require a scope with at least one prior passed or failed clear inspection.
- Returns **201**: `{ batchId, counts, warnings?, skipped? }`
- Logs `PROJECT_TEST_DATA_SEEDED`

```
GET /api/projects/[id]/test-seed-batches
```
- Auth: **ADMIN** + test project
- Returns `{ batches: [{ id, createdAt, createdByName, counts, configSummary }] }`

```
DELETE /api/projects/[id]/test-seed-batches/[batchId]
```
- Auth: **ADMIN** + test project
- Hard-deletes all entities with matching `testSeedBatchId`. Does **not** revert auto-promoted UPM row fields.
- Returns **200**: `{ batchId, removed: counts }`
- Logs `PROJECT_TEST_DATA_BATCH_REMOVED`

---

## Project Unit (Row) Routes

```
GET  /api/projects/[id]/units
```
- Auth: `VIEW_UPM` **or** `MANAGE_PROJECTS` **or** `MANAGE_UNIT_STATUS` (covers ADMIN, DESIGNER, DEVELOPER, CONTROLS_MANAGER, INSTALL_MANAGER, PROJECT_MANAGER)
- Each row includes `subScopeInstances: ProjectSubScopeInstance[]` (empty array when no sub-scopes defined). Each instance includes `qty: number | null`, `scopeStage`, `scopeStatus`, `inspectionStatus`
- Each row also includes `clearInspection: { id, status, createdAt } | null` — the most recent clear inspection for that scope (null = not yet inspected)
- Each row includes `issueMeta` — per-unit issue summary for filters and scope indicators (keyed by `building|level|unit`)
- **Without** query `limit`: body is `{ units: ProjectRow[] }` — full list, ordered by `rowIndex` then `id` (UPM spreadsheet and legacy callers).
- **With** `limit` (integer 1–200): keyset pagination for Field Tracker incremental load. Query params:
  - `limit` — required for paginated mode; values above 200 are clamped to 200; invalid non-numeric `limit` → **400**
  - `cursor` — optional opaque string from prior response’s `nextCursor`; invalid cursor → **400**
  - `search` — optional; trimmed; max 200 chars. When set, restricts rows to those matching a case-insensitive substring on string columns and related lookup name/code (Field Tracker “all columns” search). Pagination and `total` apply to this filtered set.
- Paginated JSON: `{ units, hasMore, nextCursor, total?, totalUnits? }` — on the **first** page only (no `cursor`): `total` is the **scope row** count and `totalUnits` is the **distinct unit** count (grouped by building+level+unit) for the current filter; `nextCursor` is `null` when `hasMore` is false.
- Tour demo project id returns full `{ units }` when unpaginated; with `limit`, returns all demo rows in one response plus `hasMore: false`, `nextCursor: null`, and `total`.
- Related table: `project_rows`

```
POST /api/projects/[id]/units
```
- Auth: `EDIT_UPM` (ADMIN, CONTROLS_MANAGER) **or** `MANAGE_PROJECTS` (TEAM_LEAD, INSTALL_MANAGER, PROJECT_MANAGER, INSTALL_DIRECTOR, ADMIN)
- **Overwrite mode restriction**: `mode: "overwrite"` requires `EDIT_UPM`. Roles with only `MANAGE_PROJECTS` (e.g. INSTALL_MANAGER) receive `403` for overwrite; `add` and `merge` modes are still permitted.
- **Overwrite block**: when any field progress exists (inspection submissions, clear inspections, rows with non-null scope stage/status/inspection, issues, or observations), `mode: "overwrite"` returns **409** `{ error: "overwrite_blocked", reason: "field_data_exists", counts }`. ADMIN may pass `forceOverwrite: true` to bypass.
- Input: `{ rows: Record<string, string>[], mode?: "add" | "merge" | "overwrite", forceOverwrite?: boolean, source?: "upload" | "paste" | "menu" }` (parsed from UPM Excel upload)
- Effect: Bulk inserts `ProjectRow` records via `lib/project-rows.ts:insertProjectRows()`, then calls `autoCreateInstancesForNewRows()` to backfill any sub-scope instances for newly added rows. **Merge** dedupes by normalized `building|level|unit|description` (`lib/project-row-matching.ts`). **Add/merge** runs `relinkScopeTagsForProject()` to restore issue/observation scope join tags from durable `scopeRefKeys`.
- Activity: logs `UNIT_ROW_CREATED` (with `mode`, optional `source`) on insert; logs `UNIT_ROWS_BULK_DELETED` before allowed overwrite deletes.
- Returns: `{ added, skipped, addedRowIds, message, unlinkedScopeTypes? }` — `addedRowIds` lists inserted row IDs in rowIndex order (used for undo/cancel-revert). 201 on insert; 200 when merge finds no new rows.

```
GET /api/projects/[id]/units/overwrite-eligibility
```
- Auth: same as POST units (read)
- Returns: `{ overwriteAllowed, canUseOverwriteMode, blocked, counts }` — used by Location Builder upload mode picker UI

```
PATCH /api/projects/[id]/units/[rowId]
```
- Auth (top-level): `EDIT_UPM` **or** `MANAGE_UNIT_STATUS`
- Auth (field-level): if body includes `scopeStage`, `scopeStatus`, or `inspectionStatus` → `MANAGE_UNIT_STATUS` required
- **Sub-scope gate**: if body includes `scopeStage` or `scopeStatus` AND the row has `ProjectSubScopeInstance` records → returns **409** with hint to use the sub-scope instance PATCH endpoint instead
- Input: partial row fields — Field Tracker data (any role with `EDIT_UPM`) or stage/status fields (`MANAGE_UNIT_STATUS`: ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER)
- Returns: updated `ProjectRow`

---

## Custom Site Location Routes

Field-notes-only areas (not UPM rows). Linked to observations/issues via `@custom|{id}|{name}` unit refs.

```
GET   /api/projects/[id]/custom-site-locations
POST  /api/projects/[id]/custom-site-locations
PATCH /api/projects/[id]/custom-site-locations/[locationId]
DELETE /api/projects/[id]/custom-site-locations/[locationId]
```

- Auth: project access (same as project field notes)
- **GET** — list with observation/issue counts per location
- **POST** — `{ name, placement, building?, level? }`; placement `standalone` \| `building` \| `building_level` (Prisma enum). Validates building/level against UPM `project_rows`. **409** `duplicate_name` when the same normalized name already exists in the **same** placement/building/level area (same name under a different building, level, or standalone bucket is allowed). **422** `invalid_scope` when building/level invalid for placement.
- **PATCH** — same body shape as POST; updates name/placement. **409** `duplicate_name` within the same placement/building/level bucket (self excluded via `excludeId`). Logs `CUSTOM_SITE_LOCATION_UPDATED` with previous name/placement metadata.
- **DELETE** — **409** `has_field_notes` if location has observations or issues; logs `CUSTOM_SITE_LOCATION_DELETED` on success. **POST** logs `CUSTOM_SITE_LOCATION_CREATED`.
- Related table: `ProjectCustomSiteLocation`
- Lib: `lib/custom-site-locations.ts`, `lib/custom-site-locations-api.ts`, `lib/custom-site-location-validation.ts`
- **Offline:** CRUD is online-only; field notes on existing custom locations use the normal observation/issue flow.

---

## Clear Inspection Routes

```
POST /api/projects/[id]/clear-inspections
```
- Auth: `MANAGE_UNIT_STATUS` (ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER)
- Input: `{ rowId: string, status: "PASSED" | "FAILED" }`
- Validates that `rowId` belongs to the project. Creates a **new** `ClearInspection` record every call (no upsert — each change is a separate history entry).
- Returns: `{ id, rowId, status, inspectionTypeId, inspectionType: { code }, createdAt }` (201)
- No gate on scope stage/status — any scope can have a clear inspection regardless of `scopeStage`/`scopeStatus`.
- No DELETE endpoint in v1 (records accumulate for the future activity feed).

## Form Builder Routes

```
GET   /api/forms
GET   /api/forms/[id]
POST  /api/forms
PATCH /api/forms/[id]
DELETE /api/forms/[id]
POST  /api/forms/[id]/publish
POST  /api/forms/[id]/unpublish
POST  /api/forms/[id]/save-version
```
- **List (GET `/api/forms`):** full list (drafts + published) requires `MANAGE_FORMS`; `?status=published` is allowed for any authenticated user (inspection picker).
- **Read (GET `/api/forms/[id]`):** `MANAGE_FORMS` for drafts; published forms readable by any authenticated user (field inspections / preview).
- **Mutations (POST/PATCH/DELETE/publish/unpublish/save-version):** `authorizeFormMutation()` — DB-authoritative role + `MANAGE_FORMS` (ADMIN and INSTALL_DIRECTOR via role defaults; others via Users → special permission **Manage Forms**). Role preview does not gate writes.
- Existing UI contract remains JSON-based: draft sections live in `forms.draftSections`, and published versions live in `form_versions.sections`.
- **POST/PATCH body:** optional `formPurpose`: `"inspection"` | `"documentation"` (maps to `forms.purpose`). When `documentation`, API forces `category: "OTHER"`. `description` max length: 5000 chars (`lib/forms/form-api-limits.ts`).
- Backend side effect: section/question JSON is mirrored into `inspection_form_sections`, `inspection_form_questions`, `inspection_form_version_sections`, and `inspection_form_version_questions` so BI can query form definitions and question types without parsing JSON.

```
GET /api/users/me/capabilities
```
- Auth: session required.
- Support diagnostic: compares JWT role vs DB role, role preview / masquerade state, and `canManageForms` from effective session vs DB-authoritative check.

## Inspection Submission Routes

```
GET /api/inspection-submissions
```
- Auth: authenticated user
- Query: one or more of `scopeRowId`, `unitId`, `projectId`. When `unitId` is a location ref (`building|level|unit`), **`projectId` is required** and results are limited to unit-level rows (`scopeRowId` null).
- Returns completed inspection attempts ordered newest first. Each row includes `payload` and `templateSnapshot`, **hydrated from relational answer/deficiency/media tables** when stored JSON is a stub (same as `GET /api/inspection-submissions/[id]`).

```
POST /api/inspection-submissions
```
- Auth: authenticated user / masquerade-aware via `getEffectiveSession`
- Input: **required** `formVersionId`, project/unit/scope identifiers, `outcome`, `deficiencyCount`, and answer `payload` (used at write time only). `form.level` is enforced: scope-level forms require `scopeRowId`; unit-level forms reject `scopeRowId` and require `unitId` as a `building|level|unit` ref with a non-empty unit segment; **project-level** forms reject `scopeRowId` and require `unitId: "||"` (same sentinel as project-level field notes).
- Effect: creates an `InspectionSubmission` with category stub JSON (`{ category }`) and empty `payload`; loads question structure from `inspection_form_version_*`; writes `inspection_answers` (required `formVersionQuestionId` FK), `inspection_answer_media`, and deficiency rows. Scope-level non-calibration categories (CLEAR_INSPECTION, FIELD_VERIFICATION, TWO_AREA_CLEAR, OTHER) sync `project_rows.inspectionStatus` from the newest authoritative submission and create `clear_inspections` history with the matching `inspection_type_id`. **Project-level** submissions skip scope status sync and clear-inspection history. Calibration submissions (`categoryOverride: "CALIBRATION_INSPECTION"`) require `calibratedAgainstSubmissionId` and set `clear_inspections.calibrated_against_clear_inspection_id` on the new history row. Gypcrete unit-level forms (`scopeRowId` null) are submission-only for v1 — eligible units must contain a floor-covering scope (CPB, CPT, HDW, LVT, RAF, RBF, TIL, VCT, VYL); UI gating is in the Inspections `+ Add` picker. Project-level published forms surface from the **project hub** only (`StartProjectInspectionSheet`).
- Returns 422 if `formVersionId` is missing/invalid or version mirror has no questions

```
PUT /api/inspection-submissions/[id]
```
- Auth: authenticated user
- Input: `{ outcome, deficiencyCount, payload }`
- Effect: updates the latest attempt only; stores empty `payload` JSON; rewrites normalized answer/media/deficiency rows from the request payload and version mirror; recomputes `project_rows.inspectionStatus` when the submission is scope-level and authoritative.
- **Field verification:** only the original submitter (`clear_inspections.inspected_by_id`) may edit; returns 403 for other users. Still requires the row to be the most recent attempt for that scope + form (409 otherwise).

```
PATCH /api/inspection-submissions/[id]/reclassify-calibration
```
- Auth: `CALIBRATE_INSPECTION` permission
- Input: `{ calibratedAgainstSubmissionId: string }` — must reference a synced clear inspection on the same scope
- Effect: converts an existing **clear** submission row to `CALIBRATION_INSPECTION` in place (updates category stub + `clear_inspections` history link). Blocked when the scope already has a calibration or when the target clear is the same row. Does not support pending/offline queue rows — sync first.
- Returns 409 when scope already has calibration; 422 when submission is not eligible

```
POST /api/projects/[id]/units/[rowId]/inspections/reset
```
- Auth: **ADMIN** or **SUPER_ADMIN** only
- Input: `{ category: InspectionCategory }` — deletes the **latest** submission for that category on the scope (including BACKFILL when category is `CLEAR_INSPECTION`), soft-deletes linked `clear_inspections` row, then recomputes `project_rows.inspectionStatus` from remaining submissions
- Returns 404 when no matching submission exists

---

## Sub-Scope Routes

```
GET  /api/projects/[id]/sub-scopes
```
- Auth: `VIEW_UPM` **or** `MANAGE_PROJECTS` **or** `MANAGE_UNIT_STATUS`
- Returns: `{ subScopes: SubScopeGroup[] }` — all definitions grouped by `(unitType, scopeType)` with `instanceCount` per definition

```
POST /api/projects/[id]/sub-scopes
```
- Auth: `MANAGE_PROJECTS` (Install Manager, Project Manager, Admin)
- Input: `{ unitType, scopeTypeId, distributionMode: "even" | "manual", subScopes: [{ name, displayOrder?, qty? }, ...] }` — minimum 2 sub-scopes
  - `distributionMode: "even"` — each instance.qty = parentRow.qty ÷ numSubScopes; `qty` omitted from sub-scope items
  - `distributionMode: "manual"` — `qty` is **required** on every sub-scope item; same amount applied to every matching row's instance and stored on the definition for future UPM-upload rows
- Validation: at least 1 `ProjectRow` must match `(projectId, unitType, scopeTypeId)`; no duplicate names for this combo
- Effect: Creates `ProjectSubScope` definitions and auto-creates `ProjectSubScopeInstance` for every matching row (with qty set)
- Returns: `{ subScopes, instancesCreated, rowCount }` (201)

```
DELETE /api/projects/[id]/sub-scopes/[subScopeId]
```
- Auth: `MANAGE_PROJECTS`
- Effect: **Hard delete** — all instances removed via CASCADE (irreversible, loses tracking history)
- Returns: 204

```
PATCH /api/projects/[id]/sub-scopes/instances/[instanceId]
```
- Auth: `MANAGE_UNIT_STATUS` (same gate as row stage/status)
- Input: `{ scopeStage?, scopeStatus?, inspectionStatus?, qty?: number | null }`
  - `qty` allows per-unit quantity override after creation (e.g. adjust even-split rounding, or correct a manual amount for a specific unit)
- Same inspection-status gate as row PATCH: `inspectionStatus` only settable at INSTALL+COMPLETE
- Returns: updated instance with embedded `subScope` object and `qty` (200)

```
DELETE /api/projects/[id]/units/[rowId]
```
- Auth: `EDIT_UPM` (CONTROLS_MANAGER) **or** `MANAGE_PROJECTS` (INSTALL_MANAGER, PROJECT_MANAGER, ADMIN)
- Hard delete (cascade from Project is acceptable here)

```
POST /api/projects/[id]/units/bulk-delete
```
- Auth: `EDIT_UPM` **or** `MANAGE_PROJECTS`
- Input: `{ rowIds: string[] }`
- Effect: Deletes multiple rows in a single transaction

```
POST /api/projects/[id]/units/bulk-inspection
```
- Auth: `MANAGE_UNIT_STATUS`
- Input: `{ rowIds, subScopeInstanceIds, inspectionStatus: "READY" | "PASSED" | "FAILED" | null, skipActivityLog?, appliedRowIds?, appliedSubScopeInstanceIds? }`
- Effect: Sets `inspectionStatus` on all specified rows and sub-scope instances. Non-null values also force `scopeStage=INSTALL` + `scopeStatus=COMPLETE` (mirrors individual "Start Inspection" behavior). `null` clears `inspectionStatus` only (stage/status unchanged). For PASSED/FAILED, creates a `ClearInspection` record per row (the UI reads `clearInspection?.status` first). For READY/null, soft-deletes active `ClearInspection` records. Parent rows of any supplied `subScopeInstanceIds` are always updated alongside the instances so the display stays consistent.
- Multi-chunk mode: callers may split large updates across multiple requests using `skipActivityLog: true` on each chunk, then send a final activity-log-only follow-up with `rowIds: []`, `subScopeInstanceIds: []`, and the accumulated `appliedRowIds` / `appliedSubScopeInstanceIds` from prior responses. This final request emits one consolidated `SCOPE_INSPECTION_BULK_UPDATED` event without re-applying the update. Omitting `appliedRowIds`/`appliedSubScopeInstanceIds` in log-only mode causes a 422 validation error.
- Returns: `{ updated, skipped: 0, errors, appliedRowIds, appliedSubScopeInstanceIds }`
- Logs `SCOPE_INSPECTION_BULK_UPDATED` activity event (or defers to the log-only follow-up in multi-chunk flows)

---

## Team Routes

```
GET  /api/team
```
- Auth: `view:team` permission
- Returns: `User[]` with role info (excludes passwordHash)

```
PATCH /api/team/[id]
```
- Auth: `manage:roles` permission
- Input: `{ roleId: string }`
- Effect: Updates user role

```
DELETE /api/team/[id]
```
- Auth: `remove:member` permission
- Effect: Deletes user account (cascade: clears sessions, preferences)

---

## Role & Lookup Routes

```
GET /api/roles
```
- Returns: all `Role[]` — used to populate invite/role-change dropdowns and role preview picker
- Auth: `INVITE_MEMBER`, `MANAGE_ROLES`, or `PREVIEW_ROLE`

```
GET /api/lookups
```
- Returns: all lookup tables in one payload:
  ```json
  {
    "scopeTypes": [...],
    "locationTypes": [...],
    "costTypes": [...],
    "installTeams": [...],
    "uomTypes": [...]
  }
  ```
- Cached-friendly — lookup data is seeded and rarely changes

---

## Offline Routes

```
GET  /api/offline/preferences
```
- Returns: `OfflinePreference` for the authenticated user

```
PUT  /api/offline/preferences
```
- Input: `{ modules: string[] }`
- Effect: Upserts user's offline module selection

```
GET  /api/offline/snapshot
```
- Returns: bundled data payload for offline use (version **3**)
- Core modules: `my-profile`, `team-directory` (from user preferences)
- Per-project bundle (when `offlineProjectIds` non-empty): `projects`, `units`, `observations`, `issues`, `subcontractors`, `published-forms`
- `units` rows match live `GET /api/projects/:id/units` shape (`unifierSubId`, `installer`, `subScopeInstances`, `issueMeta`, etc.) via `lib/project-units-serialize.ts`
- Uses `getEffectiveSession()` + `resolveSessionToDbUserId()` so `OfflinePreference` / `OfflineProjectSync` rows use a real `User.id` (dev bypass `dev-user` maps via email / first admin / any user — same as notifications)

---

## Unifier Routes

```
GET /api/unifier/projects
```
- Returns: list of Unifier projects (real or mock depending on `UNIFIER_MOCK`) **excluding** PIDs already linked in Command Center
- Response header `X-CC-Unifier-Linked-Count`: number of non-deleted CC projects with a `unifierPid` (for UI copy)
- Used to link Command Center projects to Unifier PIDs

```
GET /api/unifier/projects/[pid]/documents
```
- Returns: documents for a specific Unifier project

---

## Design Token Routes

```
GET   /api/design-tokens
POST  /api/design-tokens
```
- Auth: ADMIN (or DESIGNER role)
- GET returns current `DesignTokenSnapshot.overrides`
- POST saves new token overrides from the DevTools SpacingEditor

---

## Feedback Routes

Session: `getEffectiveSession()` (masquerade-aware) for list/detail/comments.

```
GET  /api/feedback
```
- Auth: any authenticated user.
- **Inbox roles** (`SPECIAL_ACCESS_FEEDBACK_INBOX` / `feedback:inbox`): all reports.
- **Others**: `OR` — reports they submitted **or** reports where they appear in `FeedbackMention`.
- Response: **`{ reports, prodFeed }`** where `prodFeed` is `"off"` \| `"ok"` \| `"error"`.
  - When dev is configured to merge production (`FEEDBACK_BRIDGE_SECRET` + `FEEDBACK_BRIDGE_PROD_BASE_URL`), **inbox** responses merge prod rows; each item may include `environment`: `"development"` \| `"production"`.
  - `prodFeed: "error"` means the prod merge fetch failed; UI should still show local reports.
- Response items include `shortId`, `source`, `videoUrl`, `commentsCount` (non-deleted comments), optional `viewerContext`: `"submitter"` \| `"mentioned"` (omitted for inbox users).

```
GET  /api/feedback/prod-assignees
```
- Auth: **inbox** only.
- When prod merge is configured, returns `{ assignees: { id, name, email, role }[] }` from **production** (for assignee dropdown on `environment: "production"` items). Otherwise `{ assignees: [] }`.

```
GET  /api/feedback/[id]
```
- Auth: viewer must be inbox, submitter, or mentioned.
- **404** if missing or not allowed (no existence leak).
- Query: `?environment=production` — inbox only; proxies to prod internal API when merge is configured (same row as production DB).
- Returns report + `commentsCount` + optional `assignee` (`id`, `name`, `email`). May include `environment` when merge is enabled (local rows tagged `development`).

```
POST /api/feedback
```
- Auth: any authenticated user
- **`userId` FK:** the handler resolves the session through [`resolveSessionToDbUserId`](../../lib/session-db-user.ts) (same as feedback comments) so dev-bypass `id: "dev-user"` maps to a real `User.id` — avoids `feedback_reports_userId_fkey` violations when the synthetic session has no DB row.
- Input: `{ type: "BUG" | "FEATURE_REQUEST", title, description, screenshot?, pageUrl?, aiAssisted?: boolean, aiAssistMetadata?: FeedbackAssistMetadata | null }`
- When `aiAssisted=true`, `aiAssistMetadata` must validate against `feedbackAssistMetadataSchema` in [`lib/feedback-assist-schema.ts`](../../lib/feedback-assist-schema.ts) — mismatched shapes are **400**. When `aiAssisted=false` the field must be omitted or `null`.
- Returns: created `FeedbackReport` with `shortId` (201)
- Inbox notification email is skipped (non-fatal) when the submitter exceeds the hourly cap — [`lib/email-outbound-rate-limit.ts`](../../lib/email-outbound-rate-limit.ts); emits `[email_security]` `feedback_notify_actor_throttled`

```
GET  /api/feedback/assist
POST /api/feedback/assist
```
- Auth: any authenticated user — **401** otherwise.
- **GET**: returns `{ enabled: boolean, maxTurns: number }`. `enabled` mirrors `isAIEnabled()` (GEMINI_API_KEY presence). Cheap probe so the UI can toggle the AI-assisted feedback flow without paying for a Gemini round-trip.
- **POST**: drives one turn of the optional Gemini-backed feedback assistant. Input: `assistTurnRequestSchema` from [`lib/feedback-assist-schema.ts`](../../lib/feedback-assist-schema.ts) — `{ sessionId, initial: { feedbackType, title, description, pageUrl }, transcript[], finalize }`.
- Returns `assistTurnResponseSchema` — either `{ kind: "question", question, turnNumber, remainingTurns }` or `{ kind: "final_report", report, turnNumber }`.
- **503** `AI_DISABLED` when `GEMINI_API_KEY` is unset. **429** `RATE_LIMITED` when the same user calls twice within 5 s (per-user in-memory limiter in [`lib/feedback-assist-rate-limit.ts`](../../lib/feedback-assist-rate-limit.ts)). **500** `AI_UPSTREAM_FAILED` for any Gemini error. No persistence — submission happens via POST `/api/feedback` once the user accepts the draft.
- **POST** optionally accepts `videoRef: { fileUri, mimeType, expiresAt }` in the request body. When present, every subsequent turn grounds Gemini in the original screen recording uploaded via `POST /api/feedback/assist/video`. The chat UI in `components/feedback/FeedbackAssistChat.tsx` forwards this ref automatically once the video-seeded session begins.

```
POST /api/feedback/assist/video
```
- Auth: any authenticated user — **401** otherwise.
- Accepts `multipart/form-data` with two parts: `recording` (the screen capture Blob — `video/webm` or `video/mp4`, ≤ 50 MB — see `FEEDBACK_ASSIST_VIDEO_MAX_BYTES` in `lib/ai/types.ts`) and `metadata` (JSON string validated by `assistVideoRequestMetadataSchema` — `{ sessionId, feedbackType, initialTitle, initialUserText, pageUrl, durationSec? }`).
- Uploads the recording to the Gemini Files API via [`lib/ai/gemini-files.ts`](../../lib/ai/gemini-files.ts), polls for `ACTIVE` state, then runs the first Gemini turn grounded in the video using `generateFeedbackAssistVideoTurn` from [`lib/ai/gemini.ts`](../../lib/ai/gemini.ts).
- Returns an `assistTurnResponseSchema`-shaped payload with an additional `videoRef: { fileUri, mimeType, expiresAt }` field. The response may be a `question` (seeds the chat panel — the client then forwards `videoRef` on every subsequent `POST /api/feedback/assist`) or a `final_report` (short-circuits the chat and applies the draft straight to the form).
- **503** `AI_DISABLED` when `GEMINI_API_KEY` is unset. **429** `RATE_LIMITED` when the same user exceeds **5 video analyses per hour** (`checkFeedbackAssistVideoRateLimit` — separate from the 5 s per-turn cap). **400** for size/MIME/duration violations. **500** `AI_UPSTREAM_FAILED` if the Files API or Gemini call fails (aligned with the text-only `/api/feedback/assist` error code so the client can branch on a single code).
- Gemini Files expire after ~48 h. If the client forwards a stale `videoRef` on a subsequent `POST /api/feedback/assist`, the server transparently retries the turn **text-only** and returns the response with `videoRef: null` so the client stops forwarding the expired ref. The conversation continues without interruption — the user only needs to re-record if they want video grounding restored.

```
POST /api/feedback/assist/image
```
- Auth: any authenticated user — **401** otherwise.
- Accepts `multipart/form-data` with `image` (Blob) and `metadata` (JSON: `assistImageRequestMetadataSchema` — `{ sessionId, feedbackType, initialTitle?, initialUserText?, pageUrl? }`). MIME allowlist + max size: `FEEDBACK_ASSIST_IMAGE_*` in `lib/ai/types.ts`.
- Uploads via [`uploadImageForFeedback`](../../lib/ai/gemini-files.ts); returns `{ imageRef: { fileUri, mimeType, expiresAt } }` for optional grounding on assist turns / calibration.

```
POST /api/feedback/assist/calibrate
```
- Auth: any authenticated user — **401** otherwise.
- JSON body: `assistCalibrateRequestSchema` from [`lib/feedback-assist-schema.ts`](../../lib/feedback-assist-schema.ts) — `sessionId`, `currentReport`, `feedbackType` (must equal `currentReport.kind`), `pageUrl`, and **`instruction`** *or* **`calibrationInstructions`** (either non-empty string). Optional: `initial`, `transcript`, `videoRef`, `imageRef` for richer / multimodal calibration.
- Calls `generateFeedbackAssistCalibrate` in [`lib/ai/gemini.ts`](../../lib/ai/gemini.ts). Returns `{ kind: "final_report", report }` (`assistFinalReportSchema`).
- **503** `AI_DISABLED`, **429** `RATE_LIMITED` (same per-user sliding window as `POST /api/feedback/assist`), **400** for invalid input, **500** `AI_UPSTREAM_FAILED` on Gemini errors. No persistence until `POST /api/feedback`.

```
GET  /api/feedback/[id]/comments
POST /api/feedback/[id]/comments
```
- Query: `?environment=production` — inbox only; proxies to prod internal comments API when merge is configured.
- GET: non-deleted comments with `author` + `attachments`, ordered by `createdAt` asc.
- POST: `body` (1–4000 chars) + optional attachment arrays (same shape as issue comments: `attachmentKeys`, `attachmentUrls`, `attachmentMimeTypes`, `attachmentFileSizeBytes`, `attachmentCaptions`, max 10). Keys must be under `field-media/feedback-comments/`.
- Mentions: `@[Name](userId)` → upsert `FeedbackMention`, `MENTIONED_IN_COMMENT` notification + email with deep link `/{locale}/feedback/{id}` (dedicated detail page). At most **25** distinct mentioned users per request; per-actor mention-email sliding windows in [`lib/email-outbound-rate-limit.ts`](../../lib/email-outbound-rate-limit.ts) can skip mention side effects when exceeded.

```
PATCH /api/feedback/[id]/comments/[cid]
DELETE /api/feedback/[id]/comments/[cid]
```
- PATCH: **author only**, body only, within **30 minutes** (400 after window). Re-mentions upsert rows; notify only users not already in `FeedbackMention` for that report.
- DELETE: **author only**, soft `deletedAt`.

```
PATCH /api/feedback/[id]
```
- Query: `?environment=production` — inbox only; proxies PATCH to prod internal API.
- Triage fields **`status`** / **`adminNote`** / **`priority`**: **inbox** only (`SPECIAL_ACCESS_FEEDBACK_INBOX`) — **403** if the submitter (or mentioned-only viewer) tries to change them.
- **`status`**: `OPEN` | `IN_PROGRESS` | `WAITING_FOR_RESPONSE` | `NEEDS_INVESTIGATION` | `WONT_FIX` | `RESOLVED` | `DELETED`. Setting `DELETED` performs a soft-delete (hidden from list, restorable). Setting `RESOLVED` triggers fan-out notifications to reporters of any linked duplicate reports.
- **`priority`**: optional triage level — **`LOW`** \| **`MEDIUM`** \| **`HIGH`**, or **`null`** to clear. Omitted = no change. Invalid values → **400**.
- **`assigneeId`**: inbox **or** feedback submitter — **403** for mentioned-only viewers who are not the submitter. Valid assignees: users whose `Role.code` is `ADMIN`, `DEVELOPER`, or `DESIGNER` — **400** otherwise.
- When `assigneeId` changes to a new non-null user and assignee ≠ assigner, creates a **`FEEDBACK_ASSIGNED`** notification + `sendFeedbackAssignedEmail` (fire-and-forget; failures do not fail PATCH).
- Input: `{ status?, adminNote?, assigneeId?: string | null, priority?: "LOW" | "MEDIUM" | "HIGH" | null }`.

```
POST /api/feedback/[id]/link-duplicate
```
- Auth: inbox roles (`SPECIAL_ACCESS_FEEDBACK_INBOX`) only — **403** otherwise.
- Body: `{ canonicalId: string }` — the ID of the primary/canonical report to absorb this one into.
- Marks report `[id]` as a duplicate of `canonicalId`. The duplicate is hidden from the main inbox list and appears under the canonical's **Duplicates** tab.
- Validations: cannot link to self; `[id]` cannot already be a canonical (has duplicates); `[id]` cannot already be linked as a duplicate; `canonicalId` cannot itself be a duplicate.
- Returns: `201 { id, canonicalId, duplicateId, canonical: { id, shortId, title } }`.

```
DELETE /api/feedback/[id]/link-duplicate
```
- Auth: inbox roles only — **403** otherwise.
- Removes the `FeedbackDuplicate` record for report `[id]`, restoring it to the main inbox list.
- Returns: `200 { unlinked: true, reportId }`.

```
DELETE /api/feedback/[id]
```
- Auth: inbox only.
- Query: `?environment=production` — proxies DELETE to prod internal API.

**GET /api/feedback list query params:**
- `?deleted=true` — **inbox admin only**; returns only `DELETED` reports (used by the Deleted tab). Default list always excludes `DELETED` items and reports linked as duplicates of another report.

## Internal feedback bridge (machine auth)

Server-to-server only. **`Authorization: Bearer <FEEDBACK_BRIDGE_SECRET>`** (same secret on dev + prod). **Never** expose in browser / `NEXT_PUBLIC_*`.

**Production env:** `FEEDBACK_BRIDGE_SECRET`, `FEEDBACK_BRIDGE_ACTOR_USER_ID` (prod `User.id` used as `authorId` for bridge-created comments and as assignment actor for bridge PATCH).

**Dev env:** `FEEDBACK_BRIDGE_SECRET`, `FEEDBACK_BRIDGE_PROD_BASE_URL` (e.g. `https://command-center-reboot-production.up.railway.app`).

```
GET    /api/internal/feedback
GET    /api/internal/feedback/assignees
GET    /api/internal/feedback/[id]
PATCH  /api/internal/feedback/[id]
DELETE /api/internal/feedback/[id]
GET    /api/internal/feedback/[id]/comments
POST   /api/internal/feedback/[id]/comments
```
- POST comments: optional header `X-Feedback-Bridge-Body-Prefix` (max 200 chars) prepended to comment body (dev server sets `[Via dev: …]` from session).
- **401** if secret missing or wrong.

```
POST /api/feedback/upload-recording
```
- Auth: any authenticated user (`getSession`)
- Accepts multipart form data with a `recording` blob (WebM, max 100 MB)
- Uploads to Supabase Storage `feedback-recordings` bucket using `SUPABASE_SERVICE_ROLE_KEY`
- Returns `{ url: string }` — a 1-year signed URL for playback
- Returns 503 if `SUPABASE_SERVICE_ROLE_KEY` is not configured (graceful degradation)
- The returned URL is passed as `videoUrl` in the subsequent POST to `/api/feedback`

```
POST /api/feedback/upload-screenshot
```
- Auth: any authenticated user (`getSession`)
- Accepts multipart form data with a `screenshot` blob (PNG/JPEG/WebP/GIF, max 5 MB per image)
- When `SUPABASE_SERVICE_ROLE_KEY` is set: uploads to Supabase Storage `field-media` bucket under `feedback-screenshots/`; returns `{ url: string }` — a 1-year signed URL
- When `SUPABASE_SERVICE_ROLE_KEY` is unset/empty: writes to `.local-field-media/field-media/feedback-screenshots/` and returns `{ url }` pointing at `GET /api/upload/field-media/file?key=...` (same pattern as field-media uploads)
- MIME type resolved from `file.type` or file extension (handles Windows empty-type picks)
- Returns 400 if no file provided, 413 if file > 5 MB, 415 if unsupported MIME type, 502 on storage failure, 503 if Supabase URL cannot be resolved (Supabase path only)
- The returned URL is collected and sent as an item in `screenshots[]` in the subsequent POST to `/api/feedback`
- **Supabase note:** uses the existing `field-media` bucket (same as issue/observation uploads). Legacy submissions may still reference the old dedicated `feedback-screenshots` bucket URLs.

---

## Site Tour Route

```
GET /api/site-tour
```
- Auth: any authenticated session (401 if none)
- Returns: `{ steps: SiteTourStep[] }` — all hardcoded site walkthrough steps from `lib/site-tour-steps.ts`
- Steps are bilingual `LocalizedString` objects `{ en, es }` for `title`, `description`, and `voiceText`
- Template substitution: `{{PROJECT_ID}}` in any `pageUrl` is replaced with `TOUR_DEMO_PROJECT_ID` (`"tour-demo-project"`) — an in-memory fake project recognised by API routes and page components without querying Prisma
- Role filtering: steps whose `pageUrl` includes `/users` are omitted for roles without `VIEW_DASHBOARD` permission
- Source: `lib/site-tour-steps.ts:SITE_TOUR_STEPS` (not a DB table)
- Used by `TourPlayer` when launching a site tour; `SiteTourInspector` bypasses this route and injects edits from localStorage client-side

---

## Health Route

```
GET /api/health
```
- Public — no auth
- Returns: `{ status: "ok", timestamp: "...", version: string }`
- Used by Railway deploy pipeline and smoke tests

---

## Connectivity Route

```
GET /api/connectivity
```
- Public — no auth, no database access
- Returns: `204 No Content` with `Cache-Control: no-store`
- Used by client-side connectivity probes (`lib/offline/connectivity.ts`, `useConnectivityMode`) — avoids hammering `/api/health` DB pings from every active tab

---

## Admin Status Route

```
GET /api/admin/status
```
- Auth: ADMIN only (`manage:roles` permission)
- Returns:
  ```json
  {
    "environment": "production",
    "gitSha": "abc1234",
    "gitBranch": "main",
    "nodeVersion": "v22.x.x",
    "uptimeSeconds": 10800,
    "timestamp": "2026-03-05T..."
  }
  ```
- Sources: Railway-injected env vars (`RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_GIT_BRANCH`, `RAILWAY_ENVIRONMENT_NAME`) + `process.uptime()`
- Used exclusively by the `/[locale]/admin/status` production health page
- Returns 401 if unauthenticated, 403 if authenticated but not admin

---

## AI Route

```
POST /api/ai/analyze
```
- Auth: ADMIN only (or `DEV_BYPASS_AUTH=true` in non-prod)
- Rate limited: 30s cooldown per `projectId` key (in-memory)
- Input:
  ```json
  {
    "type": "units" | "briefing" | "portfolio" | "devtools",
    "projectId": "string (optional — required for units/briefing)",
    "prompt": "string (optional, max 50,000 chars — used for devtools/freeform)"
  }
  ```
- Backend: Gemini via `lib/ai/gemini.ts` — guarded by `isAIEnabled()` (requires `GEMINI_API_KEY`)
- Analysis types:
  - `units` — analyzes `ProjectRow[]` for a project (scope gaps, blocked items)
  - `briefing` — generates an executive project briefing
  - `portfolio` — cross-project portfolio summary (no `projectId` needed)
  - `devtools` — freeform prompt analysis for DevTools Error Wrap-Up tab

---

## DevTools Routes (dev + admin only)

All require `isDevToolsAllowed()` guard + admin session. Hard-blocked in production.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/devtools/data` | GET | Snapshot of app state for DevTools panel. Table list covers all Prisma model tables and returns them alphabetically by model name. |
| `/api/devtools/diagnostics` | GET | Server + DB diagnostic checks |
| `/api/devtools/logs` | GET | Live server log stream |
| `/api/devtools/logs-snapshot` | GET | Point-in-time log snapshot |
| `/api/devtools/layout-issues` | GET, POST | CRUD for layout issue tracker |
| `/api/devtools/layout-issues/[id]` | PATCH, DELETE | Update/delete single layout issue |
| `/api/devtools/run-tests` | POST | Trigger Vitest test run |
| `/api/devtools/recent-tests` | GET | Last test run results |
| `/api/devtools/test-plan` | GET | Current test plan |
| `/api/devtools/e2e-test-plan` | GET | E2E test plan |
| `/api/devtools/schema-diff` | GET | Prisma schema drift check |
| `/api/devtools/test-email` | POST | Send test email via Resend/Mailpit — **429** `TEST_EMAIL_RATE_LIMITED` after per-admin hourly cap ([`lib/email-outbound-rate-limit.ts`](../../lib/email-outbound-rate-limit.ts)); every SMTP/Resend send also counts toward the **per-process global** hourly ceiling in [`lib/email.ts`](../../lib/email.ts) |
| `/api/devtools/unifier-test` | POST | Test Unifier API connection |
| `/api/devtools/unifier-metadata` | GET | Unifier field metadata |
| `/api/devtools/unifier-documents` | GET | Unifier document list |
| `/api/devtools/unifier-reset` | POST | Reset Unifier mock state |

### Release Verification Routes (new — Release Checklist tab)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/devtools/releases` | GET | List releases for an environment with verification status. Query: `?environment=development\|staging\|production\|all` |
| `/api/devtools/releases` | POST | Create a release entry manually. Body: `{ title, prNumber?, branch?, environment, mergedAt, changes[] }` |
| `/api/devtools/releases/[id]/verify` | PATCH | Mark a release verified. Body: `{ environment, notes? }` — upsert, idempotent |
| `/api/devtools/releases/[id]/verify` | DELETE | Un-verify a release. Query: `?environment=...` |
| `/api/devtools/releases/[id]/tour` | DELETE | Remove a release's tour (ReleaseTour + steps) without deleting the release record itself. Hides it from the tour picker. |
| `/api/devtools/releases/import-changelog` | POST | Import `[Merged]` entries from `CHANGELOG.md`. Idempotent by `prNumber`. Returns `{ imported, skipped, total }` |
| `/api/devtools/releases/sync-github` | POST | Fetch merged PRs from GitHub API and upsert as Release records. Idempotent by `prNumber`. Paginates up to 3 pages (300 PRs). Requires `GITHUB_TOKEN`. Returns `{ imported, skipped, total }`. 503 if token missing. |
| `/api/devtools/environment-visit` | POST | Upsert last-visit timestamp. Body: `{ environment }` |

---

## User Special Permissions Routes

```
GET    /api/users/[id]/special-permissions
POST   /api/users/[id]/special-permissions
DELETE /api/users/[id]/special-permissions/[permissionId]
```
- Auth: ADMIN only
- Manage per-user permission overrides (grant/revoke specific permissions outside their role)

## Notification Routes

```
GET  /api/notifications
```
- Auth: any authenticated user
- Returns the current user's notifications (newest first, max 50), including embedded `feedback` with `tour` presence indicator
- Used by `NotificationBell` component with 60-second polling interval
- **Dev bypass:** session id `dev-user` is mapped to a real `User.id` via `resolveSessionToDbUserId` (email lookup, else oldest `ADMIN`, else any user) so @mention notifications (stored under real user ids) appear locally
- **Masquerade:** handlers use `getEffectiveSession()` so the bell lists (and mark-read affects) the **impersonated** user's rows, not the admin actor's

```
PATCH /api/notifications/[id]
```
- Auth: notification owner only (403 if different user)
- Marks a single notification as read

```
POST /api/notifications/mark-all-read
```
- Auth: any authenticated user
- Marks all of the current user's unread notifications as read. Returns 204.

## Feedback Tour Routes

```
GET /api/feedback/[id]/tour
```
- Auth: any authenticated user
- Returns the `FeedbackTour` (steps JSON) for a resolved feedback report
- 403 if the report is not yet RESOLVED; 404 if no tour has been authored

```
PUT /api/feedback/[id]/tour
```
- Auth: ADMIN only (MANAGE_ROLES permission)
- Creates or fully replaces the tour for a feedback report
- Body: `{ steps: TourStep[] }` where each step has `{ order, pageUrl, elementSelector, title, description, voiceText }`
- `elementSelector` and `voiceText` may be empty strings (no highlight / silent step)
- Returns the saved `FeedbackTour` record

---

## Release Tour Routes

```
GET /api/releases/[id]/tour
```
- Auth: any authenticated user
- Returns the `ReleaseTour` with steps for the given release
- 404 if the release doesn't exist or has no tour attached

```
PUT /api/releases/[id]/tour
```
- Auth: ADMIN only (MANAGE_ROLES permission)
- Creates or fully replaces the release tour (replaces steps atomically)
- Body: `{ steps: TourStep[] }` — same shape as FeedbackTour steps; max 30 steps
- Returns the saved tour with steps (201 on create, 200 on update)

```
GET /api/releases/latest-new
```
- Auth: any authenticated user
- Returns `{ release, tour }` for the most recently merged release that has a `ReleaseTour` attached
- 204 if no release has a tour yet
- Used by `ReleaseTourBanner` to fetch tour content after detecting a new deploy (SHA comparison in localStorage)

```
GET /api/releases/tour-history
```
- Auth: any authenticated user
- Returns paginated list of releases that have a `ReleaseTour` attached, ordered by `mergedAt DESC`
- Query params: `limit` (default 10, max 50), `cursor` (releaseId for cursor-based pagination)
- Response: `{ items: ReleaseWithTourSummary[], nextCursor: string | null, total: number }`
- Used by `TourHistory` slide-in panel

```
GET /api/releases/share-link?releaseId=<id>&locale=<en|es>
```
- Auth: admin session only (MANAGE_ROLES permission)
- Returns a shareable URL that, when opened by any authenticated user, triggers the release tour via the `?tour=` deep-link handler
- Landing page is `/[locale]/projects` (CONTROLS_MANAGER entry point)
- Returns `200 { url }`; `404` if release or tour not found; `400` if `releaseId` missing

```
POST /api/automation/release-tour
```
- Auth: **admin session only** (MANAGE_ROLES permission). **`Authorization: Bearer <AUTOMATION_SECRET>` returns `410`** — CI automatic tour generation is disabled; use explicit admin-authored tours or this endpoint from a logged-in admin session / DevTools.
- Body: `{ releaseId?, prNumber?, title, branch?, environment, mergedAt?, changes[] }`
- Behavior: upserts `Release` by `releaseId` or `prNumber`, then calls Gemini to generate `TourStep[]` and saves as `ReleaseTour` + `ReleaseTourStep[]`
- Idempotent: returns `200 { status: "skipped" }` if a tour already exists for the release
- Returns `201 { release, tour }` on success; `503` if `GEMINI_API_KEY` is not configured; `502` if Gemini fails

**Ops — remove auto-generated release tours from production:** run against prod Postgres only (backup first). Example pattern: delete `release_tour_steps` then `release_tours` for unwanted `release_id`s, or delete `releases` created by the old pipeline after confirming no dependency. Prefer DevTools / SQL editor with explicit IDs.

```
POST /api/automation/release-verification
```
- Auth: `Authorization: Bearer <AUTOMATION_SECRET>` **or** admin session (MANAGE_ROLES permission)
- Generates (or regenerates) a Gemini-powered QA verification checklist for a Release, stored in `Release.verificationSteps` (JSONB)
- Body: `{ releaseId: string, feedback?: string }`
- Idempotent: returns `200 { releaseId, steps }` if steps already exist and no `feedback` provided
- If `feedback` is provided, steps are regenerated regardless of existing content
- Returns `201 { releaseId, steps }` on create/regenerate; `503` if `GEMINI_API_KEY` not set; `502` if Gemini fails; `404` if release not found
- Rendered in the DevTools Release Checklist tab

---

## Masquerade Routes (ADMIN only)

```
POST   /api/admin/masquerade
```
- Auth: ADMIN only (`masquerade:user` permission)
- Input: `{ targetUserId: string }`
- Constraints: cannot masquerade as self, cannot start while already masquerading (409)
- Effect: Creates `MasqueradeLog` row, sets signed HttpOnly cookie `cc-masquerade` (8h TTL)
- Returns: `{ logId, targetUser: { id, name, email, role } }` (201)

```
DELETE /api/admin/masquerade
```
- Auth: any authenticated user (used by the masquerading admin to exit)
- Effect: Updates `MasqueradeLog.endedAt`, clears cookie
- Returns: `{ success: true }` (200)

```
GET    /api/admin/masquerade/log
```
- Auth: ADMIN only
- Query: `?page=1&limit=20`
- Returns: paginated `{ total, page, limit, totalPages, entries[] }` where each entry includes actor, target, startedAt, endedAt

```
POST   /api/admin/role-preview
```
- Auth: ADMIN, DESIGNER, DEVELOPER (`role:preview` permission)
- Input: `{ previewRole: RoleCode }` — any of the 11 valid role codes
- Constraints: selecting own real role clears the preview (returns 200 `{ cleared: true }`) rather than erroring
- Effect: sets signed HttpOnly cookie `cc-role-preview` (8h TTL); overlays only the `role` field in `getEffectiveSession()` — real user id/email/name are unchanged; API routes using `getSession()` always see the real role
- Returns: `{ previewRole, realRole }` (201) or `{ cleared: true }` (200)
- No audit log — role-only preview, not user impersonation

```
DELETE /api/admin/role-preview
```
- Auth: ADMIN, DESIGNER, DEVELOPER (`role:preview` permission)
- Effect: clears `cc-role-preview` cookie, restoring the real session role
- Returns: `{ success: true }` (200)

---

## Morning Briefing (ADMIN only)

```
GET /api/daily-briefing?date=YYYY-MM-DD
```
- Auth: ADMIN only (`VIEW_MORNING_BRIEFING` permission)
- Optional `?date=YYYY-MM-DD` — defaults to yesterday's date if omitted
- Returns `{ id: string, briefing: DailyBriefingReport | null, dateFor: string, generatedAt?: string }`
- `briefing` is null if no briefing has been generated for the requested date
- No side effects — pure read from `daily_briefings` table

```
POST /api/daily-briefing
```
- Auth: ADMIN only (`VIEW_MORNING_BRIEFING` permission)
- Triggers the two-stage Gemini pipeline (Stage 1: search grounding, Stage 2: structured JSON)
- Before Stage 2, fetches active `BriefingRule` records and recent `CHALLENGE` feedback (14 days) and injects them into the prompt
- Fetches GitHub PRs/commits from yesterday via `GITHUB_TOKEN` and DB activity stats in parallel
- Upserts the result to `daily_briefings` table (one row per calendar day — `dateFor` is unique)
- Returns `{ briefing: DailyBriefingReport, dateFor: string, generatedAt: string }`
- 503 if `GEMINI_API_KEY` is not set
- 502 if Gemini pipeline fails at runtime
- Takes 15–30s — client shows skeleton while pending

```
GET /api/daily-briefing/history
```
- Auth: ADMIN only
- Returns all stored briefings, newest first, with extracted summary fields (no full report body)
- Returns `{ items: Array<{ id, dateFor, generatedAt, roiSummary, totalEstimatedValue, optimizationCount, issueCount, shippedCount }> }`

```
GET /api/daily-briefing/analysis?window=30|90|all
```
- Auth: ADMIN only
- Returns the most recent cached `BriefingSynthesisReport` for the given window
- `window` defaults to `30` (last 30 days); `90` = 90 days; `all` = all time
- Returns `{ synthesis: BriefingSynthesisReport | null, window, generatedAt? }`

```
POST /api/daily-briefing/analysis
```
- Auth: ADMIN only
- Body: `{ window: "30" | "90" | "all" }`
- Fetches all briefings in the window, calls `generateBriefingSynthesis()`, saves to `briefing_syntheses`
- 422 if no briefings exist in the window
- 503 if AI not configured; 502 if Gemini fails

```
POST /api/daily-briefing/feedback
```
- Auth: ADMIN only
- Body: `{ briefingId, section, itemKey, feedbackType, challengeReason?, userNote? }`
- Saves a feedback signal to `briefing_feedbacks` table
- 201 on success

```
POST /api/daily-briefing/feedback/justify
```
- Auth: ADMIN only
- Body: `{ briefingId, section, itemKey, itemData, briefingContext }`
- Calls `justifyBriefingCard()` and saves justification to `briefing_feedbacks`
- Returns `{ justification: string }`
- 503 if AI not configured

```
POST /api/daily-briefing/feedback/revise
```
- Auth: ADMIN only
- Body: `{ briefingId, section, itemKey, itemData, challengeReason, userNote?, briefingContext }`
- Calls `reviseBriefingCard()`, saves challenge + revision to `briefing_feedbacks`
- Returns `{ revisedItem: object }` — revision is ephemeral (does NOT overwrite stored briefing)
- 503 if AI not configured

```
GET /api/daily-briefing/rules
```
- Auth: ADMIN only
- Returns all briefing rules (active and inactive), newest first

```
POST /api/daily-briefing/rules
```
- Auth: ADMIN only
- Body: `{ text: string, source?: "MANUAL" | "FEEDBACK_DERIVED", active?: boolean }`
- Creates a new briefing rule; 201 on success

```
PATCH /api/daily-briefing/rules/[id]
```
- Auth: ADMIN only
- Body: `{ text?: string, active?: boolean }`
- Updates text or active toggle; 404 if not found

```
DELETE /api/daily-briefing/rules/[id]
```
- Auth: ADMIN only
- Permanently deletes the rule; 404 if not found; returns `{ deleted: true }`

---

## Unifier Integration Routes

### Public Unifier Data

```
GET /api/unifier/projects
```
- Auth: authenticated session
- Returns: Unifier project shells from `UNIFIER_US_XPRJ`, filtered to exclude already-linked projects
- Used by CreateProjectModal Step 1 search

```
GET /api/unifier/projects/[pid]/documents
```
- Auth: authenticated session
- Query: `?projectNumber=optional`
- Returns: documents from `UNIFIER_DM_FILE_VIEW` for the given project

```
GET /api/unifier/users
```
- Auth: ADMIN only (`manage:roles` permission)
- Returns: `{ data: UnifierUser[], total }` — all users from `UNIFIER_SYS_USER_INFO`
- Used for user-linking workflow

### User Linking

```
GET /api/users/link-suggestions
```
- Auth: ADMIN only
- Returns: `{ data: UserLinkSuggestion[], total }` — auto-match suggestions based on email comparison
- Only returns suggestions for CC users not yet linked; confidence `'exact'` = email match

```
POST /api/users/[id]/link-unifier
```
- Auth: ADMIN only
- Body: `{ unifierUserId: string }` (link) or `{ unifierUserId: null }` (unlink)
- Effect: Sets/clears `User.unifierUserId` and `User.unifierUsername`
- 409 if `unifierUserId` is already linked to another CC user
- 404 if CC user or Unifier user not found

```
GET /api/users/[id]/unifier-tasks
```
- Auth: the user themselves OR any admin
- Returns: `{ data: UnifierTask[], total, unifierUserId, unifierUsername }`
- Fetches `UNIFIER_SYS_TASK` filtered by `ASSIGNEE_ID = user.unifierUserId`
- 200 with empty data if user has no linked Unifier account

### DevTools — Unifier Diagnostics

```
GET /api/devtools/unifier-test
```
- Dev-only. Tests PDS API connectivity and returns diagnostic info.

```
GET /api/devtools/unifier-reset
POST /api/devtools/unifier-reset
```
- Dev-only. GET = circuit breaker state. POST = reset circuit breaker + config cache.

```
GET /api/devtools/unifier-metadata
```
- Dev-only. Query: `?tables=1` lists tables; `?columns=TABLE_NAME` lists columns.

```
GET /api/devtools/unifier-documents
```
- Dev-only. Diagnostic probe for `dm_file_view` table name variants.

```
GET /api/devtools/unifier-schema
```
- Dev-only. Returns the full typed schema definition of all available Unifier tables and columns (from `lib/unifier/schema-definition.ts`). No PDS API call.

```
GET /api/devtools/unifier-explore
```
- Dev-only. Query: `?table=UNIFIER_UXSUB&limit=50&projectId=optional`
- Queries any allowlisted Unifier table and returns raw rows.
- Table must be in the allowlist from `schema-definition.ts`. Max 200 rows per call.
- Returns: `{ tableName, columns, rows, total, returned, limit, projectIdFilter }`

```
POST /api/devtools/unifier-analyze
```
- Dev-only (hard-blocked in production unless `DEVTOOLS_ENABLED=true` + admin session).
- Sends a Unifier table's schema + sample rows to Gemini and returns a structured integration analysis.
- Requires `GEMINI_API_KEY` — returns 503 if not set.
- Body: `{ tableDef: { tableName, displayName, description, columns[] }, sampleRows?: Record<string,unknown>[] }`
- Returns: `UnifierTableAnalysis` — `{ summary, integrationStatus, relatedDashboardFeatures, suggestedIntegrations, newFeatureIdeas, dataQualityNotes }`
- Called from the Unifier Explorer DevTools panel "Analyze with AI" button.
- PII fields (EMAIL, TOKEN, SECRET, etc.) are automatically redacted from sample rows before Gemini receives them.

```
GET  /api/users/me/agent-identity
PATCH /api/users/me/agent-identity
```
- Auth: any authenticated user (own record only).
- GET returns `{ agentName, agentCallsign, agentMission }` (nullable fields).
- PATCH body: `{ agentName: string (max 40), agentCallsign: string (max 3), agentMission: string (max 280) }`. All fields default to empty string. Callsign is auto-uppercased and trimmed to 3 chars. Empty strings are stored as `null`.
- Used by the Agent Identity form in Account Settings.

```
GET /api/devtools/agent-identity
```
- Auth: requireDevToolsAdmin() — ADMIN role + DEVTOOLS_ENABLED=true.
- Returns `{ agents: [{ id, name, email, agentName, agentCallsign, agentMission, role }] }`.
- Used by the Memory Registry DevTools panel Org Chart tab.

---

## Field Media Upload

```
POST /api/upload/field-media
```
- Auth: any authenticated user.
- Body: `multipart/form-data` with `file` (Blob) and `type` (`"issues"` | `"observations"` | `"comments"` | `"issue-comments"` | `"obs-comments"` | `"feedback-comments"` | `"album"`, default `"issues"`). Optional `projectId` (project UUID) — when present and the user can read the project, a rate-limit hit writes an `activity_logs` row (`FIELD_MEDIA_UPLOAD_RATE_LIMITED`) for Admin/Developer/Designer visibility in `GET /api/projects/[id]/activity`. Optional **`captureMetadata`** JSON (client GPS/device context at capture time) — persisted to **`field_media_upload_context`** staging keyed by `storageKey`; promoted to **`media_capture_context`** when a `MediaAttachment` is created.
- Max 50 MB. Allowed MIME: `image/*`, `video/*`, `audio/*`.
- **Rate limit:** In-memory per-user sliding window (per server instance). Returns **429** with `{ error: "FIELD_MEDIA_RATE_LIMITED", detail: "..." }` when burst thresholds are exceeded (after MIME/size validation).
- **Storage backend:** If `SUPABASE_SERVICE_ROLE_KEY` is set (non-empty), uploads to Supabase Storage bucket `field-media/{type}/{uuid}.{ext}` and returns a long-lived signed `storageUrl`. If the key is **missing or empty**, writes to the local filesystem under `.local-field-media/` (or `LOCAL_FIELD_MEDIA_ROOT`) and returns `storageUrl` pointing at `GET /api/upload/field-media/file?key=...` on the same app origin (no Supabase calls).
- Returns: `{ storageKey, storageUrl, mimeType, fileSizeBytes }`.

```
GET /api/upload/field-media/file?key=field-media/...
```
- Auth: any authenticated user. Serves bytes for a key stored on local disk (session cookie required; not a public URL).
- Query `key` must match the allowlisted `field-media/{folder}/{uuid}.{ext}` shape. Returns 404 if the file is not on disk (e.g. attachment was stored in Supabase).

```
GET /api/projects/[id]/site-geocode
```
- Auth + project read visibility. Returns `{ siteLocation, latitude, longitude, available, geocodeStatus }` from cached **`project_site_geocodes`**. Server uses **`GOOGLE_GEOCODING_API_KEY`** (optional locally) to geocode Unifier `siteLocation` once per project. Without the key, client GPS still persists but project distance/watermark proximity may be omitted.

## Unit Photo Album

```
GET  /api/projects/[id]/album?unitRef=building|level|unit
GET  /api/projects/[id]/album/coverage
POST /api/projects/[id]/album/export-pdf
POST /api/projects/[id]/album?unitRef=building|level|unit

- GET coverage: Returns `{ unitRefs: string[] }` — composite keys (`building|level|unit`) that have at least one album-visible image or video (observations, issues, comments, inspections, standalone uploads). Used by the Media page level photo indicator.
```
- GET: Aggregate all visual media (images, video) for a unit — from observations, observation comments, issues, issue comments, inspection submissions, and standalone album uploads — sorted newest first. Returns `{ items: AlbumItem[] }`. Each item’s `source` includes optional `scopeCodes: string[]` (scope type codes from issue/observation scope tags, inspection scope row, or status-update label). Items may include optional **`captureContext`** when the underlying `MediaAttachment` has **`media_capture_context`** (same shape as issue/obs detail attachments). `unitRef` is required (format: `building|level|unit`). Server logic: `lib/media/fetch-album-items-for-unit-ref.ts`.
- POST export-pdf: Body `{ locations: MediaExportLocationEntry[], filters: { mediaSourceTypes, albumSourceTags }, filterSummary?, sourceLabels?, standaloneSectionTitle?, customLocationBadge? }`. Fetches album items per location (respecting media filters), renders a location-grouped PDF via Puppeteer. Caps: 80 locations / 400 items per export. Default response: `application/pdf`. With `Accept: application/x-ndjson` or `X-Media-Export-Stream: 1`, returns NDJSON progress events (`type: progress` with location/item counts and percent, then `type: complete` with base64 PDF). Auth: project read visibility.
- POST: Upload a standalone photo to the unit album. Body: `{ storageKey, storageUrl, mimeType, fileSizeBytes?, caption? }`. The `storageKey`/`storageUrl` come from a prior `/api/upload/field-media` call. Only `image/*` and `video/*` mime types accepted. Returns `{ item: AlbumItem }` with status 201. Fire-and-forget logs `UNIT_PHOTO_UPLOADED` (metadata: `attachmentId`, `unitRef`, `building`, `level`, `unit`, `sourceType`, `sourceLabel`).
- Auth: Any authenticated member with read access to the project. `enforceProjectReadVisibility` applied to both methods.
- DB: `MediaAttachment` rows with `unitPhotoProjectId` + `unitPhotoUnitRef` for standalone photos; others are queried via `ProjectObservation`, `ObservationComment`, `ProjectIssue`, `IssueComment` attachment relations.

## Issues

### Issue catalog (dynamic pickers)

```
GET  /api/issue-catalog
GET  /api/issue-catalog/manage
POST /api/issue-catalog/issue-types
PATCH /api/issue-catalog/issue-types/[code]
POST /api/issue-catalog/responsible-parties
PATCH /api/issue-catalog/responsible-parties/[code]
```

- **GET `/api/issue-catalog`**: Any authenticated user. Returns `{ issueTypes: [{ code, displayName, requiresVisual }], responsibleParties: [{ code, displayName }] }` — active rows only. Included in offline snapshot module `issue-catalog`.
- **GET `/api/issue-catalog/manage`**: Requires `issues:report-config` (`canManageIssueReportConfig`). Returns full catalog including `sortOrder` and `isActive` for Project Settings → Issue config (`/project-settings/issue-config`).
- **POST/PATCH issue-types / responsible-parties**: Same permission gate. Archive via `isActive: false` (never hard-delete). New codes slugged from `displayName`; collision appends suffix.

### Observation catalog (dynamic pickers)

```
GET  /api/observation-catalog
GET  /api/observation-catalog/manage
POST /api/observation-catalog/types
PATCH /api/observation-catalog/types/[code]
```

- **GET `/api/observation-catalog`**: Any authenticated user. Returns `{ observationTypes: [{ code, displayName }] }` — active rows only. Included in offline snapshot module `observation-catalog`.
- **GET `/api/observation-catalog/manage`**: Requires `issues:report-config` (`canManageIssueReportConfig`). Returns full catalog including `sortOrder` and `isActive` for Project Settings → Observation config (`/project-settings/observation-config`).
- **POST/PATCH types**: Same permission gate. Archive via `isActive: false` (never hard-delete). New codes slugged from `displayName`; collision appends suffix.

```
GET  /api/projects/[id]/issues
POST /api/projects/[id]/issues
```
- GET: List issues for a project. Query params: `status` (open|resolved), `type` (catalog code), `responsibleParty` (catalog code — matches if party is in issue's `responsibleParties`), `projectRowId`, `isBlockingWork` (true|false), `projectLevel` (true = only issues with null/empty/`||` `unitRef`, i.e. project-level field notes), `limit` (optional positive int, max 100 — returns `totalCount` alongside truncated results). Response items serialize DB `issueTypeCode`/`responsiblePartyCode` as `issueType`/`responsibleParty` plus `responsibleParties: string[]` (from join tags, or `[responsibleParty]` fallback).
- POST: Create issue. Required: `shortDescription`, `issueType` (catalog code), and at least one responsible party via `responsibleParties[]` (preferred) or legacy `responsibleParty`. Optional: `unitRef`, `projectRowIds[]` (defaults `[]`), `subScopeInstanceIds[]` (defaults `[]`), `notes`, `isBlockingWork`, `buildPhaseTag`, `areaTag` (project-level only — must match distinct values from project rows), attachment arrays (`attachmentKeys[]`, `attachmentUrls[]`, `attachmentMimeTypes[]`, `attachmentFileSizeBytes[]`, etc.). When catalog row has `requiresVisual: true`, at least one `image/*` or `video/*` required (422 otherwise). For `MISSING_MATERIALS`: `missingMaterialDescription` (non-empty, max 500) and `missingMaterialQuantity` (positive number) required; optional `missingMaterialUomCode` — when omitted, resolved from the first tagged scope row with a UOM; at most one `projectRowId` allowed (422 if multiple). Invalid/inactive catalog codes return 422. Max 30 attachments per entity (`MAX_MEDIA_ATTACHMENTS_PER_ENTITY`). Strict production: `enforceProductionFieldNotesMutation` (Admin may create without masquerade; Designer/Developer blocked on non-test projects). Response serializes DB `issueTypeCode`/`responsiblePartyCode` as `issueType`/`responsibleParty` plus `responsibleParties[]`.

```
GET   /api/projects/[id]/issues/[issueId]
PATCH /api/projects/[id]/issues/[issueId]
```
- GET: Full issue with comments and attachments. Response serializes `issueType`/`responsibleParty` aliases, includes `bulkGroupId`, `bulkGroupCount` (count of sibling issues sharing the same bulk group, null if not a bulk issue), and `responsibleParties[]`.
- PATCH: Creator or privileged roles (ADMIN, DEVELOPER, DESIGNER, INSTALL_MANAGER, INSTALL_DIRECTOR). Editable: `shortDescription`, `notes`, `issueType`, `responsibleParties[]` (or legacy `responsibleParty`), `isBlockingWork`, `scopeTagIds[]`. **`unitRef` is creator-only** (403 for privileged non-creators). Custom site refs cannot be changed. Scope rows must belong to the selected unit when at unit level. Party patch replaces all join tags atomically.

```
POST /api/projects/[id]/issues/bulk
```
- Any authenticated member. Creates one `ProjectIssue` per unit in a single `$transaction`. All issues share a generated `bulkGroupId` for group-resolve later.
- Body: `{ units: Array<{ unitRef, scopeRowIds[] }>, shortDescription, issueType, responsibleParties[] | responsibleParty, isBlockingWork?, notes? }`
- Returns: `{ created: number, bulkGroupId: string }`

```
POST /api/projects/[id]/issues/export-pdf
```
- Session with project read visibility. Body: optional filters `{ issueIds?: string[], status?: "open"|"resolved"|"all", issueTypes?: IssueType[], responsibleParties?: ResponsibleParty[], authors?: string[], scopeNames?: string[], dateFrom?: "YYYY-MM-DD", dateTo?: "YYYY-MM-DD", sortOrder?: "newest"|"oldest", projectName?: string, filterSummary?: string, coverTitleLine?: string }`. When `issueIds` is non-empty, only those issues are exported (filters ignored); returns **404** if any id is missing. Otherwise filters apply server-side (AND-combined). Response: `application/pdf` attachment with issue photos and comment attachments when allowed by the PDF image fetch allowlist.

```
POST /api/projects/[id]/issues/[issueId]/resolve
```
- **Creator or ADMIN/DEVELOPER only** (returns 403 otherwise). Sets `status=RESOLVED`, stamps `resolvedAt` + `resolvedById`.
- Body: `{ resolutionNote?: string, resolveGroup?: boolean }`
  - `resolveGroup=true` + `bulkGroupId` present → resolves all OPEN issues with the same `bulkGroupId` in one `$transaction`
  - If `resolutionNote` provided, creates an `IssueComment` on each resolved issue
- Returns: `{ ...issue, resolvedCount: number }`

```
POST /api/projects/[id]/issues/[issueId]/reopen
```
- Creator or Admin only. Clears `resolvedAt` + `resolvedById`, sets `status=OPEN`.

```
GET  /api/projects/[id]/issues/[issueId]/comments
POST /api/projects/[id]/issues/[issueId]/comments
```
- GET: List comments in chronological order.
- POST: Any member. Body: `{ body, attachmentKeys[], attachmentUrls[], attachmentMimeTypes[], attachmentFileSizeBytes[] }`.

```
PATCH /api/projects/[id]/issues/[issueId]/comments/[commentId]
```
- Author only. Body: `{ body }`. Stamps `editedAt`. No delete endpoint.

## Observations

```
GET  /api/projects/[id]/observations
POST /api/projects/[id]/observations
```
- GET: Filter by `type` (catalog code), `projectRowId`, `projectLevel` (true = only observations with null/empty/`||` `unitRef`), `limit` (optional positive int, max 100 — returns `totalCount` alongside truncated results).
- POST: Required: `observationType`. Optional: `unitRef`, `title` (defaults `""`), `description` (defaults `""`), `projectRowIds[]` (defaults `[]`), `subScopeInstanceId`, `buildPhaseTag`, `areaTag` (project-level only — must match distinct values from project rows), attachment arrays, etc. Max 30 attachments per entity. Strict production: `enforceProductionFieldNotesMutation` (Admin may create without masquerade; Designer/Developer blocked on non-test projects).

```
GET /api/projects/[id]/field-notes/location-builder-tags
```
- Returns `{ buildPhases: string[], areas: string[] }` — distinct non-empty `buildPhase` / `area` values from `project_rows` for optional project-level field note tagging.

```
POST /api/projects/[id]/observations/bulk
```
- Any authenticated member. Creates one `ProjectObservation` per unit with a shared `bulkGroupId`.
- Body: `{ units: Array<{ unitRef, scopeRowIds[] }>, title?, description?, observationType }`
- Returns: `{ created: number, bulkGroupId: string }`

```
POST /api/projects/[id]/observations/export-pdf
```
- Session with project read visibility. Body: optional filters `{ observationIds?: string[], obsTypes?: ObservationType[], authors?: string[], buildings?: string[], datePreset?: "all"|"7d"|"30d"|"custom", dateFrom?: "YYYY-MM-DD", dateTo?: "YYYY-MM-DD", sortOrder?: "newest"|"oldest", projectName?: string, filterSummary?: string, coverTitle?: string, includeCover?: boolean, coverObservationCount?: number }`. When `observationIds` is non-empty, those observations are exported (max **20 ids per request** — larger exports batch client-side and merge PDFs). Filters AND-combine when no explicit ids. Response: `application/pdf` with photos and comment attachments when allowed.

```
GET   /api/projects/[id]/observations/[obsId]
PATCH /api/projects/[id]/observations/[obsId]
```
- PATCH: Author only. Editable: `title`, `description`, `observationType`, `unitRef` (nullable — project/building/level/unit hierarchy; custom site refs cannot be changed), `scopeTagIds[]` (cleared automatically when `unitRef` changes without `scopeTagIds`; scope rows must belong to the selected unit). Attachment add/remove/annotation updates supported.

```
GET /api/projects/[id]/field-notes/location-matrix
GET /api/projects/[id]/field-notes/scope-rows?building=&level=&unit=
```
- Auth: session + `enforceProjectReadVisibility`. Location matrix returns distinct buildings, levels-by-building, and units-by-building-level from `project_rows`. Scope-rows returns `{ scopes: [{ id, name }] }` for a unit triple.

```
GET  /api/projects/[id]/observations/[obsId]/comments
POST /api/projects/[id]/observations/[obsId]/comments
PATCH /api/projects/[id]/observations/[obsId]/comments/[commentId]
```
- Same rules as issue comments.

## Activity log feeds

```
GET /api/projects/[id]/activity
GET /api/activity
```
- Auth: session. Project route uses `enforceProjectReadVisibility`; dashboard route scopes to accessible non-deleted projects (test-project squad includes test projects). **`locationOutcome` filter and `activityLocation` hydration require `location:view` (`VIEW_LOCATION_TRACKING`)** — callers without the permission get events without location fields and locationOutcome is ignored server-side.
- Query: `eventType` (comma-separated), `locationOutcome` (comma-separated GPS outcomes: `on_map`, `denied`, `timeout`, `unavailable`, `no_capture`, `legacy`), `dateFrom`/`dateTo` (ISO8601), `cursor` (pagination), `limit` (default 50, max 200). Project route also accepts `userId`, `unit`, `building`, `level`. Dashboard route accepts `projectIds` (comma-separated) or legacy `projectId`.
- Response: `{ events, nextCursor, totalCount }` — `totalCount` is the full number of rows matching the current filters (excluding `cursor` pagination); `events` is one page. Read-time enrichment via `hydrateActivityPage()` merges `mediaPreviews` (image thumbnails, max 4 per event) into metadata for visible field-media events (issues, observations, inspections, unit album uploads) and **`activityLocation`** (GPS outcome + coords from `activity_location_contexts` or linked `media_capture_context`). Markup/annotation event types remain hidden per `lib/activity-hidden-events.ts`. **Display dedup:** the activity UI (and PDF/XLSX exports) collapse burst-duplicate scope status/subcontractor/inspection rows within a 3-minute window via `dedupeActivityEventsForDisplay()` — raw `activity_logs` rows are unchanged.

```
GET /api/projects/[id]/activity/heatmap
GET /api/activity/heatmap
GET /api/projects/[id]/activity/heatmap/missing
GET /api/activity/heatmap/missing
```
- Auth: same as activity feeds **plus `location:view` (`VIEW_LOCATION_TRACKING`)** — returns **403** without it. Query: `userIds` (comma), `dateFrom`/`dateTo`, dashboard routes also `projectIds`. Missing routes add `outcome`, `cursor`, `limit`.
- Response (heatmap): `{ actors, clusters, points, coverage, mapBounds?, projectSite? }` — collapsed logical events, ~50m clustering, coverage report. Missing: `{ events, nextCursor, totalCount }` for non-`on_map` outcomes.

```
POST /api/projects/[id]/activity/inspection-sync-failed
```
- Auth: session. Uses `enforceProductionProjectMutation` (same as other project mutation routes).
- Body: `{ offlineMutationId, clientQueuedAt, formName, category, outcome, syncErrors[], unit, building, level, scopeRowId?, scopeName? }` — `syncErrors` is the full client-side retry history (max 10 attempts).
- Effect: **Upserts** one `INSPECTION_SYNC_FAILED` row per `offlineMutationId` (IndexedDB `localId`). Updates merge `syncErrors`, refresh summary fields from the latest attempt, and bump `createdAt` so the card rises to the top of the feed. Called fire-and-forget from the inspection sync client after each failed attempt.
- Response: `{ created: true, id }` (**201**) on first write; `{ updated: true, id }` (**200**) on subsequent attempts for the same submission.

```
POST /api/projects/[id]/activity/mutation-sync-failed
```
- Auth: session. Uses `enforceProductionProjectMutation`.
- Body: `{ offlineMutationId, clientQueuedAt, mutationType, itemSummary, syncErrors[], unit?, building?, level?, rowId?, unitRef? }` — `syncErrors` is the full client-side retry history (max 10 attempts). `mutationType` is a queued mutation type (`create-observation`, `update-observation`, `update-unit-scope-status`, etc.).
- Effect: **Upserts** one `MUTATION_SYNC_FAILED` row per `offlineMutationId` (IndexedDB mutation queue id). Updates merge `syncErrors`, refresh summary fields from the latest attempt, and bump `createdAt`. Called fire-and-forget from `lib/offline/mutation-queue.ts` after each failed sync attempt on a queued mutation.
- Response: `{ created: true, id }` (**201**) on first write; `{ updated: true, id }` (**200**) on subsequent attempts.

**Offline replay metadata (successful uploads):** When a queued offline write succeeds, API handlers stamp activity metadata via `getActivityReplayMetadata()`: `replayedFromOfflineQueue: true`, `offlineMutationId`, `clientQueuedAt` (ISO8601), and `offlineCacheDurationMs` (computed in `logActivity` at server write time). The activity UI shows a “Synced from cache · {duration}” badge and appends “Uploaded from cache after {duration}” to the event summary. XLSX exports include **Queued At (offline)** and **Cache Duration** columns.

## Activity log exports

```
POST /api/projects/[id]/activity/export-xlsx
POST /api/activity/export-xlsx
```
- Auth: session. Project route uses `enforceProjectReadVisibility`; dashboard route scopes to non-deleted projects the user can read (test-project squad sees test projects).
- Body: `{ eventTypes?: string[], locationOutcomes?: string[], dateFrom?: ISO8601, dateTo?: ISO8601, projectIds?: string[] (dashboard only), unit?, building?, level? (project only) }`.
- Effect: Queries up to 5000 matching `activity_logs` rows and returns `.xlsx` (`Content-Disposition: attachment`). **404** when no events match filters; **500** on generation failure.
- Mirrors the corresponding `export-pdf` routes' filters and hidden event types (annotation/image-version events excluded; `FIELD_MEDIA_UPLOAD_RATE_LIMITED` hidden from non-squad roles). Applies the same burst-duplicate display collapse as the activity feed (`dedupeActivityLogsForExport`) before rendering — database rows are not deleted.

## Global progress report

```
GET /api/reports/global-progress
GET /api/reports/global-progress/[projectId]
POST /api/reports/global-progress/export-pdf
```

### List — collapsed portfolio cards

```
GET /api/reports/global-progress?preset=1w|2w|30d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
```
- Auth: effective session + `VIEW_DASHBOARD` (role-preview/masquerade aware).
- Query: `preset` required; `from`/`to` required when `preset=custom`. Dates parsed server-side via `resolveComparePeriodRange`.
- Returns `{ comparePeriod, projects[] }` where each project has `id`, `name`, `unifierPid`, `projectManagerName`, `installManagerName`, `hasChangesInPeriod`, and `scopeSummaries[]` (`scopeName`, `verifiedPct`, `verifiedDelta`, `verifiedUnitDelta`, `subPct`, `subDelta`, `subUnitDelta`). **No** building/level grid — detail is lazy-loaded on expand.
- Projects scoped to non-deleted rows the user can read (same visibility as `GET /api/projects`).
- **400** invalid query; **401**/**403** auth failures.

### Detail — expanded project grid

```
GET /api/reports/global-progress/[projectId]?preset=...&from=...&to=...
```
- Auth: effective session + `VIEW_DASHBOARD` + project read visibility (`enforceProjectReadVisibility`).
- Same query params as list. Returns `{ comparePeriod, project }` where `project` is a full `PortfolioProjectSnapshot`: nested `buildings[]` → `levels[]` → `cells[]`, with optional `units[]` per level when unit rows exist.
- Compare-period deltas computed from `activity_logs` (`SCOPE_STATUS_UPDATED`, bulk scope events) via reverse replay.
- **400** invalid query; **404** project not found or not visible.

### PDF export

```
POST /api/reports/global-progress/export-pdf
```
- Auth: effective session + `VIEW_DASHBOARD` + `enforceProjectReadVisibility` on `projectId`.
- Body: `PortfolioProgressExportPayload` assembled client-side from live detail API — project name/id, compare period (preset + date range), scope summary rows (verified/unverified % + deltas), and full `LevelScopeReportData` (buildings, levels, per-scope %, change, start/end dates, optional `levelOverallUnits` for overall-column qty).
- Effect: Landscape PDF for GC handoff — cover with period + overall verified rollup, scope summary table, and building/level grid.
- **400** invalid body; **404** when level report has no rows; **500** on PDF engine failure.

## Field daily report

```
GET  /api/reports/field-daily
POST /api/reports/field-daily/generate
GET  /api/reports/field-daily/projects
POST /api/reports/field-daily/export-pdf
POST /api/internal/field-daily/scheduled-generate
GET  /api/projects/[id]/field-daily
POST /api/projects/[id]/field-daily/generate
GET  /api/projects/[id]/field-daily/section-notes
POST /api/projects/[id]/field-daily/section-notes
PATCH /api/projects/[id]/field-daily/section-notes/[noteId]
DELETE /api/projects/[id]/field-daily/section-notes/[noteId]
POST /api/projects/[id]/field-daily/section-notes/[noteId]/replies
PATCH /api/projects/[id]/field-daily/section-notes/[noteId]/replies/[replyId]
DELETE /api/projects/[id]/field-daily/section-notes/[noteId]/replies/[replyId]
PUT  /api/projects/[id]/field-daily/workforce
GET  /api/projects/[id]/field-daily/hub
GET  /api/projects/[id]/field-daily/history
GET  /api/projects/[id]/field-daily/slice
GET  /api/projects/[id]/notes
POST /api/projects/[id]/notes
PATCH /api/projects/[id]/notes/[noteId]
DELETE /api/projects/[id]/notes/[noteId]
```

### Project overview notes

```
GET /api/projects/[id]/notes?limit=5&cursor=<noteId>
```
- Auth: session + `enforceProjectReadVisibility`.
- Returns `{ pinnedNotes?, notes, totalCount, nextCursor, previewNote }` — `pinnedNotes` on first page only (all pinned, newest pin first); `notes` is unpinned-only paginated list; `previewNote` prefers top pinned, else latest unpinned.

```
POST /api/projects/[id]/notes
```
- Body: `{ body: string }` (1–5000 chars).
- Auth: effective session + `enforceProductionFieldNotesMutation`.
- Returns `{ note }` (201).

```
PATCH /api/projects/[id]/notes/[noteId]
DELETE /api/projects/[id]/notes/[noteId]
```
- **PATCH** body: `{ body?: string, pinned?: boolean }` — at least one required. `body` is author-only edit (no time limit). `pinned` toggles pin for any user with mutation access.
- **DELETE** — author-only soft delete.
- Auth: effective session + `enforceProductionFieldNotesMutation`.

### Global report (install manager's portfolio)

```
GET /api/reports/field-daily?date=YYYY-MM-DD
```
- Auth: effective session + `VIEW_DASHBOARD` + role in `ADMIN` \| `INSTALL_DIRECTOR` \| `INSTALL_MANAGER` \| `PROJECT_MANAGER`.
- Returns `{ report, reportDate }` where `report` is null if not yet generated for that day.
- Projects scoped to those where `Project.installManagerId` = session user (PM/Admin see their assigned portfolio per service rules).

```
POST /api/reports/field-daily/generate
```
- Auth: same role gate as GET, plus `canGenerateFieldDailyReport` — **PROJECT_MANAGER receives 403** (view-only).
- Body: `{ date?: "YYYY-MM-DD", projectIds?: string[] }` (defaults to today in org TZ).
- Without `projectIds`: full regenerate — rebuilds all project slices with activity for that day (deletes prior project rows first).
- With `projectIds`: selective backfill — upserts only the listed projects **that have field activity** on that day; other projects on the same day report are left intact.
- `activityThrough` is end-of-day in org TZ for past dates, `now` for today.
- Effect: Builds or replaces snapshot from `activity_logs` through `activityThrough`. Uses advisory lock per `(installManagerUserId, reportDate)` to avoid racing project-hub generate. **200** `{ report, reportDate }`.
- Full generate (no `projectIds`) only writes project rows whose snapshot has activity in at least one report section (`snapshotHasFieldActivity`).

```
GET /api/reports/field-daily/projects?date=YYYY-MM-DD
```
- Auth: same role gate as GET (view-only roles allowed — used by backfill project picker).
- Returns `{ reportDate, projects: [{ id, projectName }] }` — **all active projects** the user may target in backfill (`loadBackfillProjects`: full portfolio for Admin/Install Director; assigned projects for Install Manager). Not limited to projects with existing reports or field activity on `date`.

```
POST /api/reports/field-daily/export-pdf
```
- Auth: effective session + `canUseFieldDailyReport` (`ADMIN` \| `INSTALL_DIRECTOR` \| `INSTALL_MANAGER` \| `PROJECT_MANAGER`) + `userCanAccessProjectFieldDaily` on `projectId`.
- Body: `{ projectId, reportDate, locale, labels, filterSummary?, activitySummary, exportedAt? }` — client sends localized labels and activity summary; server reloads the saved slice, hydrates issue/observation attachments, status-update album photos for that day, and clear-inspection submission photos, then embeds images inline in the matching sections.
- Effect: Portrait Letter PDF via Puppeteer with session-cookie image prefetch (same pattern as issues/observations export). Photos appear under status lines, inspection rows, issue cards, and observation cards — not a separate appendix.
- **400** invalid body; **404** when project or report slice missing; **500** on PDF engine failure.

```
POST /api/internal/field-daily/scheduled-generate
```
- Auth: `Authorization: Bearer <FIELD_DAILY_CRON_SECRET>`.
- Body: `{ date?: "YYYY-MM-DD", force?: boolean }`.
- Midnight cron (org TZ): generates **yesterday's** reports per active install manager with `trigger: SCHEDULED`. Only projects with activity in at least one section; skips IMs with no qualifying projects (no empty header).
- `force: true` bypasses the midnight-hour gate for manual backfill.
- Wired by `.github/workflows/field-daily-scheduled.yml` (hourly at :10 UTC; runs only during org-TZ hour 0 unless `force`).

### Per-project slice (hub card)

```
GET /api/projects/[id]/field-daily?date=YYYY-MM-DD
```
- Auth: session + field-daily role gate + project read visibility.
- Report owner: `resolveFieldDailyReportOwnerId(project.installManagerId, sessionUserId)` — same as hub/slice/history.
- Returns one project's slice from the IM's report for that date (or empty state).

```
POST /api/projects/[id]/field-daily/generate
```
- Auth: `canGenerateProjectFieldDailyReport` (IM self-assigned, Admin, Install Director).
- Body: `{ date?: "YYYY-MM-DD" }` — supports backfill for any past day through today.
- Effect: Upserts header + single project snapshot without wiping other projects in the same day report. `activityThrough` is end-of-day for past dates. **200** `{ slice, reportDate }`.

```
GET /api/projects/[id]/field-daily/hub
```
- Auth: project read + field-daily role gate.
- Returns hub card payload: today's report metadata, most recent activity preview, history count.

```
GET /api/projects/[id]/field-daily/history?from=&to=&cursor=&limit=
```
- Auth: same as hub.
- Paginated history entries (metadata only); full slice via `/slice`.

```
GET /api/projects/[id]/field-daily/slice?date=YYYY-MM-DD
```
- Auth: same as hub.
- Returns full project slice + persisted section comments for the canonical report owner.

```
GET /api/projects/[id]/field-daily/section-notes?reportDate=YYYY-MM-DD
```
- Auth: same as hub.
- Returns `{ notes, reportDate }` — threaded section notes for the project slice (newest first).

```
POST /api/projects/[id]/field-daily/section-notes
```
- Body: `{ reportDate?, sectionKey, itemKey?, body }`.
- Creates a new note (submit-based; does not replace prior notes). **201** `{ note, reportDate }`.

```
PATCH /api/projects/[id]/field-daily/section-notes/[noteId]
DELETE /api/projects/[id]/field-daily/section-notes/[noteId]
POST /api/projects/[id]/field-daily/section-notes/[noteId]/replies
PATCH /api/projects/[id]/field-daily/section-notes/[noteId]/replies/[replyId]
DELETE /api/projects/[id]/field-daily/section-notes/[noteId]/replies/[replyId]
```
- Author-only edit/delete; soft delete cascades replies. Replies are newest-first in API DTOs.

```
PUT /api/projects/[id]/field-daily/workforce
```
- Body: `{ reportDate?, dailyManpower: number | null }` — whole number 0–9999, or `null` to clear.
- Persists to `FieldDailyReportProject.dailyManpower` for the report day; records `dailyManpowerSetAt` + `dailyManpowerSetByUserId`. **200** `{ dailyManpower, dailyManpowerMeta, reportDate }` — `dailyManpowerMeta` is `{ setAt, setBy }` (same author shape as section notes) or `null` when cleared / legacy rows without audit fields.

## Global inspections report

```
GET /api/reports/global-inspections
```
- Auth: effective session + `VIEW_DASHBOARD`.
- Query: optional `from` / `to` (`YYYY-MM-DD`) — inclusive date range filter on submission `submittedAt`. Omitted = all time.
- Returns `{ submissions[] }` — flattened clear-inspection rows across all projects the user can read. Each row extends the project inspections report `SubmissionRow` with `projectId`, `projectName`, `scopeTypeCode`, `scopeTypeName`, and `sections[]` (deficiency breakdown by form section).
- **400** invalid date params; **401**/**403** auth failures.

### Project inspections report (shared by project + global rollups)

```
GET /api/projects/[id]/inspections-report?from=YYYY-MM-DD&to=YYYY-MM-DD&installerIds=id1,id2
```
- Auth: effective session + `enforceProjectReadVisibility` on `[id]`.
- Query: optional `from` / `to` date bounds on `submittedAt`; optional comma-separated `installerIds` (Unifier subcontractor IDs → `project_rows.unifierSubId`).
- Returns `{ projectStartedAt, availableInstallers[], scopeTypes[] }` with per-submission section/deficiency breakdown (same shape consumed by global rollups).
- **400** invalid date params; **401**/**404** auth/visibility failures.

## Inspection submissions

```
POST /api/inspection-submissions/[id]/export-pdf
```
- Auth: session + `enforceProjectReadVisibility` on the submission’s `projectId`.
- Effect: Renders a printable PDF (Puppeteer) for one inspection record — template snapshot, answers, deficiency photos, and inspector media. **400/404** when submission missing; **500** on PDF engine failure.
- PDF **500** responses use [`lib/pdf/pdf-export-errors.ts`](../../lib/pdf/pdf-export-errors.ts): body always includes `{ error }`; **`code`** (browser misconfiguration vs launch vs render) and **`details`** (truncated message) appear only when `isNonProd()` is true (`NODE_ENV !== "production"` or `APP_ENV === "dev"`). Same shape for other `**/export-pdf` routes and `POST /api/projects/[id]/level-scope-report`.

## Gemini — Transcription & Translation

```
POST /api/upload/field-media/[attachmentId]/transcribe
```
- Auth: any authenticated user. User-triggered only (not automatic after upload).
- Body: `{ sourceLang: string }` — BCP 47 language declared by user (e.g. `"es"`).
- Sets `transcriptStatus=PENDING → PROCESSING → COMPLETE|FAILED`.
- `transcriptEnglish` always populated (copy of `transcriptOriginal` if source is English).
- Returns: `{ transcriptStatus, transcriptLanguage, transcriptOriginal, transcriptEnglish }`.

```
POST /api/translate
```
- Auth: any authenticated user.
- Body: `{ contentType, contentId, sourceLang, targetLang }`. `contentType` ∈ `issue_description | obs_description | issue_comment | obs_comment`.
- Checks `ContentTranslation` cache first; returns immediately if found.
- If not cached: calls Gemini, stores result, returns `{ translated, cached: false }`.

## Canonical Scope Types

```
GET /api/canonical-scopes
```
- Auth: any authenticated user.
- Returns `{ canonicalScopes: [{ id, code, displayName, sortOrder }] }` ordered by `sortOrder`.
- Used by the upload linking prompt and scope-type dropdowns.

```
POST /api/canonical-scopes
```
- Auth: `MANAGE_ROLES` (ADMIN only).
- Body: `{ code: string (2–6 uppercase letters/digits), displayName: string }`.
- Creates a new canonical scope type with auto-incremented `sortOrder`.
- 409 if `code` already exists.
- Returns `{ canonicalScope: { id, code, displayName, sortOrder } }` (201).

```
PATCH /api/scope-types/[id]/link
```
- Auth: `MANAGE_ROLES` (ADMIN only).
- Body: `{ canonicalScopeTypeId: string }`.
- Sets `canonical_scope_type_id` on the raw `scope_types` row identified by `[id]`.
- Returns `{ scopeType: { id, code, name, canonicalScopeType: { id, code, displayName } } }`.
- Called by the upload linking prompt after the user resolves each unrecognized scope type.

### Upload flow — unlinked scope detection
`POST /api/projects` and `POST /api/projects/[id]/units` responses now include `unlinkedScopeTypes: [{ id, rawCode }]` when the upload introduced raw scope type values with no `canonical_scope_type_id`. The upload UI shows a required blocking `ScopeLinkingModal` when this array is non-empty.

### Per-project scope overrides (added 2026-06-19)

These routes allow each project to independently map its scope type codes to canonical display names without affecting other projects. ADMIN and CONTROLS_MANAGER can manage overrides via the Scope Setup panel inside Location Builder.

```
GET /api/projects/[id]/scope-overrides
```
- Auth: `VIEW_UPM` (read access).
- Returns all distinct scope types used in the project with their global canonical and any project-level override.
- Response: `{ scopes: [{ scopeTypeId, code, name, globalCanonical: { id, code, displayName } | null, projectOverride: { id, code, displayName } | null }] }`

```
POST /api/projects/[id]/scope-overrides
```
- Auth: `EDIT_UPM`.
- Body: `{ scopeTypeId: string, canonicalScopeTypeId: string }`.
- Upserts a project override for the given scope type. Validates that the scope type is actually used in this project.
- Response: `{ override: { id, scopeTypeId, canonicalScopeType: { id, code, displayName } } }`

```
DELETE /api/projects/[id]/scope-overrides/[scopeTypeId]
```
- Auth: `EDIT_UPM`.
- Removes the project override so the scope falls back to its global canonical. Idempotent — 200 even if no row existed.
- Response: `{ deleted: true }`

---

## BI / Reporting API (added 2026-04-13)

Auth: all BI routes use API key Bearer token (`Authorization: Bearer cc_bi_...`), validated by `lib/bi-auth.ts`. No session-based auth. Routes return JSON whose shape varies by endpoint — flat arrays for most datasets, `{ data, pagination }` for paginated endpoints (/units, /activity), `{ definitions, instances }` for /subscopes, and `{ reports, comments }` for /feedback?include=comments. All project-scoped routes filter `isTestProject: true` automatically.

### Admin — Role Manager (added 2026-06-18, FT-0072)

```
GET /api/admin/roles
```
- Auth: `MANAGE_ROLES` (session + special-permission elevation).
- Returns all roles with `permissions[]`, `isBuiltin`, and `userCount`.

```
POST /api/admin/roles
```
- Auth: `MANAGE_ROLES`.
- Body: `{ code, name, description?, permissions? }` — creates a custom role (`code` must match `^[A-Z][A-Z0-9_]{1,39}$`; built-in codes rejected).

```
PATCH /api/admin/roles/[id]
```
- Auth: `MANAGE_ROLES`.
- Body: `{ name?, description? }` — updates display metadata (not `code`).

```
DELETE /api/admin/roles/[id]
```
- Auth: `MANAGE_ROLES`.
- Custom roles only, `userCount === 0`. Built-in roles return 403.

```
PUT /api/admin/roles/[id]/permissions
```
- Auth: `MANAGE_ROLES`.
- Body: `{ permissions: string[] }` — replaces default permission set for the role. `masquerade:user` is not role-grantable. Invalidates `role-permission-cache`.

UI: `/admin/roles` (`RoleManager` component). Side nav visible when `MANAGE_ROLES`.

### Admin — API Key Management

```
GET /api/admin/api-keys
```
- Auth: `MANAGE_ROLES` (ADMIN only via session).
- Returns list of all API keys with `status` (`active`/`revoked`/`expired`).

```
POST /api/admin/api-keys
```
- Auth: `MANAGE_ROLES` (ADMIN only via session).
- Body: `{ name, party, scopes, allowedProjectIds, expiresAt?, assignedToId? }`.
- Returns the new key including `rawKey` (shown ONCE — never stored).

```
DELETE /api/admin/api-keys/[id]
```
- Auth: `MANAGE_ROLES` (ADMIN only via session).
- Sets `revokedAt`; row is kept for audit. 409 if already revoked.

### Admin — App Announcements

```
GET /api/admin/announcements
POST /api/admin/announcements
PATCH /api/admin/announcements/[id]
POST /api/admin/announcements/[id]/resend
POST /api/admin/announcements/upload-image
```
- Auth: **ADMIN role only** (real actor role during masquerade).
- CRUD for campaigns; `resend` increments `campaignVersion`; upload stores images in `field-media/announcements/`.
- HTML bodies sanitized on write via `lib/announcements/sanitize-announcement-html.ts`.

```
GET /api/announcements/active
POST /api/announcements/[id]/dismiss
```
- Auth: any logged-in session.
- `active` excludes user dismissals for current `campaignVersion`; all campaigns reach every logged-in user (schedule + dismiss only).

UI: `/admin/announcements` (`AnnouncementsManager`). Side nav when `isAdmin`. Live overlay: `AnnouncementHost` in dashboard layout.

### Discovery

```
GET /api/bi/v1
```
- Auth: valid API key (any scope).
- Returns all available endpoints, required scopes, key scopes, and allowedProjectIds.

### Projects

```
GET /api/bi/v1/projects
```
- Scope: `bi:projects`. Respects `allowedProjectIds`.
- Returns flat array: `[{ projectId, projectName, unifierPid, unifierProjectNumber, siteLocation, lifecycleStatus, phaseDisplay, startDate, installManagerId, installManagerName, projectManagerId, projectManagerName, createdAt, updatedAt }]`.

```
GET /api/bi/v1/projects/[id]
```
- Scope: `bi:projects`. 403 if project not in `allowedProjectIds`. 404 if test/deleted.
- Returns single project row (same shape as list).

### Units (paginated)

```
GET /api/bi/v1/projects/[id]/units?page=1&limit=500
```
- Scope: `bi:units`. Default limit 500, max 2000.
- Returns `{ data: [...rows], pagination: { page, limit, total, totalPages, hasNextPage, nextPage } }`.
- Each unit row: `{ rowId, projectId, rowIndex, building, level, unit, area, shipPhase, buildPhase, scheme, unitType, description, scopeCode, scopeName, csiPrimeCode, csiDetailCode, locationCode, locationName, costTypeCode, costTypeName, installerCode, installerName, qty, uomCode, uomName, unitRate, budgetedManHours, startDate, finishDate, percentComplete, actualManHours, scopeStage, scopeStatus, inspectionStatus, createdAt, updatedAt }`.

### Issues

```
GET /api/bi/v1/projects/[id]/issues
```
- Scope: `bi:issues`.
- Returns flat array: `[{ issueId, projectId, unitRef, shortDescription, issueType, responsibleParty, isBlockingWork, status, resolvedAt, createdByName, createdByEmail, resolvedByName, resolvedByEmail, createdAt, updatedAt }]`.

### Observations

```
GET /api/bi/v1/projects/[id]/observations
```
- Scope: `bi:observations`.
- Returns flat array: `[{ observationId, projectId, unitRef, title, description, observationType, authorName, authorEmail, createdAt, updatedAt }]`.

### Activity (paginated)

```
GET /api/bi/v1/projects/[id]/activity?page=1&limit=500
```
- Scope: `bi:activity`. Default limit 500, max 2000. Ordered newest-first.
- Returns `{ data: [{ eventId, projectId, userId, userName, eventType, metadata, createdAt }], pagination: {...} }`.

### Team

```
GET /api/bi/v1/team
```
- Scope: `bi:team`.
- Returns flat array: `[{ userId, name, email, roleCode, roleName, status, lastLoginAt, createdAt }]`.
- No sensitive fields (passwordHash, failedLoginAttempts, etc.).

---

## Rad-Dash Integration (outbound)

```
GET /api/webhooks/rad-dash-projects
```
- Auth: authenticated session with `hasFeedbackInboxAccess` (triage/admin)
- Derives the Rad-Dash base URL from `RAD_DASH_WEBHOOK_URL` (`.origin`) and proxies `GET /api/projects` server-side
- **Returns:** `RadDashProject[]` — `[{ id, name }, ...]`
- **503** if `RAD_DASH_WEBHOOK_URL` or `RAD_DASH_WEBHOOK_SECRET` env vars are not set
- **502** if Rad-Dash is unreachable or returns a non-ok status

```
POST /api/webhooks/send-to-rad-dash
```
- Auth: authenticated session with `hasFeedbackInboxAccess` (triage/admin)
- Body: `{ feedbackIds: string[], projectId: string }` — up to 50 IDs; `projectId` is a Rad-Dash project ID from `GET /api/webhooks/rad-dash-projects`
- Fetches feedback reports from DB, determines env (`dev` | `prod`) via `isStrictProductionDeployment()`, then POSTs to `RAD_DASH_WEBHOOK_URL` with `Authorization: Bearer <RAD_DASH_WEBHOOK_SECRET>`
- **Returns:** `{ created: number }` — count of tickets created in Rad-Dash
- **503** if `RAD_DASH_WEBHOOK_URL` or `RAD_DASH_WEBHOOK_SECRET` env vars are not set
- **502** if Rad-Dash is unreachable or rejects the payload
- Env vars: `RAD_DASH_WEBHOOK_URL`, `RAD_DASH_WEBHOOK_SECRET`
