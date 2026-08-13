# Base Pack — CP Build Command Center

**Internalize this once, query it everywhere.**  
This is the single source of truth for project context, conventions, and hard-won decisions. Every developer and every AI agent working in this repo should read this before writing code.

Last updated: 2026-05-20 | Owner: Phil Salter (@philipamour)

---

## 1. What This Project Is

**CP Build Command Center** is an internal construction project management PWA for CP Build. It tracks construction projects, units, phases, and install teams — primarily for subcontractors. It integrates with Oracle Primavera Unifier (external project management system) to pull live project data.

This is **not** IHI Tools. It has no connection to the IHI Tools Dashboard. Do not reference IHI, shared-database coordination, or the `install_teams` workflow when analyzing or writing code for this repo.

**Who uses it:** Phil (owner/admin) + 4 incoming devs + external team members (subcontractors as Members).

**Stack:** Next.js 16 · next-intl · Prisma 7 + Postgres · PrismaPg adapter · Resend (email) · Railway (hosting) · Vitest · Playwright

**Local dev database:** Supabase free tier (cloud Postgres). `DATABASE_URL` → transaction pooler (port 6543, runtime). `DIRECT_URL` → direct connection (port 5432, migrations only). Docker is an optional alternative.

---

## 2. Infrastructure That Changes How You Code

These are the non-obvious infrastructure constraints that have burned us before.

### Railway + PgBouncer (CRITICAL)
Railway's Postgres runs behind **PgBouncer in transaction pooling mode**. This severs persistent connections between statements. Consequences:
- **❌ NEVER use `$transaction(async tx => {})` (interactive transactions)** — they require a persistent connection and will fail with "Transaction not found"
- **✅ Use sequential `db.X()` calls** — stateless, PgBouncer-compatible
- **✅ Array-form `$transaction([op1, op2])` is safe** — each op is its own statement
- For multi-step operations that need atomicity: do them sequentially and add a compensating operation (delete/update) on failure — see `app/api/projects/route.ts` for the pattern

### Locale-Prefixed Routing
All routes are under `/[locale]/` (e.g., `/en/dashboard`, `/es/dashboard`). This is mandatory, not optional.
- **✅ Always import** `Link`, `redirect`, `useRouter`, `usePathname` **from `@/i18n/navigation`**
- **❌ Never import** from `next/link` or `next/navigation` directly — it breaks locale handling
- The middleware file is `proxy.ts`, NOT `middleware.ts` — this is intentional

### Middleware Is `proxy.ts`
Next.js conventionally uses `middleware.ts`. This project uses `proxy.ts` as the custom entrypoint. It handles route protection AND next-intl locale middleware. Do not rename it.

---

## 3. Project Layout

```
app/
  [locale]/           # All pages — locale-prefixed (/en/, /es/)
    (auth)/           # Login, invite acceptance (public)
    (dashboard)/      # Protected pages — session guard in layout.tsx
  api/                # API routes
    auth/             # NextAuth
    invites/          # Invite CRUD + accept + validate
    projects/         # Project + units CRUD
    forms/            # Form builder templates and versions
    inspection-submissions/ # Inspection submit/edit, normalization, activity logging
    team/             # Team directory
    unifier/          # Unifier proxy
    lookups/          # Lookup tables (scope types, UOM, etc.)
    offline/          # Offline preferences + snapshot
    devtools/         # Dev-only diagnostic endpoints
    health/           # /api/health
components/
  ui/                 # shadcn/ui primitives
  auth/               # LoginForm, InviteAcceptForm
  team/               # TeamDirectory, InviteModal
  projects/           # ProjectList, CreateProjectModal, UPM parsing UI
  devtools/           # DevTools panel components
  shared/             # SkipLink, RouteAnnouncer, OfflineIndicator
  lib/
  auth.ts             # NextAuth config — credentials provider, JWT
  db.ts               # Prisma singleton (PrismaPg adapter)
  permissions.ts      # PERMISSIONS constants + ROLE_PERMISSIONS + hasPermission()
  email.ts            # Resend email utilities (DEV_EMAIL_OVERRIDE redirects to dev inbox)
  announcements/      # In-app campaigns — admin CRUD, active overlay, sanitized HTML bodies
  datetime/           # datetime-local helpers for admin forms (schedule fields)
  upm-parse.ts        # Unit Plan Matrix spreadsheet parser
  project-rows.ts     # Bulk raw SQL insert for project_rows
  inspections/        # Inspection normalization, deficiency extraction, offline sync
  devtools-env.ts     # isDevToolsAllowed(), isDeployedEnvironment()
  validations/        # Zod schemas
messages/
  en.json             # English translations (add ALL new UI strings here)
  es.json             # Spanish translations (required — add with en.json)
prisma/
  schema.prisma       # DB schema — see docs/contracts/db-schema-notes.md
  migrations/         # SQL migrations — never edit manually after applying
i18n/
  navigation.ts       # Locale-aware Link, redirect, useRouter, usePathname
proxy.ts              # Route protection + next-intl middleware
__tests__/
  unit/               # *.unit.test.ts — Vitest, no DB, no network
  integration/        # *.integration.test.ts — Vitest + mocked DB
e2e/                  # Playwright end-to-end tests
docs/
  packs/              # THIS FILE + prompt-pack.md
  decisions/          # Architectural decision log (ADRs)
  contracts/          # API + DB shape documentation
```

---

## 4. Auth & Permissions — The Pattern

Every protected API route must follow this pattern exactly:

```typescript
const session = await auth();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

const userRole = session.user.role;
if (!hasPermission(userRole, PERMISSIONS.YOUR_PERMISSION)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

- Roles: `ADMIN`, `MEMBER`
- Permissions catalog: `lib/permissions.ts`
- **Never trust client-side auth state for access control** — UI gating is UX only
- Route protection (redirects) is handled by `proxy.ts` — it does not grant access by itself

---

## 5. Code Conventions

| Area | Rule |
|------|------|
| TypeScript | Strict mode — no `any`. `interface` for object shapes, `type` for unions |
| CSS | CSS variables from `app/globals.css` — no hardcoded hex or pixel values |
| i18n | Every UI string → both `messages/en.json` AND `messages/es.json`. `getTranslations` in Server Components, `useTranslations` in Client Components |
| Commits | `feat(area): description` · `fix(area): description` · `chore: description` |
| API calls from components | Always via service layer in `lib/` — never raw `fetch` in components |
| Logging | Never log PII (emails, names). Use `maskEmail()` from `lib/email.ts` |
| Env var guards | Any env var that changes behavior must check both `NODE_ENV` and `APP_ENV` for prod guards — never rely on "it won't be set" |

### Scope Status Semantics
`ScopeStatus.PENDING_VERIFICATION` means Install Complete-SUB: the subcontractor reported the install complete, but CP Build has not verified it. Treat only `INSTALL + COMPLETE` as verified install complete for percentage math, inspection status, and manager-facing completion rollups.

### Scope Tile & Picker Tokens
Grid scope tiles (`lib/scope-square-style.ts`) and combined status pickers (`lib/scope-combined-options.ts`) must stay aligned on the same CSS variables from `app/globals.css`: `--scope-tile-not-started-*`, `--scope-tile-staging-*` (Package icon), `--scope-tile-assembly-*` (stack icon), etc. Never hard-code `--blue-*` in picker options when a `--scope-tile-*` token exists for that stage.

`scopeRow.inspectionStatus` on the unit grid is authoritative only when backed by a **clear inspection** form submission or Procore backfill (`submissionAuthoritativeForScopeInspectionStatus` in `inspectionSummary.ts`). Pre-install and calibration submissions must not write `inspectionStatus` when the unit detail panel opens — reconciliation runs only for `INSTALL + COMPLETE` scopes.

### Inspection Reporting Semantics
Inspection UI still submits the same form payloads, but the backend dual-writes reporting tables for form structure, answers, deficiencies, and deficiency media. Reporting should join from `inspection_answers` and `inspection_deficiencies` back through `inspection_submissions` instead of duplicating project/unit/scope context on every child row. Calibration inspections are explicitly observational: they can be logged and reported, but they must not change the scope's clear-inspection status.

### Inspection export — share only failed items
CSV/PDF exports and single-submission PDF share support an optional **Share only failed items** toggle (`shareOnlyFailedItems`). When enabled, fully passing inspections are omitted and only failing pass/fail questions are included. Use `filterSubmissionsForFailedOnlyExport()` and `submissionHasFailedExportItems()` from `lib/inspections/inspection-failed-items-export.ts`; empty exports surface `reportExportNoFailedItems` toast / `FailedOnlyExportEmptyError` on the server.

### Inspection Offline Sync
Inspection submissions are queued in IndexedDB before the API call. If a queued retry receives a `409` because the server already saved the same clear inspection, reconcile by fetching the scope/unit submissions, matching the saved payload, and marking the local record synced. Background replay must preserve `X-Offline-Mutation-Id` and `X-Client-Queued-At` headers so activity logs retain offline replay metadata.

### Inspection in-progress drafts (local-only)
Live, retry, and calibration fills in `InspectionFillOverlay` autosave partial progress to IndexedDB (`inspectionDrafts` store in `cpb-command-center` v2) while the inspector works. One draft per `(scope, form, parent submission context)` on the device. Closing with unsaved changes opens a leave guard (keep editing / save and close / discard). Successful submit deletes the draft. Drafts are **not** synced to the server in this release — cross-device resume is a future PR.

### PDF Export Semantics
PDF exports use server-side Puppeteer through `lib/pdf/puppeteer-launch.ts`; routes should call the shared PDF builders and return the shared `PDF_*` error shape from `lib/pdf/pdf-export-errors.ts`. Attachment images are prefetched server-side only after URL allowlisting: same-origin field-media URLs may receive the export request cookie, Supabase signed storage URLs are allowed without cookies, and arbitrary/private hosts are skipped to avoid SSRF. Optional cover-title fields from JSON bodies must be treated as `unknown` at the route boundary and normalized with `normalizePdfCoverTitleFromBody`.

### Feedback Assist Media
Feedback assist can be grounded by text, video, and screenshot/image inputs. Persisted `aiAssistMetadata.inputModes` must be able to represent all exercised modes (`text`, `video`, `image`), while the stored file refs keep only Gemini Files metadata (`fileUri`, `mimeType`, `expiresAt`), not media bytes.

### Save to Device Photos (field camera)
Optional device-local preference (`cc-save-to-photos` in `lib/save-to-photos-preference.ts`). When enabled, `CameraCapture` calls `shareFilesToDevice()` on confirm so mobile users can save copies via the OS Web Share sheet; Field Tracker upload proceeds even if share is cancelled or fails. The in-camera **Save** toggle is the only control — it persists on/off in `localStorage`. Requires `navigator.share` — hide toggle when unavailable.

### In-app announcements
Admins manage campaigns at `/admin/announcements` (`AnnouncementsManager`). Every campaign reaches **all logged-in users**; schedule window + dismissals are the only gates (`AnnouncementHost` overlay). API always writes `audience: ALL`. Schedule fields use `toDatetimeLocalValue()` from `lib/datetime/datetime-local.ts` — never seed `datetime-local` inputs from UTC-sliced ISO strings. Run `npm run bootstrap:app-announcements` to normalize legacy audience rows and remove the old auto-seeded save-to-photos campaign.

---

## 6. Testing Standards

| What you changed | Required test |
|-----------------|---------------|
| `lib/` utility | Unit test in `__tests__/unit/` |
| React component | Unit test (render + interaction) |
| API route | Integration test in `__tests__/integration/` |
| Full user flow | E2E test in `e2e/` |
| Permission logic | Unit + integration |

Run before every push:
```bash
npm run build && npm run lint && npm run test:unit
```

Always mock `lib/db` (Prisma) and `lib/auth` in unit and integration tests.

---

## 7. Anti-Patterns — Do Not Repeat These

These were caught by Copilot in production PRs. Read them before writing code.

| Category | Anti-pattern | What to do instead |
|----------|-------------|-------------------|
| `prisma/transactions` | `$transaction(async tx => {})` — fails on Railway/PgBouncer | Sequential `db.X()` calls with compensating deletes on error |
| `security/guards` | Dev-only env vars without production guard | Check both `NODE_ENV !== 'production'` AND `APP_ENV !== 'production'` |
| `security/pii` | Logging full email addresses | Use `maskEmail()` — always mask PII at the logging callsite |
| `github-actions/yaml` | Multi-line strings with `**`, backticks, em dashes in `run:` blocks | Build with `printf '...\n...'` into a shell variable first |
| `github-actions/dedup` | Creating issues/comments from workflows without checking if one already exists | Always `gh issue list` / search comments before creating |
| `graphql/pagination` | `first: N` without checking `totalCount` | Always fetch `totalCount`; if `totalCount >= N`, fail safe instead of proceeding on partial data |
| `shell/grep` | `grep -q` for literal string matching (treats pattern as regex) | Use `grep -Fq` for fixed-string matching |
| `upm/empty-rows` | Testing "all cells empty" to detect template filler rows | Check only identity fields: Building + Level + Unit all blank → skip row |
| `i18n` | Adding UI string to only `en.json` | Always add to both `en.json` AND `es.json` in the same commit |
| `api/consistency` | Behavioral wrappers (guards, redirects, transforms) added to one code path but not all entry points | When adding a wrapper, immediately audit all callsites |

Full details and root causes: `docs/COPILOT_LEARNINGS.md`

---

## 8. PR & Merge Rules

- **Branch from `dev`**, not `main`. Naming: `feat/name`, `fix/description`, `hannah/feature`, `chore/desc`
- **All PRs target `dev`**. `dev → main` is Phil's job only.
- **Phil's PRs** (authored by `cp-build-dev`): agents may auto-merge when safe-to-merge conditions pass
- **Contributor PRs** (Hannah, other devs): Phil personally reviews and merges — no agent auto-merge
- **Prisma schema changes** always require Phil's review — never auto-merge

Safe-to-merge conditions and the full PR protocol: `.cursor/rules/git-pr-workflow.mdc`

---

## 9. Related Documents

| Document | Purpose |
|----------|---------|
| `docs/packs/prompt-pack.md` | Compact paste-in for fresh agent sessions |
| `docs/decisions/decision-log.md` | Architectural decisions with context and consequences |
| `docs/contracts/api-contracts.md` | API route shapes and auth requirements |
| `docs/contracts/db-schema-notes.md` | DB schema design notes |
| `docs/COPILOT_LEARNINGS.md` | Full anti-pattern log with root causes |
| `.github/copilot-instructions.md` | Copilot-specific review instructions |
| `.cursor/rules/git-pr-workflow.mdc` | Full agent PR protocol (auto-merge, Copilot loop, comms) |
| `.cursor/rules/project-prompt.mdc` | Phase-by-phase project build plan |
| `docs/DEPLOYMENT.md` | Railway deployment guide |
