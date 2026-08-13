# Changelog — CP Build Command Center

Running history of all significant changes, newest first. Updated with every PR that merges to `dev`.

**Agents:** Read this file when picking up the project to understand what has changed recently and what is currently in progress. Combine with `PROJECT_TRACKER.md` for full context.

---

## [In Progress] feat/release-verification-system — 2026-03-05

**Branch:** `feat/release-verification-system` — targeting `dev`.

### Database
- **`Release` model** — tracks deployed releases with `title`, `prNumber`, `branch`, `environment`, `mergedAt`, `changes` (JSON array of `ReleaseChange`)
- **`ReleaseVerification` model** — records when an admin verifies a release in a specific environment
- **`EnvironmentVisit` model** — tracks last-visit timestamp per user+environment
- **Migration `20260305000000`** — creates `releases`, `release_verifications`, `environment_visits` tables

### API Routes (new, all DevTools-admin-only)
- **`GET /api/devtools/releases`** — releases since last visit with verification status
- **`POST /api/devtools/releases`** — create release entry manually
- **`PATCH /api/devtools/releases/[id]/verify`** — mark release verified (upsert)
- **`DELETE /api/devtools/releases/[id]/verify`** — un-verify a release
- **`POST /api/devtools/releases/import-changelog`** — import `[Merged]` entries from `CHANGELOG.md` (idempotent by prNumber)
- **`POST /api/devtools/environment-visit`** — upsert last-visit timestamp

### DevTools
- **`ReleaseChecklist.tsx`** — new 11th tab in DevTools panel; shows releases grouped by "new since last visit" vs "previously seen"; per-release verify checkboxes; "Go Verify" nav buttons; "Mark all verified" and "Sync CHANGELOG" actions
- **`DevToolsPanel.tsx`** — adds `release-checklist` tab (visible in all environments including deployed); sandbox mode state; amber "Sandbox mode active" banner
- **Sandbox Mode** — MSW browser service worker intercepts API mutations when sandbox is active; `lib/msw/browser.ts` + `lib/msw/browser-handlers.ts` + `public/mockServiceWorker.js`

### Lib
- **`lib/changelog-parser.ts`** — parses `CHANGELOG.md` into structured `ParsedRelease` objects; infers routes and categories from branch names and descriptions
- **`lib/msw/browser.ts`** — lazy MSW worker lifecycle (`startSandbox`, `stopSandbox`)
- **`lib/msw/browser-handlers.ts`** — mock handlers for projects, units, team, feedback, offline preference mutations
- **`lib/devtools-auth.ts`** — adds `requireDevToolsAdminWithSession()` (single `auth()` call, returns both guard and session)

### Tests
- **`changelog-parser.unit.test.ts`** — 27 unit tests covering `inferRoute`, `parseChangelog` (merged, in-progress, edge cases)
- **`devtools-releases.integration.test.ts`** — 18 integration tests covering all 4 new route handlers (auth failure, happy path, null fields)

---

## [In Progress] feat/project-hub-navigation — 2026-03-03

**Branch:** `feat/project-hub-navigation` — targeting `dev`.

### Mobile Navigation
- **`MobileBottomNav`** — PWA-style bottom nav bar (Dashboard / Projects / Users), hidden on desktop, shown on real mobile and in DevTools viewport simulator
- **`ProjectMobileBottomNav`** — project-scoped bottom nav (Overview / Units / SOV), replaces sidebar inside `(project)/` layout on mobile
- **`ProjectSideNav`** — adds `id="project-side-nav"` so CSS can hide it on mobile
- **`SideNav`** — Settings item removed from global nav
- **`TopBar`** — mobile variant: CP Build brand on left, avatar button with dropdown (name / role / Settings / Logout) on right; Bell icon desktop-only; notification badge on avatar
- **`globals.css`** — `.mobile-only` / `.desktop-only` utility classes; `#project-side-nav` / `#project-mobile-bottom-nav` CSS rules for responsive hiding/showing

### Project Workspace Layout
- **`(project)/` route group** — dedicated layout with `ProjectTopBar` (blue context bar), `ProjectSideNav`, `ProjectMobileBottomNav`, `main`, and DevTools wiring
- **`ProjectTopBar`** redesigned — project name left, `← Back to Projects` button right (44px touch target), status badge removed
- **Units page** (`/projects/[id]/units`) — new page for mobile unit card list
- **SOV page** (`/projects/[id]/sov`) — placeholder page for Schedule of Values (Unifier pull)
- **Project overview** — UPM link card added (admin/manager only), navigates to full spreadsheet view

### Mobile Project Cards
- **`ProjectsPageClient`** — client wrapper separates Add Project button (now in page header) from `ProjectsTable`
- **`ProjectsTable`** — mobile card view (unit name, address, IM/PM avatar pills) replaces table on mobile; filter button label hidden on mobile; Add Project moved to header
- **`globals.css`** — `.upm-link-card` hover class for server component link

### Unit Cards + Unit Detail Modal
- **`UnitCards`** — fetches `/api/projects/[id]/units`, groups rows by `building|level|unit`, renders compact cards with: unit type pill (color-coded per type), location icons (Building2 / Layers / Maximize2), scope pills per scope type, overall progress bar inline with `%`
- **Unit Detail Modal** — slides up with iOS spring animation; shows all scopes with inline controls:
  - **Stage** 3-button toggle: `Staging` / `Assembly` / `Install`
  - **Status** 4-pill toggle: `Not Started` / `In Progress` / `Blocked` / `Complete`
  - Optimistic PATCH on every tap — no page reload
- **`ScopeStage` + `ScopeStatus`** enums added to `prisma/schema.prisma` + columns on `project_rows`
- **PATCH `/api/projects/[id]/units/[rowId]`** — accepts `scopeStage` + `scopeStatus` fields

### DevTools
- **`ViewportToggle`** — defaults to iPhone 14 (390×844) on load; device state persisted to `localStorage`; `DevToolsPanelWrapper` defaults `viewportActive: true` for mobile dev work
- **`SpacingEditor`** — live CSS token editor (layout rules real-time), layout issue tracker with screenshot paste, DB-backed persistence
- **`DevToolsPanel`** — draggable resize handle, header shows active tab name in side-panel mode

### Database / Migrations
- **`LayoutIssue` model** — `id, description, device, platform, route, status (OPEN/FIXED), screenshot (Text), fixRuleType, fixRuleName, fixNote, fixedAt, createdAt, updatedAt`
- **`LayoutIssueStatus` enum** — `OPEN | FIXED`
- **`ScopeStage` enum** — `STAGING | ASSEMBLY | INSTALL`
- **`ScopeStatus` enum** — `NOT_STARTED | IN_PROGRESS | BLOCKED | COMPLETE`
- **`project_rows`** — `scopeStage ScopeStage?`, `scopeStatus ScopeStatus?`
- **Migration `20260228000000`** — `DesignTokenSnapshot`, `OfflinePreference`, project + project_rows indexes
- **Migration `20260228100000`** — `layout_issues` table + enum
- **Migration `20260228200000`** — `ScopeStage` / `ScopeStatus` enums + columns

### API Routes (new)
- **`GET /api/devtools/layout-issues`** — list all issues newest-first (DevTools admin only)
- **`POST /api/devtools/layout-issues`** — create new open issue with optional base64 screenshot
- **`PATCH /api/devtools/layout-issues/[id]`** — update status (OPEN→FIXED or reopen), set fix metadata
- **`DELETE /api/devtools/layout-issues/[id]`** — hard delete

---

## [In Progress] docs: CHANGELOG, Hannah onboarding overhaul, PROJECT_TRACKER update — 2026-02-26

**PR #66** — Currently open, targeting `dev`.

### Changes
- **Docs: `CHANGELOG.md` created** — this file; running project history backfilled from all merged PRs
- **Docs: `docs/HANNAH_AGENT_ONBOARDING_PROMPT.md` overhauled** — lightweight no-Docker setup as primary path, `.cursor/rules/` auto-loading explained, DO/DON'T guide, "Getting Latest Changes" section
- **Docs: `PROJECT_TRACKER.md` updated** — date corrected, DevTools/Unifier/team tooling sections added, cross-references to CHANGELOG and Hannah's onboarding doc

---

## [In Progress] feat/devtools-error-wrap-up — 2026-02-26

**PR #62** — Currently open, targeting `dev`.

### Changes
- **Fix: React infinite re-render loop** — `ctx` removed from `useEffect` dependency arrays in `ServerLogs`, `TestPlanVisualizer`, `TestRunner` (calling context setters was triggering loops)
- **Fix: Auth.js `UntrustedHost`** — `trustHost: true` set unconditionally in `lib/auth.ts` for localhost (port 3002) and Railway/Vercel proxy deployments
- **Fix: Session crash** — null guard added to `callbacks.session` before accessing `user.id`
- **Fix: Error Wrap-Up layout** — button always visible; report auto-runs on tab mount
- **Feature: Unifier mock mode** — `UNIFIER_MOCK=true` default for local + deployed dev; `isUnifierMockAllowed()` handles `NODE_ENV + APP_ENV / RAILWAY_ENVIRONMENT_NAME`
- **Feature: `npm run unifier:check`** — masked credential status script (never logs the real password)
- **Feature: `npm run dev:setup:cloud`** — lightweight setup using cloud Postgres, no Docker required (important for MacBook Air / Hannah's machine)
- **Docs: `docs/UNIFIER_SETUP.md`** — how to configure and verify Unifier API credentials
- **Docs: `docs/DEV_SETUP_LIGHTWEIGHT.md` + checklist** — step-by-step no-Docker dev setup
- **Team: `.cursor/rules/` committed to repo** — all Cursor AI rules are now shared; agents on every machine get the same context automatically on clone/pull
- **Team: `CONTRIBUTING.md` updated** — corrects "branch from main" → "branch from dev", adds rebase-before-PR step

---

## [Merged] chore/copilot-instructions-improvements — 2026-02-26 · PR #50

- Copilot instructions improved to reduce corrective feedback cycles
- `project-scope.mdc` Cursor rule added: Command Center has no connection to IHI Tools (prevents AI agents from importing irrelevant context)
- DevTools static imports fix (replaced dynamic imports in devtools routes that broke on Railway)

---

## [Merged] feat/open-project-flow — 2026-02-26 · PR #55

- Project open flow and related Cursor rule update (IHI references removed from rules)

---

## [Merged] feat/devtools-error-wrap-up (first pass) — 2026-02-26 · PR #60

- Error Wrap-Up DevTools tab added (aggregate errors → one AI prompt)
- Server logs fix
- Gemini API env setup for AI-assisted error analysis

---

## [Merged] copilot/add-integration-unit-testing — 2026-02-26 · PR #57

- Unit and integration tests added to Railway deploy flow
- CI gate: Railway deployment now blocked if any test fails

---

## [Merged] chore/cursor-rule-enhancements — 2026-02-26 · PR #56

- Cursor rules improved (project scope, testing standards, workflow)
- Dev tooling scripts added

---

## [Merged] fix/signout-client-component-crash — 2026-02-26 · PR #53

- Fixed crash when signing out from a Server Component context
- Used client-side `signOut()` to prevent the crash

---

## [Merged] fix/devtools-403-resend-detail — 2026-02-26 · PRs #47 / #49 / #51

- DevTools 403 on Railway dev environment resolved
- DevTools now auto-enabled via `RAILWAY_ENVIRONMENT_NAME` env var (not just `NODE_ENV`)
- Resend invite errors now return human-readable detail (not generic 500)

---

## [Merged] feat/devtools-admin-email-troubleshooting — 2026-02-26 · PR #43

- DevTools accessible to admins in all environments (dev + staging)
- Email troubleshooting panel added to DevTools
- Error Wrap-Up foundation laid

---

## [Merged] feat/resend-invite — 2026-02-26 · PR #41

- Admins can resend pending invites from the Team directory

---

## [Merged] chore/environment-parity — 2026-02-26 · PR #40

- `npm ci` enforced (not `npm install`) for reproducible installs across all developers
- Node ≥22, npm ≥10 requirement documented
- `.npmrc` with `legacy-peer-deps=true` committed

---

## [Merged] feat/resend-email-for-dev — 2026-02-26 · PR #38

- Resend email integration set up for dev environment
- Mailpit still used for pure local dev (Docker); Resend for Railway dev

---

## [Merged] chore/copilot-deploy-automation — 2026-02-26 · PR #37

- GitHub Actions workflow: Copilot sub-PR automation (`copilot-sub-pr-automation.yml`)
  - Auto-resolves review threads when Copilot sub-PR is merged
  - Closes redundant Copilot sub-PRs
- Railway deploy script (`scripts/deploy-railway.sh`)

---

## [Merged] feat/bootstrap-automation — 2026-02-26 · PR #34

- Admin user bootstrapped automatically on Railway deploy (no manual step needed)
- `scripts/bootstrap-admin.ts` — idempotent, skips if admin already exists

---

## [Merged] feat/bootstrap-psalter-super-admin — 2026-02-26 · PRs #18 / #30

- ADMIN is the top-level role — SUPER_ADMIN merged in, all permissions folded into ADMIN
- Bootstrap script creates Philip Salter as default super admin
- Hydration mismatch fix on initial load

---

## [Merged] Initial foundation — before 2026-02-26

**Core app built from prototype (Hannah's Figma Make sessions 1–4):**

- Authentication: Auth.js v5, credentials provider, bcrypt, JWT
- Roles: `ADMIN`, `MEMBER` (SUPER_ADMIN merged into ADMIN)
- Team management: invite flow, accept flow, team directory, role management
- Projects data table: 7 columns, search, sort, filter, sticky header
- Dashboard: 6 module cards (placeholder, ready for wiring)
- PWA: manifest, service worker (auto-generated at build, gitignored)
- i18n: English + Spanish via `next-intl`, locale-prefixed routing
- Accessibility: skip links, route announcer, aria-live offline indicator
- Design tokens: full token system in `app/globals.css` matching Hannah's prototype
- CI/CD: Railway (dev + prod) + Supabase (PostgreSQL), GitHub Actions

---

## How to Keep This Updated

After every PR that merges to `dev`:

1. Add a new `## [Merged]` entry at the top (below `[In Progress]`)
2. 1–5 bullet points: what changed and why
3. Include PR number and date
4. Move the current `[In Progress]` entry to `[Merged]` when it lands

**AI agents:** When making changes, add a brief entry to this file in the same commit.
