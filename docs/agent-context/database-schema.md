# Database Schema — CP Build Command Center

> PostgreSQL via Prisma 7 + `@prisma/adapter-pg`. Source of truth: `prisma/schema.prisma`.
> This file summarizes all models so agents can reason about data without opening the schema.

## Enums

| Enum | Values |
|------|--------|
| `ProjectStatus` | `Active`, `Completed`, `Planning`, `OnHold` |
| `ScopeStage` | `STAGING`, `ASSEMBLY`, `INSTALL` |
| `ScopeStatus` | `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `PENDING_VERIFICATION`, `COMPLETE` |
| `InspectionStatus` | `READY`, `PASSED`, `FAILED` |
| `ClearInspectionStatus` | `PASSED`, `FAILED` |
| `LayoutIssueStatus` | `OPEN`, `FIXED` |
| `FeedbackType` | `BUG`, `FEATURE_REQUEST` |
| `FeedbackStatus` | `OPEN`, `IN_PROGRESS`, `RESOLVED` |
| `FeedbackSource` | `IN_APP`, `MARKER_IO` |
| `FeedbackPriority` | `LOW`, `MEDIUM`, `HIGH` |
| `ActivityEventType` (table `activity_event_type`) | … plus `INSPECTION_SYNC_FAILED` (inspection offline sync failure — one upserted row per `offlineMutationId`, metadata includes `syncErrors[]`), `MUTATION_SYNC_FAILED` (general mutation-queue sync failure — same upsert pattern; metadata includes `mutationType`, `itemSummary`, `syncErrors[]`), `PROJECT_CLONED_AS_TEST`, `PROJECT_TEST_DATA_SEEDED`, `PROJECT_TEST_DATA_BATCH_REMOVED`, `SCOPE_SUBCONTRACTOR_UPDATED`, `CUSTOM_SITE_LOCATION_UPDATED`, `UNIT_PHOTO_UPLOADED` (standalone unit album photo — metadata includes `attachmentId`, `unitRef`, `sourceType`, `sourceLabel`), `FIELD_DAILY_DAILY_MANPOWER_SET` (daily manpower set/cleared on a field daily report slice — metadata includes `reportDate`, `dailyManpower`, `previousDailyManpower`) |

## Core Auth Models

### `User` (table: `"User"`)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `email` | `String` UNIQUE | |
| `passwordHash` | `String?` | bcryptjs, 12 rounds |
| `name` | `String?` | |
| `image` | `String?` | |
| `roleId` | `String` FK→`roles.id` | ON DELETE RESTRICT |
| `status` | `UserStatus` default `ACTIVE` | Account status: `ACTIVE`, `INACTIVE`, `SUSPENDED`. Non-ACTIVE users are blocked at login. |
| `failedLoginAttempts` | `Int` default 0 | Login security |
| `lockedUntil` | `DateTime?` | Account lockout |
| `lastLoginAt` | `DateTime?` | |
| `unifierUserId` | `String?` UNIQUE | Linked Unifier user ID from `UNIFIER_SYS_USER_INFO`. Set by admin via `POST /api/users/[id]/link-unifier`. |
| `unifierUsername` | `String?` | Unifier username (display only, copied at link time). |
| `agentName` | `String?` | Name of the user's Cursor AI agent (e.g. "Max"). Used in attribution tags. |
| `agentCallsign` | `String?` | 3-letter callsign in ALL CAPS (e.g. "MAX"). Auto-suggested from agent name. |
| `agentMission` | `String?` | One-sentence mission statement for the agent. |

Migration: `prisma/migrations/20260306000000_add_unifier_user_link/migration.sql`
Migration: `prisma/migrations/20260317000001_add_agent_identity_to_user/migration.sql`
Migration: `prisma/migrations/20260328180000_add_user_status/migration.sql`

Relations: `role`, `accounts[]`, `sessions[]`, `invitesSent[]`, `offlinePreference?`, `specialPermissions[]`, `feedbackReports[]`, `passwordResetTokens[]`

### `Role` (table: `roles`)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `code` | `String` UNIQUE | e.g. `"ADMIN"`, `"MEMBER"` |
| `name` | `String` | Display name |

11 seeded roles (ADMIN, MEMBER, TEAM_LEAD, DESIGNER, PRODUCT, DEVELOPER, EXECUTIVE, CONTROLS_MANAGER, INSTALL_MANAGER, PROJECT_MANAGER, PROJECT_COORDINATOR). SUPER_ADMIN was removed and merged into ADMIN.

### `Permission` (table: `permissions`)
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `code` | `String` UNIQUE | e.g. `"invite:member"` |

7 seeded permission codes in early migrations; full catalog synced by `npm run bootstrap:permissions` from `lib/permissions.ts` / `lib/permission-metadata.ts`.

### `RolePermission` (table: `role_permissions`)
Composite PK: `[roleId, permissionId]`. Join table — no extra columns.

**Runtime authority:** `hasPermission()` reads role-default grants from this table via `lib/role-permission-cache.ts` (warmed on server start + invalidated after Role Manager edits). `ROLE_PERMISSIONS` in code is the bootstrap default only — `npm run bootstrap:role-permissions` backfills missing rows without deleting admin changes.

### `UserSpecialPermission` (table: `user_special_permissions`)
Per-user permission overrides (elevate access without changing role).
| Column | Type | Notes |
|--------|------|-------|
| `userId` | FK→`User` | |
| `permission` | `String` | Permission code |
| `grantedById` | `String?` FK→`User` | |
| `note` | `String?` | Reason for grant |

UNIQUE: `[userId, permission]`

### `Invite` (table: `"Invite"`)
| Column | Type | Notes |
|--------|------|-------|
| `token` | `String` UNIQUE | Sent in invite email link |
| `email` | `String` | Invitee email |
| `roleId` | FK→`roles` | Role to assign on accept |
| `sentById` | FK→`User` | |
| `expiresAt` | `DateTime` | |
| `acceptedAt` | `DateTime?` | Null = not yet accepted |

### `PasswordResetToken` (table: `password_reset_tokens`)
| Column | Type | Notes |
|--------|------|-------|
| `tokenHash` | `String` UNIQUE | SHA-256 of raw token — never store raw |
| `userId` | FK→`User` | |
| `expiresAt` | `DateTime` | 1-hour expiry |
| `usedAt` | `DateTime?` | One-use enforcement |

### Auth.js Infrastructure
- `Account` — OAuth provider accounts (standard Auth.js shape)
- `Session` — server-side sessions (JWT strategy; table exists for compatibility)
- `VerificationToken` — email verification tokens

## Project Models

### `Project` (table: `"Project"`)
Stores **Command Center–owned** linkage and assignments only. **Name, site, lifecycle status, PM name, project number, and start date** are **not** columns here — they come from the Unifier shell (`getProjects` / `getProjectByPid`, module cache TTL ~5m) and are merged in `lib/project-unifier-merge.ts` for API responses.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `installManagerId` | `String?` | User ID (denormalized ref) |
| `installManagerName` | `String?` | Denormalized — stored at write time |
| `projectManagerId` | `String?` | |
| `unifierPid` | `String?` UNIQUE | Oracle Unifier internal PID — required for live metadata |
| `deletedAt` | `DateTime?` | Soft delete — null = active |
| `isTestProject` | `Boolean` default `false` | Production sandbox — visible only to Admin/Developer/Designer in strict production (`lib/production-project-access.ts`) |
| `clonedFromProjectId` | `String?` FK→`Project.id` | Set when Admin duplicated a live project as test sandbox (`onDelete: SetNull`) |
| `sourceUnifierPid` | `String?` | Original Unifier PID from source project — used for display merge on clones |
| `clonedAt` | `DateTime?` | Historical timestamp when legacy duplicate-as-test ran (feature removed; column retained) |
| `createdAt`, `updatedAt` | `DateTime` | |

Indexes: `deletedAt`, `installManagerId`, `isTestProject`, `projectManagerId`, `unifierPid`, `clonedFromProjectId`

### `ProjectCustomSiteLocation` (table: `project_custom_site_locations`)
User-defined site areas (parking lot, loading dock, etc.) for **field notes only** — observations and issues linked via `@custom|{id}|{name}` unit refs. No UPM install rows.

| Column | Type | Notes |
|--------|------|-------|
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `name` | `String` | Display name |
| `building`, `level` | `String` default `""` | Empty for standalone placement |
| `placement` | `CustomSitePlacement` enum | `standalone` \| `building` \| `building_level` |
| `sortOrder` | `Int` | UI ordering |
| `createdById` | FK→`User` | Creator |
| `createdAt`, `updatedAt` | `DateTime` | |

Unique: `(projectId, placement, building, level, name)` — duplicate check is scoped to the same placement/building/level bucket (case- and whitespace-insensitive on name in API).

Activity events: `CUSTOM_SITE_LOCATION_CREATED`, `CUSTOM_SITE_LOCATION_DELETED` (`ActivityEventType`).

Index: `projectId`

### `ProjectRow` (table: `project_rows`)
One row = one unit of work from the UPM spreadsheet. 25+ columns.

| Column | Type | Notes |
|--------|------|-------|
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `rowIndex` | `Int` | Preserves spreadsheet row order |
| `building`, `level`, `unit`, `area` | `String` | Location hierarchy |
| `shipPhase`, `buildPhase`, `scheme` | `String` | Phase tracking strings |
| `unitType`, `description` | `String` | |
| `scopeTypeId` | FK→`ScopeType?` | ON DELETE SET NULL |
| `csiPrimeCode`, `csiDetailCode` | `String` | CSI specification codes |
| `locationTypeId` | FK→`LocationType?` | |
| `costTypeId` | FK→`CostType?` | |
| `installerId` | FK→`InstallTeam?` | UPM “Installer” column → `install_teams` |
| `qty` | `Decimal(18,4)?` | |
| `uomId` | FK→`UomType?` | Unit of measure |
| `unitRate`, `budgetedManHours`, `actualManHours` | `Decimal(18,4)?` | |
| `percentComplete` | `Decimal(5,2)?` | |
| `startDate`, `finishDate` | `DateTime?` | |
| `scopeStage` | `ScopeStage?` | STAGING / ASSEMBLY / INSTALL. **Blocked for direct update when `subScopeInstances` are present.** |
| `scopeStatus` | `ScopeStatus?` | NOT_STARTED / IN_PROGRESS / BLOCKED / PENDING_VERIFICATION / COMPLETE. **Blocked for direct update when `subScopeInstances` are present.** |
| `inspectionStatus` | `InspectionStatus?` | READY / PASSED / FAILED — set after INSTALL+COMPLETE |

Indexes: `projectId`, `(projectId, building, level, unit)`

### `InspectionType` (table: `inspection_types`)
Lookup for formal inspection categories. Bootstrap rows (see `lib/inspections/inspection-type-codes.ts`): `CLEAR_INSPECTION`, `CALIBRATION_INSPECTION`, `TWO_AREA_CLEAR`, `FIELD_VERIFICATION`, `GYPCRETE_MOISTURE_TEST`, `OTHER`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK (stable seed ids in migration + bootstrap) |
| `code` | `String` unique | One of the codes above |
| `name` | `String` | Display label |

### `ClearInspection` (table: `clear_inspections`)
Pass/fail **inspection event** on a scope row. Vision: rename to `inspections` and track all form-based types here; `inspection_submissions` holds answers. Today: formal clears + calibrations both write a row; legacy toggles may have no submission link.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `rowId` | FK→`ProjectRow` | ON DELETE CASCADE |
| `status` | `ClearInspectionStatus` | `PASSED` or `FAILED` |
| `inspectionTypeId` | FK→`InspectionType` | Authoritative for BI — join `inspection_types` |
| `inspectedById` | FK→`User?` | Who performed the inspection; BI joins `"User"` |
| `inspectionSubmissionId` | FK→`InspectionSubmission?` | Form answers live on the submission. Unique when present. |
| `calibratedAgainstClearInspectionId` | FK→`ClearInspection?` | Set on calibration rows — the original clear being reviewed |
| `createdAt`, `updatedAt` | `DateTime` | When the inspection occurred (`createdAt` = submit time for form rows) |

Index: `rowId`. Migration: `20260331130000_add_clear_inspections`; form-backed submission link added in `20260518124500_normalize_inspection_deficiencies`.

**Design note:** No unique constraint on `rowId` — multiple records per scope are intentional for the future activity feed. No DELETE endpoint in v1.

### Form Reporting Tables
The form builder still stores JSON snapshots in `forms.draftSections` and `form_versions.sections` for backward compatibility, but the same data is now mirrored into relational reporting tables for UI/BI queries.

| Model | Table | Purpose |
|---|---|---|
| `InspectionFormSection` | `inspection_form_sections` | Current editable form sections, linked to `Form` by `formId` |
| `InspectionFormQuestion` | `inspection_form_questions` | Current editable form questions, including `responseType`, options, required/photo flags, deficiency settings, parent/follow-up metadata, and display order |
| `InspectionFormVersionSection` | `inspection_form_version_sections` | Immutable published-version sections, linked to `FormVersion` |
| `InspectionFormVersionQuestion` | `inspection_form_version_questions` | Immutable published-version questions; BI source for what was asked in a specific form version |

All question rows preserve `sourceQuestionId`, `sourceSectionId`, `title`, `description`, `responseType`, `options`, and `rawQuestion`. Fail follow-up answers use source ids shaped like `${parentQuestionId}__followup` so submitted answers can join directly to the version-question row.

### `InspectionSubmission` (table: `inspection_submissions`)
One row per completed inspection attempt. Stores the immutable payload snapshot and summary outcome. Detailed deficiencies are normalized into `InspectionDeficiency`, while the original payload remains intact for audit/replay.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `formId` | FK→`Form?` | Nullable for BACKFILL submissions |
| `formVersionId` | FK→`FormVersion?` | Published version filled against |
| `templateSnapshot` | `Json` | Full form structure captured at submit time |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `unitId` | `String` | Scope-level: often a scope `ProjectRow.id` (legacy). Unit-level (Gypcrete): `building\|level\|unit` location ref with `scopeRowId` null |
| `scopeRowId` | `ProjectRow.id?` | Specific scope card for scope-level forms; null for unit-level and **project-level** inspections |
| `unitId` | string | Unit location ref (`building\|level\|unit`) for unit-level forms; sentinel `||` for **project-level** forms (matches field notes) |

**Form `level` values:** `scope` (default), `unit` (e.g. Gypcrete), `project` (whole-project forms such as daily updates — started from project hub only).
**Form `purpose` values (`forms.purpose`):** `inspection` (default) | `documentation`. Documentation forms auto-use category `OTHER`, omit pass/fail outcome in hub/history UI, and block Pass/Fail question types at publish. Purpose is snapshotted on `InspectionSubmission.templateSnapshot` at submit time.
| `scopeTypeCode` | `String?` | Scope code at time of submission |
| `submittedAt` | When answers were submitted |
| Inspector | `clear_inspections.inspected_by_id` → `User` (not on submission) |
| `outcome` | `InspectionOutcome` | `PASS`, `FAIL`, `COMPLETE` |
| `deficiencyCount` | `Int` | Rollup count; normalized rows live in `inspection_deficiencies` |
| `payload` | `Json` | Answer map keyed by question id; preserved as submitted |
| `source` | `SubmissionSource` | `FORM` or `BACKFILL` |

### `InspectionAnswer` (table: `inspection_answers`)
One row per answered question in one inspection submission. This is the BI/reporting source for per-question outcomes.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `inspectionSubmissionId` | FK→`InspectionSubmission` | ON DELETE CASCADE |
| `formVersionQuestionId` | FK→`InspectionFormVersionQuestion` | Required (NOT NULL). Direct link to the exact published question snapshot |
| `questionId` | `String` | Source question id used for answer lookup and legacy fallback |
| `choiceValue`, `choicesValue`, `textValue`, `numberValue`, `ratingValue` | Typed nullable answer columns | Easier BI filters without JSON parsing |
| `rawAnswer` | `Json` | Lossless original answer object/value |
| `isFailed`, `isNotApplicable`, `hasDeficiencies`, `deficiencyCount` | Rollups | Derived from the submitted payload |

Unique: `(inspectionSubmissionId, formVersionQuestionId)`. `formVersionQuestionId` is required (NOT NULL). FORM submissions require `formVersionId` (CHECK constraint). Legacy `questionId` retained for answer lookup compatibility. Indexes include submission, version question, and question id.

Context such as project, unit/scope row, form/version, submitter, and submitted date comes from `inspectionSubmission`. Question title, section, response type, and follow-up metadata come from `formVersionQuestion`.

### `InspectionDeficiency` (table: `inspection_deficiencies`)
One row per deficiency captured under a failed `PASS_FAIL_DEFICIENCIES` question. This is the reporting/query source and future bridge to punch/work items.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `inspectionAnswerId` | FK→`InspectionAnswer` | Exact failed question answer row; ON DELETE CASCADE |
| `sourceDeficiencyId` | `String` | Original deficiency id from payload; used for idempotent backfill |
| `description` | `Text` | Inspector-written deficiency text |
| `severity` | `String?` | `Minor`, `Major`, `Critical` currently |
| `count` | `Int` | Occurrence count for grouped identical deficiencies |
| `createdAt`, `updatedAt` | `DateTime` | |

Unique: `(inspectionAnswerId, sourceDeficiencyId)`. Index: `inspectionAnswerId`.

Submission, project/location, form/version, clear-inspection history, and question metadata are reached by joining through `inspectionAnswer -> inspectionSubmission` and `inspectionAnswer -> formVersionQuestion`.

### `InspectionDeficiencyMedia` (table: `inspection_deficiency_media`)
One row per media item attached to an inspection deficiency.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `inspectionDeficiencyId` | FK→`InspectionDeficiency` | ON DELETE CASCADE |
| `storageUrl` | `Text` | Preserved URL from submitted payload |
| `storageKey` | `String?` | Best-effort recovery from URL; nullable for legacy rows |
| `mimeType`, `fileSizeBytes` | Nullable | From submitted captured file metadata when present |
| `localUrl` | `Text?` | Legacy/local reference if present in payload |
| `caption` | `Text?` | Optional caption when present |
| `imageAnnotation` | `Json?` | Optional annotation payload |
| `createdAt` | `DateTime` | |

Unique: `(inspectionDeficiencyId, storageUrl)`.

### `InspectionAnswerMedia` (table: `inspection_answer_media`)
One row per photo/file captured on a question-level answer (`capturedFiles` in the legacy payload).

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `inspectionAnswerId` | FK→`InspectionAnswer` | ON DELETE CASCADE |
| `storageUrl` | `Text` | Preserved URL from submitted capture |
| `storageKey` | `String?` | Best-effort recovery from URL |
| `mimeType`, `fileSizeBytes` | Nullable | From capture metadata when present |
| `localUrl` | `Text?` | Legacy/local reference if present in payload |
| `caption` | `Text?` | Optional caption |
| `imageAnnotation` | `Json?` | Optional annotation payload |
| `createdAt` | `DateTime` | |

Unique: `(inspectionAnswerId, storageUrl)`.

### `ProjectSubScope` (table: `project_sub_scopes`)
Definition record — splits a `ScopeType` within a `unitType` into named areas for independent tracking.
Created by Install Managers when a scope needs to be tracked in sub-areas (e.g. "Kitchen Cabinetry" + "Bath Cabinetry" within the "Cabinetry" scope type for "2BR" unit types). Applies to every `ProjectRow` matching `(projectId, unitType, scopeTypeId)`. **Minimum 2 sub-scopes** per group.

**Qty distribution modes** (set at creation, applied to all matching rows):
- `even` — `instance.qty = parentRow.qty / numSubScopes` (recalculated per unit; `qty` is null on the definition)
- `manual` — install manager specifies an exact qty per sub-scope; stored on the definition so future rows added via UPM upload inherit it automatically

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `scopeTypeId` | FK→`ScopeType` | ON DELETE RESTRICT — can't delete a ScopeType with sub-scopes |
| `unitType` | `String` | Matches `ProjectRow.unitType` |
| `name` | `String` | Display label, e.g. "Kitchen Cabinetry" |
| `displayOrder` | `Int` default 0 | Controls ordering within scope group |
| `qty` | `Decimal(18,4)?` | Manual-mode qty; null = even split. Inherited by auto-created instances on new rows |
| `createdById` | FK→`User` | ON DELETE RESTRICT |
| `createdAt`, `updatedAt` | `DateTime` | |

Unique: `(projectId, scopeTypeId, unitType, name)`. Indexes: `projectId`, `(projectId, scopeTypeId, unitType)`

Migrations: `20260325120000_add_project_sub_scopes`, `20260325140000_add_qty_to_sub_scope_schema`

### `ProjectSubScopeInstance` (table: `project_sub_scope_instances`)
Per-row tracking instance — one record per `(ProjectSubScope × ProjectRow)`. Carries its own `scopeStage`/`scopeStatus`/`inspectionStatus`/`qty`. When instances exist for a row, direct stage/status updates on the parent `ProjectRow` return 409.

`qty` is the resolved quantity for this unit's sub-scope slice:
- Even mode: set to `parentRow.qty / numSubScopes` at creation; null if parent qty is null
- Manual mode: set to the definition's `qty`; can be overridden per-instance via `PATCH instances/[instanceId]`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `subScopeId` | FK→`ProjectSubScope` | ON DELETE CASCADE |
| `rowId` | FK→`ProjectRow` | ON DELETE CASCADE |
| `qty` | `Decimal(18,4)?` | Resolved qty for this unit's sub-scope slice |
| `scopeStage` | `ScopeStage?` | Independent stage tracking |
| `scopeStatus` | `ScopeStatus?` | Independent status tracking |
| `inspectionStatus` | `InspectionStatus?` | Same gate as row: only at INSTALL+COMPLETE |
| `createdAt`, `updatedAt` | `DateTime` | |

Unique: `(subScopeId, rowId)`. Indexes: `rowId`, `subScopeId`.

Migrations: `20260325120000_add_project_sub_scopes`, `20260325140000_add_qty_to_sub_scope_schema`

## Lookup Models (all read-only, seeded)

| Model | Table | Purpose |
|-------|-------|---------|
| `CanonicalScopeType` | `canonical_scope_types` | Official CP Build scope definitions — the 22 standard scopes. Source of truth for abbreviations and display names used in the UI and BI. |
| `ScopeType` | `scope_types` | Raw scope type values as imported from UPM spreadsheets. Each row optionally links to `CanonicalScopeType` via `canonicalScopeTypeId` (nullable FK). |
| `LocationType` | `location_types` | Location classification |
| `CostType` | `cost_types` | Cost category |
| `InstallTeam` | `install_teams` | Subcontractor teams |
| `UomType` | `uom_types` | Units of measure (EA, SF, LF) |

Most lookup tables have: `id` (CUID PK), `code` (UNIQUE), `name`. Exception: `CanonicalScopeType` uses `displayName` instead of `name` (see fields below).

### `CanonicalScopeType` fields
| Column | Type | Notes |
|--------|------|-------|
| `id` | CUID PK | |
| `code` | `String` UNIQUE | 2–6 char abbreviation shown in UI (e.g. `CPB`, `CAB`, `TIL`) |
| `displayName` | `String` | Full human-readable name (e.g. "Carpet Broadloom", "Cabinets") |
| `sortOrder` | `Int` default 0 | Display ordering in dropdowns |

`ScopeType.canonicalScopeTypeId` (nullable FK → `canonical_scope_types.id`, ON DELETE SET NULL) links raw imported values to their canonical entry. All 10 existing raw scope types are backfilled. New raw values uploaded without a canonical link trigger the inline linking prompt in the upload UI.

BI join path: `project_rows → scope_types → canonical_scope_types`

### `ProjectScopeOverride` (table: `project_scope_overrides`, added 2026-06-19)

Per-project canonical scope mapping. Allows each project to display a scope type under a different canonical name than the global default, without affecting any other project.

| Column | Type | Notes |
|--------|------|-------|
| `id` | CUID PK | |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `scopeTypeId` | FK→`ScopeType` | ON DELETE CASCADE |
| `canonicalScopeTypeId` | FK→`CanonicalScopeType` | ON DELETE CASCADE |
| `createdAt` | `DateTime` default now | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique constraint: `(projectId, scopeTypeId)` — one override per scope type per project.

**Resolution order** (applied in `serializeUnitRow` via `projectScopeOverrides` option map):
1. Project override (`project_scope_overrides.canonicalScopeTypeId`) — **highest priority**
2. Global link (`scope_types.canonicalScopeTypeId`)
3. `scope_types.name`
4. `project_rows.description`
5. `"—"`

Managed via `GET/POST /api/projects/[id]/scope-overrides` and `DELETE /api/projects/[id]/scope-overrides/[scopeTypeId]`. UI surface: **Scope Setup** panel in Location Builder, gated on `EDIT_UPM`.

## Offline & Settings Models

### `OfflinePreference` (table: `"OfflinePreference"`)
One row per user. Stores module IDs the user wants cached for offline use.
| Column | Type |
|--------|------|
| `userId` | FK→`User` UNIQUE |
| `modules` | `String[]` default `[]` |
| `syncedAt` | `DateTime?` |

### `UserProjectFavorite` (table: `user_project_favorites`)
Per-user pinned projects on the Projects list. Order among favorites follows `createdAt` ascending.
| Column | Type |
|--------|------|
| `userId` | FK→`User` |
| `projectId` | FK→`Project` |
| `createdAt` | `DateTime` default `now()` |

@@unique(`userId`, `projectId`)

### `DesignTokenSnapshot`
Singleton (`id = "current"`). Stores live CSS token overrides from the DevTools SpacingEditor.
| Column | Type |
|--------|------|
| `overrides` | `Json` default `{}` |
| `savedById` | `String?` |
| `savedByName` | `String?` |

## DevTools & Feedback Models

### `LayoutIssue` (table: `layout_issues`)
UI layout issues reported via DevTools → Spacing tab.
| Column | Type |
|--------|------|
| `description`, `device`, `platform`, `route` | `String` |
| `status` | `LayoutIssueStatus` default `OPEN` |
| `screenshot` | `String? @db.Text` | Base64 data URL |
| `fixNote`, `fixedAt` | Optional | Set on FIXED transition |

### `FeedbackReport` (table: `feedback_reports`)
Bug reports and feature requests from authenticated users.
Submissions arrive via two channels: the direct API (`source=IN_APP`) and the Marker.io widget webhook (`source=MARKER_IO`).
| Column | Type | Notes |
|--------|------|-------|
| `shortId` | `Int @unique @default(autoincrement())` | Human-readable reference displayed as `FB-0042` |
| `userId` | FK→`User` | |
| `type` | `FeedbackType` (BUG / FEATURE_REQUEST) | |
| `title`, `description` | `String` | |
| `screenshot` | `String? @db.Text` | **Legacy** base64 data URL — kept for existing rows; new submissions use `screenshots[]` instead |
| `screenshots` | `String[] @default([])` | Supabase Storage signed URLs (up to 10) from the multi-image upload flow. New field — empty array on all legacy rows. |
| `videoUrl` | `String?` | Marker.io recording URL or future self-hosted video |
| `pageUrl` | `String?` | Auto-captured |
| `status` | `FeedbackStatus` default `OPEN` | |
| `priority` | `FeedbackPriority?` | Triage only: `LOW` / `MEDIUM` / `HIGH`; null = unset |
| `source` | `FeedbackSource` default `IN_APP` | |
| `adminNote` | `String? @db.Text` | Admin-only |
| `assigneeId` | `String?` FK→`User` | SET NULL on delete — triage assignee (role must be ADMIN, DEVELOPER, or DESIGNER) |
| `aiAssisted` | `Boolean` default `false` | True when the submitter used the Gemini-assisted flow to draft this report. Indexed. |
| `aiAssistMetadata` | `Json?` | Structured transcript + final AI summary. Shape defined in `lib/feedback-assist-schema.ts` (`FeedbackAssistMetadata`). Always null for non-AI submissions. |

Migrations:
- `prisma/migrations/20260317000002_add_feedback_source_short_id/migration.sql` (initial)
- `prisma/migrations/20260417120000_feedback_ai_assist/migration.sql` (`aiAssisted` + `aiAssistMetadata`)
- `prisma/migrations/20260522111123_add_feedback_screenshots/migration.sql` (`screenshots String[]`)

Relations: `comments[]` (`FeedbackComment`), `mentions[]` (`FeedbackMention`), `assignee` (`User`, relation name `FeedbackAssignee`).

### `FeedbackComment` (table: `feedback_comments`)

Threaded comments on a feedback report. Mirrors issue/observation comment patterns (`editedAt`, soft `deletedAt`).

| Column | Type | Notes |
|--------|------|-------|
| `feedbackReportId` | FK→`FeedbackReport` | CASCADE DELETE |
| `authorId` | FK→`User` | RESTRICT |
| `body` | `Text` | |
| `editedAt` | `DateTime?` | PATCH within 30 minutes |
| `deletedAt` | `DateTime?` | Author soft-delete; hidden from GET |

### `FeedbackMention` (table: `feedback_mentions`)

Users @mentioned in feedback comments — grants **inbox list visibility** for that report without being the submitter.

| Column | Type | Notes |
|--------|------|-------|
| `feedbackReportId` | FK→`FeedbackReport` | CASCADE DELETE |
| `mentionedUserId` | FK→`User` | CASCADE DELETE |
| `sourceCommentId` | FK→`FeedbackComment?` | SET NULL on comment delete |

UNIQUE: `(feedbackReportId, mentionedUserId)`. Index: `mentionedUserId`.

Migration: `prisma/migrations/20260404120000_feedback_comments_mentions/migration.sql`

### `Release` (table: `releases`)
Tracks what was deployed to each environment. Used by the DevTools Release Checklist tab.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `title` | `String` | e.g. "PR #60 — Error Wrap-Up" |
| `prNumber` | `Int?` | GitHub PR number — used for idempotent CHANGELOG imports |
| `branch` | `String?` | Branch name (e.g. `feat/units-page`) |
| `environment` | `String` | `"development"` \| `"staging"` \| `"production"` \| `"all"` |
| `mergedAt` | `DateTime` | When this release was merged/deployed |
| `changes` | `Json` | `ReleaseChange[]` — `{ id, description, route?, category? }` |

Indexes: `mergedAt`, `environment`

### `ReleaseVerification` (table: `release_verifications`)
Records that an admin verified a release in a given environment.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID | PK |
| `releaseId` | FK→`Release` | CASCADE DELETE |
| `userId` | FK→`User` | CASCADE DELETE |
| `environment` | `String` | Which env was verified |
| `verifiedAt` | `DateTime` | When verified |
| `notes` | `String?` | Optional admin notes |

UNIQUE: `[releaseId, userId, environment]`

### `MasqueradeLog` (table: `masquerade_logs`)
Audit trail for ADMIN impersonation sessions. `endedAt` is null while session is active.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `actorId` | FK→`User` | The ADMIN who initiated |
| `targetUserId` | FK→`User` | The user being impersonated |
| `startedAt` | `DateTime` | Default now() |
| `endedAt` | `DateTime?` | Null = session still active |

Relations: `actor` (MasqueradeActor), `target` (MasqueradeTarget) — both CASCADE DELETE.
Indexes: `actorId`, `targetUserId`, `startedAt`

User model has two new relations: `masqueradeSessions` (as actor) and `masqueradeTargets` (as target).

---

### `EnvironmentVisit` (table: `environment_visits`)
Tracks when an admin last visited each environment. Used to compute "new since your last visit."
| Column | Type | Notes |
|--------|------|-------|
| `userId` | FK→`User` | Composite PK |
| `environment` | `String` | Composite PK |
| `lastVisitedAt` | `DateTime` | Updated on each checklist dismissal |

### `Notification` (table: `notifications`)
Feedback events (`FEEDBACK_*`: status, assignment) and @mentions (`MENTIONED_IN_COMMENT`, `MENTIONED_IN_ISSUE_NOTES`). `FEEDBACK_ASSIGNED` sets `actorId`/`actorName` (assigner). Feedback-thread mentions set `feedbackId` + `mentionCommentId` and leave `projectId` null.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `userId` | FK→`User` | CASCADE DELETE |
| `feedbackId` | FK→`FeedbackReport?` | CASCADE DELETE — set for feedback status, assignment, and feedback comment mentions |
| `type` | `NotificationType` enum | Includes `FEEDBACK_*`, `MENTIONED_*` |
| `actorId` / `actorName` | Optional | Mentions; `FEEDBACK_ASSIGNED` (assigner) |
| `projectId` / `issueId` / `observationId` / `mentionCommentId` | Optional | Project mentions vs feedback thread |
| `read` | `Boolean` | Default `false` |
| `createdAt` | `DateTime` | |

Indexes: `userId`, `(userId, read)`, `feedbackId`

### `FeedbackTour` (table: `feedback_tours`)
Admin-authored guided tour attached to a resolved `FeedbackReport`. Presence of this record causes the notification card to show a "Watch the tour" button.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `feedbackId` | FK→`FeedbackReport` UNIQUE | One tour per report. CASCADE DELETE |
| `steps` | `Json` | Array of `TourStep: { order, pageUrl, elementSelector, title, description, voiceText }` |
| `createdAt`, `updatedAt` | `DateTime` | |

### `ReleaseTour` (table: `release_tours`)
Admin-authored guided tour attached to a `Release`. Presence of this record causes the `ReleaseTourBanner` to show a "See what's new" CTA to all users on first load after a new deploy. The banner detects new deploys via a SHA comparison in localStorage.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `releaseId` | FK→`Release` UNIQUE | One tour per release. CASCADE DELETE |
| `createdAt`, `updatedAt` | `DateTime` | |

### `ReleaseTourStep` (table: `release_tour_steps`)
Individual step in a `ReleaseTour` — mirrors the `TourStep` interface used by `TourPlayer`.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `tourId` | FK→`ReleaseTour` | CASCADE DELETE |
| `order` | `Int` | Playback order |
| `pageUrl` | `String` | Route to navigate to |
| `elementSelector` | `String` | CSS selector for the highlighted element |
| `title` | `String` | Step heading |
| `description` | `String` | Step body text |
| `voiceText` | `String` | Text spoken by Web Speech API |

Index: `tourId`

### Enums
- `NotificationType`: `FEEDBACK_IN_PROGRESS`, `FEEDBACK_RESOLVED`, `FEEDBACK_ASSIGNED`

---

## Morning Briefing History & Feedback

### `DailyBriefing` (table: `daily_briefings`)
One row per calendar day. Stores the full AI-generated report blob.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `dateFor` | `DateTime @db.Date` | Midnight UTC for the day covered; UNIQUE |
| `generatedAt` | `DateTime` | When generated (default now) |
| `generatedBy` | `String` | User ID of the ADMIN who triggered it |
| `report` | `Json` | Full `DailyBriefingReport` blob |

Indexes: `dateFor`

### `BriefingSynthesis` (table: `briefing_syntheses`)
Cached AI-generated long-term trend reports across a window of daily briefings.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `windowDays` | `Int?` | `null` = all-time; `30` or `90` for rolling windows |
| `generatedAt` | `DateTime` | Default now |
| `generatedBy` | `String` | User ID |
| `report` | `Json` | Full `BriefingSynthesisReport` blob |

Index: `(windowDays, generatedAt)`

### `BriefingFeedback` (table: `briefing_feedbacks`)
Card-level feedback signals and AI responses for individual briefing items.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `briefingId` | `String` | References `daily_briefings.id` (no FK constraint — logs survive briefing updates) |
| `section` | `String` | `"ROI_ITEM"` \| `"OPTIMIZATION"` \| `"ISSUE"` \| `"SPRINT_ITEM"` \| `"SHIPPED_ITEM"` \| `"INSIGHT"` |
| `itemKey` | `String` | Identifies the specific item within the section (index-based slug) |
| `feedbackType` | `String` | `"JUSTIFY"` \| `"CHALLENGE"` \| `"APPROVE"` |
| `challengeReason` | `String?` | `"WRONG_CONTEXT"` \| `"INFLATED_NUMBER"` \| `"NOT_APPLICABLE"` \| `"OTHER"` |
| `userNote` | `String?` | Optional free-text correction |
| `aiJustification` | `String?` | Gemini's step-by-step reasoning (from /justify) |
| `aiRevision` | `Json?` | Gemini's revised card JSON (from /revise) |
| `createdAt` | `DateTime` | |
| `userId` | `String` | User who submitted feedback |

Indexes: `(briefingId, section)`, `(userId, createdAt)`

### `BriefingRule` (table: `briefing_rules`)
Growing ruleset injected into every daily briefing generation prompt. Managed by Phil via the Analysis tab UI.
| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` CUID PK | |
| `text` | `String` | The rule text — injected verbatim into the Gemini prompt |
| `source` | `String` | `"MANUAL"` \| `"FEEDBACK_DERIVED"` — default `"MANUAL"` |
| `active` | `Boolean` | Only active rules are injected; default `true` |
| `createdAt` | `DateTime` | |
| `createdBy` | `String` | User ID |
| `updatedAt` | `DateTime` | |

Index: `(active, createdAt)`

## Key Relationships Summary

```
Role ←──── User ──── Invite
             │
             ├── OfflinePreference (1:1)
             ├── UserProjectFavorite (1:many, CASCADE DELETE)
             ├── UserSpecialPermission (1:many)
             ├── FeedbackReport (1:many)
             │     ├── Notification (1:many, CASCADE DELETE)
             │     └── FeedbackTour (1:1 optional, CASCADE DELETE)
             ├── Notification (1:many, CASCADE DELETE)
             ├── PasswordResetToken (1:many)
             ├── ReleaseVerification (1:many)
             └── EnvironmentVisit (1:many)

Project ──── ProjectRow (1:many, CASCADE DELETE)
│              ├── ScopeType (FK, SET NULL)
│              ├── LocationType (FK, SET NULL)
│              ├── CostType (FK, SET NULL)
│              ├── InstallTeam (FK, SET NULL)
│              ├── UomType (FK, SET NULL)
│              └── ProjectSubScopeInstance (1:many, CASCADE DELETE)
│                    └── ProjectSubScope (FK, CASCADE DELETE)
│
└── ProjectSubScope (1:many, CASCADE DELETE)
      ├── ScopeType (FK, RESTRICT)
      ├── User/createdBy (FK, RESTRICT)
      └── ProjectSubScopeInstance (1:many, CASCADE DELETE)
            └── ProjectRow (FK, CASCADE DELETE)

Release ──── ReleaseVerification (1:many, CASCADE DELETE)
        └─── ReleaseTour (1:1 optional, CASCADE DELETE)
               └── ReleaseTourStep (1:many, CASCADE DELETE)
```

---

## Issues & Observations

### Enums (added in migration `20260327000000_add_issues_observations_media`)

| Enum | Values |
|---|---|
| `issue_status` | `OPEN`, `RESOLVED` |
| `observation_type` | `QUALITY`, `PROGRESS`, `SAFETY`, `OTHER` |
| `transcript_status` | `NONE`, `PENDING`, `PROCESSING`, `COMPLETE`, `FAILED` |

> **Note:** `IssueType` and `ResponsibleParty` enums were removed in migration `20260716120000_issue_catalog`. `ObservationType` enum was removed in migration `20260717120000_observation_catalog`. Types and parties are now string codes in catalog tables (see below).

### `IssueTypeCatalog` (table: `issue_type_catalog`)

| Column | Type | Notes |
|---|---|---|
| `code` | `String` | PK — stable slug (e.g. `MATERIAL_IN_THE_WAY`) |
| `displayName` | `String` | User-facing label in pickers and logs |
| `sortOrder` | `Int` | Ascending display order |
| `requiresVisual` | `Boolean` | When true, create/PATCH requires image/video attachment |
| `isActive` | `Boolean` | Archived types hidden from pickers; existing issues keep code |

Seeded by migration + `scripts/bootstrap-issue-catalog.ts` (skipDuplicates — never overwrites admin edits).

### `ResponsiblePartyCatalog` (table: `responsible_party_catalog`)

| Column | Type | Notes |
|---|---|---|
| `code` | `String` | PK — stable slug (e.g. `CP_BUILD`) |
| `displayName` | `String` | User-facing label |
| `sortOrder` | `Int` | Ascending display order |
| `isActive` | `Boolean` | Archived parties hidden from pickers |

### `IssueResponsiblePartyTag` (table: `issue_responsible_party_tags`)

Multi-party support for bulk-reported issues (max 12 per issue).

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `issueId` | FK→`ProjectIssue` | ON DELETE CASCADE |
| `partyCode` | `String` | FK→`responsible_party_catalog.code` |

Primary party remains on `ProjectIssue.responsiblePartyCode`; tags hold full party set.

### `ObservationTypeCatalog` (table: `observation_type_catalog`)

| Column | Type | Notes |
|---|---|---|
| `code` | `String` | PK — stable slug (e.g. `QUALITY`) |
| `displayName` | `String` | User-facing label in pickers and logs |
| `sortOrder` | `Int` | Ascending display order |
| `isActive` | `Boolean` | Archived types hidden from pickers; existing observations keep code |

Seeded by migration + `scripts/bootstrap-observation-catalog.ts` (skipDuplicates — never overwrites admin edits).

### `ProjectIssue` (table: `project_issues`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `projectRowId` | FK→`ProjectRow` | Always required; unit derived from row. ON DELETE CASCADE |
| `subScopeInstanceId` | FK→`ProjectSubScopeInstance?` | Optional. ON DELETE SET NULL |
| `shortDescription` | `String` | Max 500 chars |
| `issueTypeCode` | `String` | FK→`issue_type_catalog.code`; API serializes as `issueType` |
| `responsiblePartyCode` | `String` | FK→`responsible_party_catalog.code`; legacy single column — first party in `responsibleParties`; API serializes as `responsibleParty` |
| `isBlockingWork` | `Boolean` | Default false |
| `status` | `IssueStatus` | Default OPEN |
| `resolvedAt` | `DateTime?` | Set on resolve |
| `resolvedById` | FK→`User?` | Set on resolve. ON DELETE SET NULL |
| `bulkGroupId` | `String?` | UUID shared by all issues created together via `POST /issues/bulk`. Indexed for group-resolve queries. |
| `buildPhaseTag` | `String?` | Optional project-level tag from Location Builder `buildPhase` (null for location-scoped issues). |
| `areaTag` | `String?` | Optional project-level tag from Location Builder `area` (null for location-scoped issues). |
| `scopeRefKeys` | `String[]` | Durable normalized scope keys (`building\|level\|unit\|description`); survives row ID replacement on matrix upload. Empty = unit-level only. |
| `missingMaterialDescription` | `String?` | Required when `issueType = MISSING_MATERIALS` — what material is missing (max 500 chars). |
| `missingMaterialQuantity` | `Decimal(18,4)?` | Required when `issueType = MISSING_MATERIALS` — how much is missing. |
| `missingMaterialUomCode` | `String?` | UOM code from tagged scope row(s); auto-resolved from first selected scope with a UOM when omitted on POST. |
| `testSeedBatchId` | FK→`TestSeedBatch?` | Set on Admin test-data seed batches; enables batch cleanup. ON DELETE SET NULL |
| `createdById` | FK→`User` | ON DELETE RESTRICT |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

Indexes: `projectId`, `unitRef`, `bulkGroupId`, `testSeedBatchId`

**Business rules:** `requiresVisual` on the catalog row (not hardcoded type sets) enforces at least one `image/*` or `video/*` attachment on create/PATCH. `MISSING_MATERIALS` requires `missingMaterialDescription` (non-empty) and `missingMaterialQuantity` (positive number); UOM is taken from tagged scope when available; at most one scope row per issue. Resolve is Creator/Admin/Developer only (not any member). Re-open is Creator/Admin only. When `resolveGroup=true` on the resolve endpoint, all OPEN issues sharing `bulkGroupId` are resolved atomically.

### `IssueResponsiblePartyTag` (table: `issue_responsible_party_tags`)

Join table linking one issue to many responsible parties (multi-select in UI).

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `issueId` | FK→`ProjectIssue` | ON DELETE CASCADE |
| `party` | `ResponsibleParty` | One tag per party |

Unique: `(issueId, party)`. Indexed on `issueId` and `party`. Backfilled from legacy `responsible_party` on migration. Writes sync both this table and the legacy `responsibleParty` column (first party).

### `IssueComment` (table: `issue_comments`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `issueId` | FK→`ProjectIssue` | ON DELETE CASCADE |
| `authorId` | FK→`User` | ON DELETE RESTRICT |
| `body` | `Text` | |
| `editedAt` | `DateTime?` | Stamped on PATCH |
| `createdAt` / `updatedAt` | `DateTime` | |

Edit-only — no delete endpoint. Comments always open regardless of issue status.

### `ProjectObservation` (table: `project_observations`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `projectRowId` | FK→`ProjectRow` | Always required. ON DELETE CASCADE |
| `subScopeInstanceId` | FK→`ProjectSubScopeInstance?` | Optional. ON DELETE SET NULL |
| `description` | `Text` | |
| `observationTypeCode` | `String` | FK→`observation_type_catalog.code` — API serializes as `observationType` |
| `bulkGroupId` | `String?` | UUID shared by all observations created together via `POST /observations/bulk`. Indexed. |
| `buildPhaseTag` | `String?` | Optional project-level tag from Location Builder `buildPhase` (null for location-scoped observations). |
| `areaTag` | `String?` | Optional project-level tag from Location Builder `area` (null for location-scoped observations). |
| `scopeRefKeys` | `String[]` | Durable normalized scope keys (`building\|level\|unit\|description`); survives row ID replacement on matrix upload. Empty = unit-level only. |
| `authorId` | FK→`User` | ON DELETE RESTRICT |
| `createdAt` / `updatedAt` | `DateTime` | |

### `ObservationComment` (table: `observation_comments`)

Same structure as `IssueComment` with `observationId` FK instead of `issueId`.

### `MediaAttachment` (table: `media_attachments`)

Polymorphic — exactly **one** of five nullable FKs is non-null per row (enforced at API layer).

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `storageKey` | `String` | Supabase Storage path, e.g. `field-media/issues/abc.jpg` |
| `storageUrl` | `String` | Signed URL (1-year expiry) |
| `mimeType` | `String` | `image/*`, `video/*`, or `audio/*` |
| `fileSizeBytes` | `Int?` | |
| `durationSeconds` | `Float?` | Video and audio only |
| `thumbnailUrl` | `String?` | Future: video thumbnail |
| `transcriptStatus` | `TranscriptStatus` | Default NONE; user-triggered |
| `transcriptLanguage` | `String?` | BCP 47 declared by user |
| `transcriptOriginal` | `Text?` | Raw transcript in source language |
| `transcriptEnglish` | `Text?` | Always populated after COMPLETE |
| `issueId` | FK→`ProjectIssue?` | ON DELETE CASCADE |
| `issueCommentId` | FK→`IssueComment?` | ON DELETE CASCADE |
| `observationId` | FK→`ProjectObservation?` | ON DELETE CASCADE |
| `observationCommentId` | FK→`ObservationComment?` | ON DELETE CASCADE |
| `feedbackCommentId` | FK→`FeedbackComment?` | ON DELETE CASCADE |
| `uploadedById` | FK→`User` | ON DELETE RESTRICT |
| `createdAt` | `DateTime` | |

Max 10 attachments per comment/issue/observation/feedback comment. 50 MB server-side cap. DevTools delete cascades Supabase Storage purge.

Optional 1:1 **`MediaCaptureContext`** (table: `media_capture_context`) — GPS/device metadata for field uploads linked after attachment create. Staging row **`FieldMediaUploadContext`** (table: `field_media_upload_context`, keyed by `storageKey`) holds metadata between upload and entity link. **`ProjectSiteGeocode`** (table: `project_site_geocodes`) caches Google geocode per project for distance calculation.

Optional 1:1 **`ActivityLocationContext`** (table: `activity_location_contexts`, PK `activityLogId` FK→`activity_logs` ON DELETE CASCADE) — field GPS for activity log rows. Columns: `gpsStatus` (`CaptureGpsStatus`), `latitude`, `longitude`, `accuracyMeters`, `distanceFromProjectMeters`, `locationRecordedAt`, `source` (`ACTIVITY_CAPTURE` \| `MEDIA_DERIVED` \| `BACKFILL`). Written at `logActivity` time from client `activityLocation` or promoted from linked `MediaCaptureContext`.

### `ContentTranslation` (table: `content_translations`)

Caches Gemini translations so the same content is never re-translated.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `contentType` | `String` | `issue_description` \| `obs_description` \| `issue_comment` \| `obs_comment` |
| `contentId` | `String` | ID of the source record |
| `sourceLang` | `String` | BCP 47 declared by user |
| `targetLang` | `String` | BCP 47 target |
| `translated` | `Text` | |
| `createdAt` | `DateTime` | |

Unique index: `(contentType, contentId, targetLang)`. Index: `contentId`.

### `TestSeedBatch` (table: `test_seed_batches`)

Admin-initiated synthetic data batches on `isTestProject` sandboxes.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `createdById` | FK→`User` | Admin who ran seed. ON DELETE RESTRICT |
| `config` | `Json` | Request snapshot (counts, ratios, user pool, date range) |
| `counts` | `Json` | Result `{ issues, observations, clearInspections, comments, activityLogs }` |
| `createdAt` | `DateTime` | |

Nullable `testSeedBatchId` FK on: `ProjectIssue`, `IssueComment`, `ProjectObservation`, `ObservationComment`, `ClearInspection`, `InspectionSubmission` (FORM submissions from seed), `MediaAttachment`, `ActivityLog`.

Migration: `prisma/migrations/20260522140000_test_seed_batches/migration.sql`

---

## Field daily reports (added 2026-07-10)

Per–install-manager daily log generated from `activity_logs` (status rollups, inspections, issues, observations). One report per IM per calendar day (org TZ `America/Denver`).

### `FieldDailyReport` (table: `field_daily_reports`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `installManagerUserId` | FK→`User` | Report owner. ON DELETE CASCADE |
| `reportDate` | `Date` | Calendar day in org TZ |
| `generatedAt` | `DateTime` | |
| `generatedByUserId` | `String?` | Null for scheduled midnight job |
| `trigger` | `FieldDailyReportTrigger` | `MANUAL` \| `SCHEDULED` |
| `activityThrough` | `DateTime` | Upper bound of included activity |

Unique: `(installManagerUserId, reportDate)`.

### `FieldDailyReportProject` (table: `field_daily_report_projects`)

Frozen per-project JSON snapshot for one report.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `fieldDailyReportId` | FK→`FieldDailyReport` | ON DELETE CASCADE |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `snapshot` | `Json` | `FieldDailyReportProjectSnapshot` DTO |
| `dailyManpower` | `Int?` | IM-entered daily headcount on site; null until filled |
| `dailyManpowerSetAt` | `DateTime?` | When `dailyManpower` was last set |
| `dailyManpowerSetByUserId` | FK→`User?` | Who set `dailyManpower`; ON DELETE SET NULL |

Unique: `(fieldDailyReportId, projectId)`.

### `FieldDailyReportSectionNote` (table: `field_daily_report_section_notes`)

Threaded IM section notes (submit-based). Legacy single-comment rows migrated here on deploy.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `fieldDailyReportProjectId` | FK→`FieldDailyReportProject` | ON DELETE CASCADE |
| `sectionKey` | `String` | e.g. `progress`, `statusUpdates`, `issues`, `other` |
| `itemKey` | `String` | Default `""` for section-level |
| `body` | `String` | |
| `authorUserId` | FK→`User` | ON DELETE RESTRICT |
| `editedAt` | `DateTime?` | Set on author edit |
| `deletedAt` | `DateTime?` | Soft delete |
| `createdAt` | `DateTime` | |

Index: `(fieldDailyReportProjectId, sectionKey, itemKey)`.

### `ProjectNote` (table: `project_notes`)

Project overview decision log — one flat note per row, author may edit or soft-delete their own notes. Any project member with field-notes mutation access may pin/unpin notes; pinned notes sort to the top.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `projectId` | FK→`Project` | ON DELETE CASCADE |
| `authorId` | FK→`User` | ON DELETE RESTRICT |
| `body` | `String` @db.Text | |
| `editedAt` | `DateTime?` | Set on author edit |
| `pinnedAt` | `DateTime?` | When set, note appears in pinned section at top |
| `deletedAt` | `DateTime?` | Soft delete — filtered on GET |
| `testSeedBatchId` | FK→`TestSeedBatch?` | ON DELETE SET NULL |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

Indexes: `(projectId, createdAt DESC)`, `(projectId, pinnedAt DESC)`.

### `FieldDailyReportSectionNoteReply` (table: `field_daily_report_section_note_replies`)

Replies on a section note; same author-edit / soft-delete rules.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `noteId` | FK→`FieldDailyReportSectionNote` | ON DELETE CASCADE |
| `body` | `String` | |
| `authorUserId` | FK→`User` | ON DELETE RESTRICT |
| `editedAt` | `DateTime?` | |
| `deletedAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |

Migration: `prisma/migrations/20260720120000_field_daily_report_section_notes/migration.sql` (replaces `field_daily_report_comments`).

---

## BI / Reporting API Tables (added 2026-04-13)

### `ApiKey` (table: `api_keys`)

Machine-to-machine API keys for the read-only BI/reporting API (`/api/bi/v1/*`). Raw key shown once at creation, never stored — only SHA-256 hash persisted.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` CUID | PK |
| `name` | `String` | Human-readable label (e.g. "Tosh — Power BI") |
| `keyHash` | `String` | SHA-256 of the raw key. Unique index. |
| `keyPrefix` | `String` | First 16 chars of raw key for display only |
| `scopes` | `String[]` | `["bi:projects","bi:units","bi:issues","bi:observations","bi:team","bi:activity"]` |
| `allowedProjectIds` | `String[]` | Empty = all projects; non-empty = scoped to those project IDs |
| `party` | `ApiKeyParty` | `INTERNAL` \| `SUBCONTRACTOR` \| `GENERAL_CONTRACTOR` |
| `createdById` | FK→`User` | Admin who created the key |
| `assignedToId` | FK→`User?` | Optional: user whose Settings page should show this key (e.g. Tosh) |
| `lastUsedAt` | `DateTime?` | Updated fire-and-forget on successful requests, throttled to at most once per 5 minutes |
| `expiresAt` | `DateTime?` | Null = never expires |
| `revokedAt` | `DateTime?` | Null = active; non-null = revoked (row kept for audit) |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` | |

**Enum `ApiKeyParty`**: `INTERNAL`, `SUBCONTRACTOR`, `GENERAL_CONTRACTOR`

**Key roles**:
- `BI_ANALYST` — new role with `VIEW_PROJECTS`, `VIEW_DASHBOARD`, `VIEW_TEAM`, `VIEW_UPM`, `ACCESS_BI_API`; no Feedback nav
- API key auth is separate from the web-app session — keys are validated in `lib/bi-auth.ts` via Bearer token

**Auth library**: `lib/bi-auth.ts` — `validateBiKey()`, `requireScope()`, `isProjectAllowed()`, `generateApiKey()`, `biResponseHeaders()`
**Scope constants**: `lib/bi-scopes.ts` — `BI_SCOPES` (client-safe, no DB imports)

## App Announcements (added 2026-07-14)

### `AppAnnouncement` (table: `app_announcements`)

Admin-managed in-app campaigns: rich HTML body (EN/ES), optional hero image URLs, optional CTA, audience gate, versioned re-blast.

| Field | Notes |
|---|---|
| `slug` | Unique identifier (e.g. `save-to-photos`) |
| `bodyEn` / `bodyEs` | Sanitized HTML |
| `ctaAction` | `DISMISS_ONLY` \| `INTERNAL_LINK` \| `MOBILE_ACCOUNT_PROFILE` |
| `audience` | Always `ALL` (all logged-in users); stored for legacy rows only |
| `campaignVersion` | Incremented on admin Re-send; dismissals are per version |
| `startsAt` / `endsAt` | Active window |
| `priority` | Higher shows first when multiple eligible |

### `AppAnnouncementDismissal` (table: `app_announcement_dismissals`)

Unique on `(announcementId, userId, campaignVersion)` — server-side dismiss, cross-device.

**Bootstrap**: `scripts/bootstrap-app-announcements.ts` seeds nothing by default; on deploy it removes the legacy PR #1850 auto-seeded `save-to-photos` campaign (if present). Admins create campaigns per environment via `/admin/announcements`.
