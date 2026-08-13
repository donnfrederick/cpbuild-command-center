# DB Schema Notes — CP Build Command Center

Source of truth for schema decisions, constraints, and gotchas. The canonical schema definition lives in `prisma/schema.prisma`. This document explains the *why* behind key design choices.

---

## Database Setup

- **Provider:** PostgreSQL (Railway-managed)
- **ORM:** Prisma 7 with `PrismaPg` driver adapter
- **Connection:** PgBouncer in transaction pooling mode (see ADR-001, ADR-004)
- **Migrations:** Run automatically on every deploy via `npm run db:deploy` in `nixpacks.toml`

---

## Models Overview

| Model | Table | Purpose |
|-------|-------|---------|
| `User` | `User` | Authenticated users. Auth via NextAuth credentials. |
| `Account` | `Account` | NextAuth OAuth accounts (linked to User). |
| `Session` | `Session` | NextAuth database sessions. |
| `VerificationToken` | `VerificationToken` | Email verification tokens (NextAuth). |
| `Invite` | `Invite` | Team invitations. Has expiry and accepted-at tracking. |
| `Project` | `Project` | Construction projects. Soft-delete via `deletedAt`. |
| `ProjectRow` | `project_rows` | Individual unit rows from the UPM. Uses `@@map` convention. |
| `Form` / `FormVersion` | `forms` / `form_versions` | Form builder templates and immutable published snapshots. |
| `InspectionSubmission` | `inspection_submissions` | Filled inspection attempts with payload snapshot and outcome. |
| `InspectionAnswer` | `inspection_answers` | One normalized answer row per submitted form question. |
| `InspectionDeficiency` | `inspection_deficiencies` | One normalized deficiency row linked to the failed answer it belongs to. |
| `InspectionDeficiencyMedia` | `inspection_deficiency_media` | Media attached to individual deficiencies. |

---

## Key Design Decisions

### Soft Deletion for Projects
`Project` has a `deletedAt` timestamp (nullable). "Deleted" projects are never hard-removed — they can be restored by re-creating a project with the same `unifierPid` (which triggers a restore path in `POST /api/projects`).

All queries that list active projects must include `where: { deletedAt: null }`.

### `project_rows` Table Naming Convention
The Prisma model is named `ProjectRow` (PascalCase) but the SQL table is `project_rows` (snake_case) via `@@map("project_rows")`. This is the only model using this convention — all other models use Prisma's default camelCase-to-PascalCase mapping.

### `project_rows` Uses Raw SQL for Bulk Inserts
UPM imports involve 2,000–5,000 rows. Rather than using `prisma.projectRow.createMany()`, `lib/project-rows.ts` uses `db.$executeRawUnsafe()` with batched parameterized INSERTs. See ADR-007.

**Critical:** If you add or rename a column in `project_rows` via migration, you MUST also update the column list in `lib/project-rows.ts`. Prisma won't catch this mismatch at build time.

### `createdAt` / `updatedAt` on `project_rows`
These columns were missing from the initial table creation migration and were added retrospectively in `20260227000000_project_rows_timestamps` (see ADR-008). Both use `DEFAULT CURRENT_TIMESTAMP`. `updatedAt` is managed by Prisma ORM on ORM updates, but for raw SQL updates you must set it manually.

### `ScopeStatus.PENDING_VERIFICATION`
`PENDING_VERIFICATION` represents subcontractor-reported install completion that still needs verification. It should show up as "Install Complete-SUB" in field workflows, but it must not be counted as verified install complete. Only `COMPLETE` represents verified install completion.

### Inspection Reporting Normalization
Inspection submissions keep their JSON `templateSnapshot` and `payload` for backwards compatibility and offline replay, but the reporting model also writes first-class relational rows:

- `inspection_form_sections`, `inspection_form_questions`, `inspection_form_version_sections`, and `inspection_form_version_questions` preserve the form/question structure used for each published version.
- `inspection_answers` stores answer-level data tied to the submission, form version question, question id, response type, choice, text value, numeric value, dates, pass/fail state, and deficiency presence.
- `inspection_deficiencies` stores each deficiency separately and links to `inspection_answers.inspectionAnswerId`. Project, unit, scope, form, and version context must be reached through joins from the answer/submission instead of duplicated onto deficiency rows.
- `inspection_deficiency_media` stores each deficiency image/media reference separately and links to the deficiency row.
- Calibration inspections are stored as inspection submissions whose immutable snapshot category is `CALIBRATION_INSPECTION`; they are observational and must not update `project_rows.inspectionStatus` or `clear_inspections` chain state.

### Unique Constraints
- `User.email` — unique
- `Account.provider + providerAccountId` — unique (prevents duplicate OAuth links)
- `Session.sessionToken` — unique
- `Invite.token` — unique (CUID-based)
- `Project.salesforceId` — unique (nullable)
- `Project.unifierPid` — unique (the external Unifier PID is the natural key)

### `project_rows` Index
```sql
CREATE INDEX "project_rows_projectId_building_level_unit_idx"
  ON "project_rows"("projectId", "building", "level", "unit");
```
This supports the most common query pattern (list units for a project, filtered by building/level/unit).

---

## Migration Conventions

1. **Never edit an applied migration file.** If you need to change something, create a new migration.
2. **Migration files are named:** `YYYYMMDDHHMMSS_description/migration.sql`
3. **Use `IF NOT EXISTS` / `IF EXISTS`** in custom migration SQL so it's safe to re-run on fresh DBs (Railway dev vs prod can have different states).
4. **Run migrations locally** before pushing: `npx prisma migrate dev --name description`
5. **Validate before deploying:** `npx prisma migrate status` shows pending migrations.

---

## Migration History

| Migration | Date | What it does |
|-----------|------|-------------|
| `20260218185605_init` | 2026-02-18 | Initial schema: User, Account, Session, VerificationToken, Invite |
| `20260223000000_project_rows_individual_columns` | 2026-02-23 | Adds Project + project_rows tables; migrates JSONB rowData → individual columns |
| `20260223100000_project_rows_full_schema` | 2026-02-23 | Adds all remaining project_rows columns (CSI codes, cost types, man hours, etc.) |
| `20260224100000_drop_upm_data` | 2026-02-24 | Drops the legacy `upmData` JSONB column from Project |
| `20260225000000_roles_and_permissions` | 2026-02-25 | Adds role-related tables and enums |
| `20260226000000_add_super_admin_role` | 2026-02-26 | Adds SUPER_ADMIN role (historical — later removed by `20260312000000_remove_super_admin_role`) |
| `20260227000000_project_rows_timestamps` | 2026-02-27 | Adds missing createdAt/updatedAt to project_rows (see ADR-008) |
| `20260512185426_add_pending_verification_status` | 2026-05-12 | Adds `ScopeStatus.PENDING_VERIFICATION` for subcontractor-reported install completion pending verification |
| `20260518124500_normalize_inspection_deficiencies` | 2026-05-18 | Adds normalized inspection deficiency and deficiency media tables. |
| `20260518131000_fix_clear_inspection_submission_unique` | 2026-05-18 | Fixes the clear-inspection submission uniqueness/index shape used by deficiency backfill. |
| `20260518133500_normalize_inspection_reporting` | 2026-05-18 | Adds normalized form section/question/version and inspection answer tables for reporting. |
| `20260518205500_remove_redundant_inspection_reporting_columns` | 2026-05-18 | Removes duplicated project/unit/scope/form context from normalized answer/deficiency tables in favor of join-based reporting. |

---

## Adding a Column or Table

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name your_description` locally
3. Review the generated SQL in `prisma/migrations/`
4. Update this document's "Migration History" table
5. If adding to `project_rows`: also update `lib/project-rows.ts`
6. Add `contracts:db` label to the PR
