# API Contracts — CP Build Command Center

This document is the reference for all API routes: their methods, auth requirements, request bodies, and response shapes. Keep it current whenever you add or change a route.

**Auth notation:**
- `Session` — any authenticated user (valid NextAuth session)
- `ADMIN` — requires `hasPermission(role, PERMISSIONS.X)` with an admin-level permission
- `None` — public, no auth required

---

## Projects

### `GET /api/projects`
**Auth:** Session
**Response:**
```json
[{
  "id": "cuid",
  "projectName": "Modera Marmalade",
  "siteLocation": "Austin, TX",
  "status": "Active | Planning | Completed | On Hold",
  "startDate": "2026-01-01",
  "salesforceId": "...",
  "installManagerId": "userId",
  "installManagerName": "...",
  "projectManagerId": "userId",
  "projectManagerName": "...",
  "unifierPid": "...",
  "unifierProjectNumber": "..."
}]
```
Only returns non-soft-deleted projects (`deletedAt: null`).

### `POST /api/projects`
**Auth:** ADMIN (`MANAGE_PROJECTS`)  
**Request body:**
```json
{
  "projectName": "string (required)",
  "siteLocation": "string (required)",
  "status": "Active | Planning | Completed | On Hold (default: Planning)",
  "startDate": "YYYY-MM-DD (optional)",
  "salesforceId": "string (optional)",
  "installManagerId": "string (optional)",
  "installManagerName": "string (optional)",
  "projectManagerId": "string (optional)",
  "projectManagerName": "string (required)",
  "unifierPid": "string (required, unique)",
  "unifierProjectNumber": "string (optional)",
  "upmData": [{ "Building": "1", "Level": "2", "Unit": "101", ... }]
}
```
**Response (201 created):**
```json
{ ...project, "restored": false, "unitsCount": 3024 }
```
**Response (200 restored):** Same shape with `"restored": true` — returned when `unifierPid` matches a soft-deleted project.  
**Response (409):** `{ "error": "A project linked to this Unifier project already exists." }` — if `unifierPid` matches an active project.

Note: `upmData` rows are filtered — only rows with at least one of Building/Level/Unit non-blank are inserted. See ADR-009.

### `GET /api/projects/[id]`
**Auth:** Session  
**Response:** Single project object (same shape as GET list item) plus `deletedAt`.

### `PATCH /api/projects/[id]`
**Auth:** ADMIN (`MANAGE_PROJECTS`)  
**Request body:** Partial project fields (same as POST, all optional). Also accepts `deletedAt: null` to restore.  
**Response:** Updated project object.

### `DELETE /api/projects/[id]`
**Auth:** ADMIN (`MANAGE_PROJECTS`)  
**Response (200):** `{ "message": "Project deleted" }` — soft delete (sets `deletedAt`).

---

## Project Units (project_rows)

### `GET /api/projects/[id]/units`
**Auth:** Session  
`scopeStatus` values are `NOT_STARTED | IN_PROGRESS | BLOCKED | PENDING_VERIFICATION | COMPLETE`. `PENDING_VERIFICATION` means subcontractor-reported install complete and must not be treated as verified complete.

**Response:**
```json
{
  "rows": [{
    "id": "cuid",
    "rowIndex": 0,
    "building": "1",
    "level": "1",
    "unit": "101",
    "area": "...",
    "shipPhase": "...",
    "buildPhase": "...",
    "scheme": "...",
    "unitType": "...",
    "description": "...",
    "scopeTypeId": "...",
    "csiPrimeCode": "...",
    "csiDetailCode": "...",
    "locationTypeId": "...",
    "costTypeId": "...",
    "installerId": "...",
    "qty": 1.0,
    "uomId": "...",
    "unitRate": 0.0,
    "budgetedManHours": 0.0,
    "startDate": "YYYY-MM-DD",
    "finishDate": "YYYY-MM-DD",
    "percentComplete": 0.0,
    "actualManHours": 0.0,
    "scopeStage": "STAGING | ASSEMBLY | INSTALL | null",
    "scopeStatus": "NOT_STARTED | IN_PROGRESS | BLOCKED | PENDING_VERIFICATION | COMPLETE | null",
    "inspectionStatus": "READY | PASSED | FAILED | null",
    "subScopeInstances": []
  }]
}
```

### `POST /api/projects/[id]/units`
**Auth:** ADMIN (`MANAGE_PROJECTS`)  
**Request body:**
```json
{ "upmData": [{ "Building": "...", "Level": "...", "Unit": "...", ... }] }
```
**Response (201):** `{ "inserted": N }`

### `PATCH /api/projects/[id]/units/[rowId]`
**Auth:** Session with `EDIT_UPM` or `MANAGE_UNIT_STATUS`
**Request body:** Partial unit fields. `scopeStage`, `scopeStatus`, and `inspectionStatus` require `MANAGE_UNIT_STATUS`. Direct `scopeStage`/`scopeStatus` updates return `409` when the row has sub-scope instances; update the sub-scope instances instead. `inspectionStatus` can only be non-null when the effective state is `INSTALL + COMPLETE`. Moving a row out of verified `INSTALL + COMPLETE`, including to `PENDING_VERIFICATION`, clears inspection status.
**Response:** Updated row object.

### `POST /api/projects/[id]/units/bulk-status`
**Auth:** Session (`MANAGE_UNIT_STATUS`)
**Request body:** `{ "rowIds": ["cuid"], "subScopeInstanceIds": ["cuid"], "scopeStage": "STAGING | ASSEMBLY | INSTALL | null", "scopeStatus": "NOT_STARTED | IN_PROGRESS | BLOCKED | PENDING_VERIFICATION | COMPLETE", "skipActivityLog": false }`
**Response (200):** `{ "updated": N, "skipped": N, "skippedIds": [], "blockedByBlockingIssue": [], "errors": N, "appliedRowIds": [], "appliedSubScopeInstanceIds": [] }`
`COMPLETE` is verified install complete. `PENDING_VERIFICATION` records Install Complete-SUB and does not set or preserve inspection status.

### `POST /api/projects/[id]/units/bulk-status/undo`
**Auth:** Session (`MANAGE_UNIT_STATUS`)
**Request body:** `{ "revertRows": [{ "id": "cuid", "scopeStage": "INSTALL", "scopeStatus": "PENDING_VERIFICATION", "inspectionStatus": null }], "revertInstances": [] }`
**Response (200):** `{ "restoredRows": N, "restoredInstances": N, "errors": N }`

### `PATCH /api/projects/[id]/sub-scopes/instances/[instanceId]`
**Auth:** Session (`MANAGE_UNIT_STATUS`)
**Request body:** Partial `{ "scopeStage": "STAGING | ASSEMBLY | INSTALL | null", "scopeStatus": "NOT_STARTED | IN_PROGRESS | BLOCKED | PENDING_VERIFICATION | COMPLETE | null", "inspectionStatus": "READY | PASSED | FAILED | null", "qty": 1 }`
**Response:** Updated sub-scope instance. `inspectionStatus` follows the same verified-only rule as row updates.

### `POST /api/projects/[id]/level-scope-report`
**Auth:** Session (`MANAGE_PROJECTS`)
**Request body:** `{ "projectName": "Project name" }`
**Response (200):** PDF attachment (`application/pdf`) grouped by level and scope. Percent complete is verified-only: only `INSTALL + COMPLETE` contributes to completed quantity; `PENDING_VERIFICATION` remains pending verification.

### `POST /api/projects/[id]/observations/export-pdf`
**Auth:** Session with project read visibility  
**Request body:** Optional filters `{ "observationIds": ["cuid"], "obsTypes": [], "authors": [], "buildings": [], "datePreset": "all | 7d | 30d | custom", "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD", "sortOrder": "newest | oldest", "projectName": "Project", "filterSummary": "string", "coverTitle": "string", "includeCover": true, "coverObservationCount": 47 }`. When `observationIds` is set, results follow that array order (max **20** ids per request — larger exports batch client-side). All active filters are AND-combined server-side (type, author, building, date preset). `coverTitle` is runtime-validated, trimmed, and capped before rendering. `includeCover: false` omits the cover page (continuation batches).  
**Response (200):** PDF attachment (`application/pdf`) for matching observations, including image attachments and comment image attachments when allowed by the PDF image fetch allowlist.  
**Errors:** 401 (unauthorized), 403/404 from project visibility, 400 (`PDF_BATCH_TOO_LARGE` when more than 20 `observationIds`), 404 (no matching observations), 500 (`PDF_*` render errors)

### `POST /api/projects/[id]/issues/export-pdf`
**Auth:** Session with project read visibility  
**Request body:** Optional filters `{ "issueIds": ["cuid"], "status": "open | resolved | all", "issueTypes": [], "responsibleParties": [], "authors": [], "scopeNames": [], "dateFrom": "YYYY-MM-DD", "dateTo": "YYYY-MM-DD", "sortOrder": "newest | oldest", "projectName": "Project", "filterSummary": "string", "coverTitleLine": "string" }`. `coverTitleLine` is runtime-validated, trimmed, and capped before rendering.  
**Response (200):** PDF attachment (`application/pdf`) for matching issues, including image attachments and comment image attachments when allowed by the PDF image fetch allowlist.  
**Errors:** 401 (unauthorized), 403/404 from project visibility, 404 (no matching issues), 500 (`PDF_*` render errors)

### `POST /api/projects/[id]/units/bulk-delete`
**Auth:** ADMIN (`MANAGE_PROJECTS`)  
**Request body:** `{ "rowIds": ["cuid", ...] }`  
**Response (200):** `{ "deleted": N }`

---

## Forms, Inspections, and Reports

### `GET /api/forms`
**Auth:** Session
**Response:** Form template list. Form builder JSON remains available for the UI, while published versions are also normalized into inspection form section/question tables for reporting.

### `PATCH /api/forms/[id]`
**Auth:** Session
**Request body:** Partial form builder fields including `name`, `description`, `category`, `status`, and section/question JSON.
**Response:** Updated form. Save/publish flows dual-write normalized form sections, questions, version sections, and version questions without changing the frontend form-builder contract.

### `POST /api/inspection-submissions`
**Auth:** Session
**Request body:**
```json
{
  "formId": "cuid",
  "formVersionId": "cuid | null",
  "templateSnapshot": { "name": "Clear Inspection", "category": "CLEAR_INSPECTION" },
  "projectId": "cuid",
  "unitId": "cuid",
  "scopeRowId": "cuid | null",
  "scopeTypeCode": "string | null",
  "outcome": "PASS | FAIL | COMPLETE",
  "deficiencyCount": 0,
  "payload": {},
  "categoryOverride": "CALIBRATION_INSPECTION | undefined",
  "calibratedAgainstSubmissionId": "cuid (required when categoryOverride is CALIBRATION_INSPECTION)"
}
```
**Response (201):** `{ "submission": { ... } }`

For regular `CLEAR_INSPECTION` submissions with `scopeRowId`, the row must be `INSTALL + COMPLETE` and have a subcontractor assigned. The API updates the row's `inspectionStatus` and creates a `clear_inspections` row with `inspected_by_id` (inspector). Calibration submissions use `categoryOverride: "CALIBRATION_INSPECTION"`, require `calibratedAgainstSubmissionId` (the clear submission being reviewed), set `clear_inspections.calibrated_against_clear_inspection_id` on the new history row, and never update scope inspection status or clear-inspection chain state.

GET list/detail responses include nested `clearInspection.inspectedBy` / `inspectedById` — not `submittedByName` on the submission row.

The endpoint dual-writes normalized `inspection_answers`, `inspection_deficiencies`, and `inspection_deficiency_media` rows from the payload. Activity metadata includes failed-question and total-deficiency counts for failed inspections.

### `PUT /api/inspection-submissions/[id]`
**Auth:** Session
**Request body:** `{ "outcome": "PASS | FAIL | COMPLETE", "deficiencyCount": 0, "payload": {} }`
**Response (200):** `{ "submission": { ... } }`

Only the latest submission for the scope/form can be edited. Regular clear-inspection edits sync scope inspection status; calibration edits remain observational and do not change the scope status.

### `POST /api/inspection-submissions/[id]/export-pdf`
**Auth:** Session with project read visibility on the submission's `projectId`  
**Response (200):** PDF attachment (`application/pdf`) for the inspection submission, including answer/deficiency details and allowed image media.  
**Errors:** 401 (unauthorized), 403/404 from project visibility, 404 (submission not found), 500 (`PDF_*` render errors)

### `GET /api/projects/[id]/inspections-report`
**Auth:** Session  
**Query:** `from`, `to` (optional ISO dates — omit both for all project inspections), `installerIds` (comma-separated Unifier subcontractor ids)  
**Response:** Project inspection report rows joined from normalized submissions, answers, deficiencies, scope rows, project metadata, and subcontractor assignment. Reporting should derive project/unit/scope context through joins rather than duplicated columns on answer or deficiency rows.

### `GET /api/projects/[id]/album`
**Auth:** Session
**Response:** Location media including standard field media plus inspection deficiency media. Inspection media entries include source metadata so the location viewer can badge them as inspection-sourced.

### `GET /api/projects/[id]/activity`
**Auth:** Session
**Response:** Project activity events, optionally filtered by event type, user, date, and location metadata. Inspection activity is hydrated from linked submissions so historical calibration submissions display as calibration events even if older activity metadata stored the underlying form category.

### `GET /api/activity`
**Auth:** Session
**Response:** Cross-project activity feed for projects visible to the current user. Uses the same inspection metadata hydration as the project activity endpoint.

---

## Invites

### `GET /api/invites`
**Auth:** ADMIN  
**Response:** Array of invites with status, recipient email, role, expiry.

### `POST /api/invites`
**Auth:** ADMIN (`INVITE_MEMBER`)  
**Request body:**
```json
{ "email": "user@example.com", "role": "MEMBER | ADMIN" }
```
**Response (201):** `{ "invite": { "id": "...", "email": "...", "token": "...", "role": "...", "expiresAt": "..." } }`

### `POST /api/invites/[id]/resend`
**Auth:** ADMIN  
**Response (200):** `{ "message": "Invite resent" }`

### `GET /api/invites/validate?token=...`
**Auth:** None  
**Response (200):** `{ "invite": { "email": "...", "role": "..." } }`  
**Response (404):** `{ "error": "Invite not found or expired" }`

### `POST /api/invites/accept`
**Auth:** None  
**Request body:**
```json
{ "token": "...", "name": "...", "password": "..." }
```
**Response (200):** `{ "message": "Account created" }`

---

## Team

### `GET /api/team`
**Auth:** Session (`VIEW_TEAM`)  
**Response:** Array of team members with id, name, email, role, createdAt.

### `GET /api/team/[id]`
**Auth:** Session  
**Response:** Single team member object.

### `PATCH /api/team/[id]`
**Auth:** ADMIN  
**Request body:** `{ "role": "ADMIN | MEMBER" }`  
**Response:** Updated user object.

### `DELETE /api/team/[id]`
**Auth:** ADMIN  
**Response (200):** `{ "message": "User removed" }`

---

## Lookups

### `GET /api/lookups`
**Auth:** Session  
**Response:**
```json
{
  "scopeTypes": [{ "id": "cuid", "name": "...", "code": "..." }],
  "uoms": [{ "id": "cuid", "name": "...", "abbreviation": "..." }],
  "locationTypes": [{ "id": "cuid", "name": "..." }],
  "costTypes": [{ "id": "cuid", "name": "..." }]
}
```

---

## Roles

### `GET /api/roles`
**Auth:** Session  
**Response:** `[{ "value": "ADMIN", "label": "Admin" }, { "value": "MEMBER", "label": "Member" }]`

---

## Unifier

### `GET /api/unifier/projects`
**Auth:** Session  
**Response:** Array of Unifier projects pulled from Oracle Primavera **that are not already linked** in Command Center (existing `unifierPid` rows are omitted).  
**Response header:** `X-CC-Unifier-Linked-Count` — integer count of Command Center projects that already have a Unifier PID (same basis as the filter).  
Shape: `[{ "pid": "...", "projectName": "...", "projectNumber": "...", "location": "...", "status": "...", "projectManagerName": "...", "clientName": "...", "projectType": "..." }]`

### `GET /api/unifier/projects/[pid]/documents`
**Auth:** Session  
**Response:** Documents for a specific Unifier project.

---

## Feedback Assist

### `GET /api/feedback/assist`
**Auth:** Session  
**Response:** `{ "enabled": true, "maxTurns": 5 }` — `enabled` is false when Gemini is not configured.

### `POST /api/feedback/assist`
**Auth:** Session  
**Request body:** `assistTurnRequestSchema` from [`lib/feedback-assist-schema.ts`](../../lib/feedback-assist-schema.ts): `{ "sessionId": "string", "initial": { "feedbackType": "BUG | FEATURE_REQUEST", "title": "string", "description": "string", "pageUrl": "string | null" }, "transcript": [], "finalize": false, "videoRef": "optional" }`  
**Response:** `assistTurnResponseSchema`: either `{ "kind": "question", "question": "...", "turnNumber": 1, "remainingTurns": 4 }` or `{ "kind": "final_report", "report": { ... }, "turnNumber": 1 }`.  
**Errors:** 400 (invalid input), 401 (unauthorized), 429 (`RATE_LIMITED`), 503 (`AI_DISABLED`), 500 (`AI_UPSTREAM_FAILED`)

### `POST /api/feedback/assist/video`
**Auth:** Session  
**Request body:** `multipart/form-data` with `recording` (`video/webm` or `video/mp4`, max 50 MB) and `metadata` matching `assistVideoRequestMetadataSchema`.  
**Response:** `assistTurnResponseSchema` plus optional `videoRef` (`fileUri`, `mimeType`, `expiresAt`) for subsequent assistant turns.  
**Errors:** 400 (invalid size/type/metadata), 401 (unauthorized), 429 (`RATE_LIMITED`), 503 (`AI_DISABLED`), 500 (`AI_UPSTREAM_FAILED`)

### `POST /api/feedback/assist/image`
**Auth:** Session  
**Request body:** `multipart/form-data` with `image` (`image/png`, `image/jpeg`, `image/webp`, max configured image size) and `metadata` matching `assistImageRequestMetadataSchema`.  
**Response:** `{ "imageRef": { "fileUri": "string", "mimeType": "string", "expiresAt": "datetime" } }` for optional Gemini Files grounding on assistant turns/calibration.  
**Errors:** 400 (invalid size/type/metadata), 401 (unauthorized), 429 (`RATE_LIMITED`), 503 (`AI_DISABLED`), 500 (`AI_UPSTREAM_FAILED`)

### `POST /api/feedback/assist/calibrate`
**Auth:** Session  
**Request body:** `assistCalibrateRequestSchema` from [`lib/feedback-assist-schema.ts`](../../lib/feedback-assist-schema.ts): `{ "sessionId": "string", "currentReport": { ... }, "feedbackType": "BUG | FEATURE_REQUEST", "pageUrl": "string | null", "instruction"?: "string", "calibrationInstructions"?: "string", "initial"?: { "feedbackType", "title", "description", "pageUrl" }, "transcript"?: AssistTranscriptEntry[], "videoRef"?: AssistVideoRef | null, "imageRef"?: AssistImageRef | null }`. Provide **`instruction` or `calibrationInstructions`** (at least one non-empty). `feedbackType` must match `currentReport.kind`. Optional `videoRef` / `imageRef` ground multimodal calibration via Gemini Files API.  
**Response:** `{ "kind": "final_report", "report": { ... } }`  
**Errors:** 400 (invalid input or mismatched `feedbackType`/`currentReport.kind`), 401 (unauthorized), 429 (`RATE_LIMITED`), 503 (`AI_DISABLED`), 500 (`AI_UPSTREAM_FAILED`)

---

## Offline

### `GET /api/offline/preferences`
**Auth:** Session  
**Response:** `{ "modules": ["projects", ...], "syncFrequency": 300 }`

### `PATCH /api/offline/preferences`
**Auth:** Session  
**Request body:** Partial offline preference fields.

### `GET /api/offline/snapshot`
**Auth:** Session  
**Response:** Current offline data snapshot for the authenticated user.

---

## Auth

### `POST /api/auth/[...nextauth]`
NextAuth endpoint — handles credentials sign-in, sign-out, session. Not versioned here; see NextAuth docs and `lib/auth.ts`.

---

## Health

### `GET /api/health`
**Auth:** None
**Response (200):** `{ "ok": true, "status": "ok", "timestamp": "...", "version": "..." }`
**Response (503):** `{ "ok": false, "status": "error", "reason": "db_unreachable", "timestamp": "...", "version": "..." }`

---

## DevTools (Admin-only, non-production)

All `/api/devtools/*` routes require:
- `ADMIN` role or `ACCESS_DEVTOOLS` permission (also granted to `DEVELOPER`)
- `isDevToolsAllowed()` to return true (blocked in production by `APP_ENV`)

| Route | Description |
|-------|-------------|
| `GET /api/devtools/diagnostics` | Auth probe — used by ServerLogs component for pre-flight check |
| `GET /api/devtools/logs` | SSE stream of server logs |
| `GET /api/devtools/logs-snapshot` | Latest N log entries as JSON |
| `GET /api/devtools/test-plan` | Source file coverage structure (no coverage file required) |
| `POST /api/devtools/run-tests` | SSE stream that runs unit test suite (local dev only) |
| `GET /api/devtools/test-email` | Sends a test email to the admin's address |
| `GET /api/devtools/schema-diff` | Compares Prisma schema to DB — shows drift |
| `GET /api/devtools/data` | Returns summary of DB row counts per table |
| `GET /api/devtools/recent-tests` | Last N test run results |

---

## Release Verification (Automation)

### `POST /api/automation/release-verification`
**Auth:** `Authorization: Bearer <AUTOMATION_SECRET>` OR admin session (`MANAGE_ROLES`)  
**Description:** Generates (or regenerates) a Gemini-powered QA verification checklist for a release. Idempotent — returns existing steps if already present and no feedback provided.  
**Request body:**
```json
{
  "releaseId": "cuid",
  "feedback": "optional free-text to refine previously generated steps"
}
```
**Response (201 — created/regenerated):**
```json
{ "releaseId": "cuid", "steps": [{ "id": "slug", "changeId": "c1", "title": "...", "instructions": "...", "route": "/en/projects", "category": "bug-fix" }] }
```
**Response (200 — skipped, steps already exist, no feedback):**
```json
{ "releaseId": "cuid", "steps": [...] }
```
**Errors:** 400 (missing releaseId), 401 (unauthorized), 404 (release not found), 503 (GEMINI_API_KEY not set)

---

## Release Share Link

### `GET /api/releases/share-link?releaseId=<id>&locale=<en|es>`
**Auth:** Admin session (`MANAGE_ROLES`)  
**Description:** Returns a shareable URL that triggers the release tour deep link for any authenticated user. Lands on `/[locale]/projects?tour=<releaseId>`.  
**Query params:**
- `releaseId` (required) — ID of the release whose tour to link
- `locale` (optional, default `en`) — locale prefix for the URL

**Response (200):**
```json
{ "url": "https://command-center-reboot-production.up.railway.app/en/projects?tour=<releaseId>" }
```
**Errors:** 400 (missing releaseId), 401 (unauthenticated), 403 (not admin), 404 (release or tour not found)

---

## Announcements

Admin-managed in-app campaigns (rich HTML EN/ES, optional hero image, schedule window). Full contract notes: `docs/agent-context/api-endpoints.md` (Announcements section).

### `GET /api/announcements/active`
**Auth:** Any logged-in session  
**Response (200):** `{ announcements: ActiveAnnouncementDto[] }` — schedule-eligible rows minus per-user dismissals for the current `campaignVersion`. All campaigns reach every logged-in user (no client-side audience filter).

### `POST /api/announcements/[id]/dismiss`
**Auth:** Any logged-in session  
**Description:** Records dismissal for the current `campaignVersion`.

### `GET /api/admin/announcements`
**Auth:** Admin only  
**Response (200):** `{ announcements: AdminAnnouncementDto[] }` with dismiss counts.

### `POST /api/admin/announcements`
**Auth:** Admin only  
**Body:** slug, titleEn/Es, bodyEn/Es, optional hero URLs, optional CTA, `startsAt`/`endsAt` (ISO datetime), `active`, `priority`.  
**Note:** `audience` is always stored as `ALL` (not accepted from client).

### `PATCH /api/admin/announcements/[id]`
**Auth:** Admin only  
**Body:** Partial update; same fields as POST where optional.  
**Note:** Always normalizes `audience` to `ALL` (legacy `WEB_SHARE_CAPABLE` rows are upgraded on save).

### `POST /api/admin/announcements/[id]/resend`
**Auth:** Admin only  
**Description:** Increments `campaignVersion` so dismissed users see the campaign again.

---

## Adding a New Route

When you add a new API route:
1. Add it to this document in the same PR
2. Include: method, path, auth level, request body, response shape, any error shapes
3. Add the appropriate label to the PR: `contracts:api`
