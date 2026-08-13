# CP Build Command Center — Project Tracker

**Last Updated:** 2026-03-03  
**Purpose:** Master handoff document. Any agent or developer picking up this project should read this file first. It answers: what is this, what's done, what's next, and where is everything.

> **New here?** Also read `CHANGELOG.md` (what changed recently) and `CONTRIBUTING.md` (team workflow). Hannah's agent: read `docs/HANNAH_AGENT_ONBOARDING_PROMPT.md` first.

---

## What This Project Is

**CP Build Command Center** is an enterprise-grade internal operations platform for a construction company. It is used by Install Managers, Project Managers, and QC teams to track construction projects, scope-of-work progress, and team activity.

- **Type:** Internal tool (not a public-facing product)
- **Users:** Employees only — Install Managers, Project Managers, Admins
- **Design philosophy:** Structured, operational, utilitarian. Not decorative. Think construction management software, not a consumer app.
- **Standalone:** This project has no connection to IHI Tools or any other external dashboard. Do not reference IHI or shared-database coordination.

---

## Repository Structure

| Repo | Purpose | Access |
|------|---------|--------|
| `github.com/cp-build-dev-ops/command-center-reboot` (this repo) | **Production Next.js app** — this is what gets deployed | Main working repo |
| `github.com/cp-build-dev/Commandcenterreboot` | **Figma Make prototype** — design/UI reference only, NOT the app | Read-only reference |

### Figma Make Prototype Workflow

Hannah (designer) builds features in Figma Make and pushes to the prototype repo. When she pushes:

1. Clone the latest prototype: `gh repo clone cp-build-dev/Commandcenterreboot /tmp/prototype-ref -- --depth=1`
2. Read `DEVELOPMENT_LOG.md` for session changelog (what changed since last push)
3. Read `DESIGN_SYSTEM.md` and `COMPONENT_LIBRARY.md` for any new components or tokens
4. Create a sync plan (compare prototype vs production app)
5. Implement changes in this repo — wire up to real backend, not mock data

**Prototype documentation files (Session 5 complete):**

| File | Purpose |
|------|---------|
| `DEVELOPMENT_LOG.md` | Complete session changelog — read this first on each sync |
| `DESIGN_SYSTEM.md` | Finalized design system v0.1 reference |
| `DESIGN_TOKENS_REFERENCE.md` | Quick CSS variable cheat sheet |
| `COMPONENT_LIBRARY.md` | Every component with ASCII diagrams + code examples |
| `CURSOR_IMPLEMENTATION_PROMPT.md` | Phase-by-phase implementation guide |
| `PRODUCTION_READINESS_GUIDE.md` | DB schema, API patterns, auth guide, deployment |
| `HANDOFF_SUMMARY.md` | Session metrics and quality summary |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack dev / webpack prod) |
| Language | TypeScript 5 strict mode |
| Styling | Tailwind CSS 4 + design tokens (CSS custom properties) |
| Font | Inter (loaded via `next/font/google`) |
| Auth | Auth.js v5 beta (next-auth), credentials provider, JWT |
| Database | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` |
| Email | Resend (Mailpit in dev) |
| Validation | Zod 4 |
| PWA | `@ducanh2912/next-pwa` (webpack plugin, disabled in dev) |
| Testing | Vitest + React Testing Library + Playwright |
| Deployment | Railway (dev + prod environments) + Supabase (PostgreSQL) |

---

## Design System

Design tokens are defined in `app/globals.css` (`:root` block). They exactly match the prototype's `/src/styles/theme.css`. **All components must use these tokens — no hardcoded hex values, no arbitrary pixel values.**

### Color Tokens

```css
/* Primary */
--primary-700: #1F3A5F;   /* Active nav, headings, brand accents */
--primary-500: #2E5C8A;   /* Buttons, links, interactive elements */
--primary-100: #E8F0F7;   /* Active nav background, hover tints */

/* Secondary */
--secondary-700: #2F3B45;
--secondary-500: #5C6B78; /* Table column headers, helper text */
--secondary-100: #EEF2F5;

/* Neutrals */
--neutral-900: #1A1F24;   /* Primary body text, headings */
--neutral-700: #3A434B;   /* Secondary text, inactive nav items */
--neutral-500: #6E7781;   /* Placeholders, disabled, captions */
--neutral-300: #C9D1D9;   /* Borders, dividers */
--neutral-100: #F4F6F8;   /* Page backgrounds */
--neutral-50:  #FAFBFC;   /* Table row hover */
--neutral-0:   #FFFFFF;   /* Card surfaces, nav bg, table bg */

/* Feedback */
--success-600: #1F7A4C;   --success-100: #E6F4EC;   /* Active status */
--warning-600: #B45309;   --warning-100: #FEF3C7;   /* Planning status */
--error-600:   #B42318;   --error-100:   #FEE4E2;   /* On Hold status */
```

### Type Scale

```css
--text-display:    32px;  /* font-weight-semibold (600) */
--text-heading:    20px;  /* font-weight-semibold (600) */
--text-subheading: 16px;  /* font-weight-medium (500) */
--text-body:       14px;  /* font-weight-normal (400) — default */
--text-caption:    12px;  /* font-weight-normal (400) */
```

### Spacing (8px base unit)

```css
--space-1: 4px   --space-2: 8px   --space-4: 16px
--space-6: 24px  --space-8: 32px  --space-12: 48px  --space-16: 64px
```

### Component Dimensions

```css
--button-height: 40px;   --input-height: 40px;
--nav-width: 240px;      --icon-size: 20px;
--radius-sm: 6px;        --radius-md: 8px;
--shadow-1: 0px 1px 2px rgba(0,0,0,0.06);
--shadow-2: 0px 4px 12px rgba(0,0,0,0.08);
--focus-ring: 0 0 0 2px var(--primary-500);
```

### Status Badge Colors

| Status | Text | Background |
|--------|------|------------|
| Active | `--success-600` | `--success-100` |
| Completed | `--neutral-500` | `--neutral-100` |
| Planning | `--warning-600` | `--warning-100` |
| On Hold | `--error-600` | `--error-100` |

---

## What Is Implemented

### Authentication & Authorization
- Real auth via Auth.js v5 — credentials (email + password), bcryptjs hashing
- JWT strategy with role embedded in token
- Roles: `ADMIN`, `MEMBER`
- Permission catalog: `lib/permissions.ts`
- Server-side enforcement on every API route and server action
- Route protection: `proxy.ts` (Next.js 16 successor to `middleware.ts`)
- **Files:** `lib/auth.ts`, `lib/permissions.ts`, `proxy.ts`

### Team Management
- Admin can invite team members via email (tokenized invite link)
- Invite acceptance creates user account
- Team directory visible to all members
- Admin can update roles and remove members
- **Files:** `app/api/invites/`, `app/api/team/`, `components/team/`

### Dashboard
- Layout: responsive card grid (`repeat(auto-fit, minmax(280px, 1fr))`)
- 6 placeholder `DashboardCard` module cards (ready for real data wiring)
- **Files:** `app/(dashboard)/page.tsx`, `components/` (DashboardCard embedded in page)

### Projects
- Data table: 7 columns (Project Name, Location, Status, Start Date, Salesforce ID, Install Manager, Project Manager)
- Search: debounced 300ms, searches name + location + Salesforce ID
- 3 filter dropdowns: Status, Install Manager, Project Manager (AND logic)
- Column sorting: all 7 columns (3-state: asc → desc → none)
- Sticky header + sticky first column (Project Name)
- Horizontal scroll for mobile
- Loading / error / empty states
- Row count footer
- Real data from PostgreSQL via Prisma
- **Files:** `app/(dashboard)/projects/page.tsx`, `components/projects/ProjectsTable.tsx`, `lib/projects.ts`, `app/api/projects/`

### Database Schema

18 models, 4 enums. Key models:

| Model | Table | Notes |
|-------|-------|-------|
| `User` | `"User"` | `id, email, passwordHash, roleId (FK→roles), name, image` |
| `Role` | `roles` | Code-based roles; 12 seeded (ADMIN, MEMBER, etc.) |
| `Permission` | `permissions` | 7 seeded permission codes |
| `RolePermission` | `role_permissions` | Join table |
| `Invite` | `"Invite"` | `token, roleId (FK→roles), sentById (FK→User), acceptedAt, expiresAt` |
| `Project` | `"Project"` | `projectName, siteLocation, status, unifierPid, installManagerName, projectManagerName, deletedAt` |
| `ProjectRow` | `project_rows` | UPM row — 25+ cols incl. `scopeStage`, `scopeStatus`, FK lookups |
| `ScopeType` | `scope_types` | Lookup |
| `LocationType` | `location_types` | Lookup |
| `CostType` | `cost_types` | Lookup |
| `InstallTeam` | `install_teams` | Lookup |
| `UomType` | `uom_types` | Lookup |
| `OfflinePreference` | `"OfflinePreference"` | Per-user offline module preferences (`modules TEXT[]`, `syncedAt`) |
| `DesignTokenSnapshot` | `"DesignTokenSnapshot"` | Single-row CSS token override store |
| `LayoutIssue` | `layout_issues` | DevTools spacing issue tracker (status: OPEN/FIXED, optional screenshot TEXT) |

**Enums:** `ProjectStatus` (Active/Completed/Planning/OnHold), `ScopeStage` (STAGING/ASSEMBLY/INSTALL), `ScopeStatus` (NOT_STARTED/IN_PROGRESS/BLOCKED/COMPLETE), `LayoutIssueStatus` (OPEN/FIXED)

- **Files:** `prisma/schema.prisma`, `prisma/migrations/` (10 migrations)

### PWA
- Manifest: `public/manifest.json`
- Service worker: generated at build time into `public/sw.js` (gitignored — do not commit)
- Offline indicator: `components/shared/OfflineIndicator.tsx`

### DevTools (admin only — enabled in prod via `DEVTOOLS_ENABLED=true`)
- **Data Visualizer v2:** 17-table whitelist (up from 11), FK-chip navigation, 11-operator column filters, excludes sensitive columns (`passwordHash`, `screenshot`)
- Error Wrap-Up tab: aggregates all errors into a single AI prompt (`components/devtools/ErrorWrapUp.tsx`)
- Frontend debugger: runs diagnostic checks against the running server
- Server log snapshot, test runner, test plan visualizer
- Production access: `DEVTOOLS_ENABLED=true` Railway variable bypasses environment guard (session must still be ADMIN)
- **Files:** `lib/devtools-env.ts`, `app/api/devtools/data/route.ts`, `components/devtools/DataVisualizer.tsx`

### Unifier PDS Integration
- Fetches available projects from Oracle Primavera Unifier API (`lib/unifier/`)
- Mock mode (`UNIFIER_MOCK=true`) active in local + dev — safe placeholder data, no credentials needed
- Real API connection configured for production via `UNIFIER_BASE_URL` + `UNIFIER_PASSWORD`

### Team Tooling
- `.cursor/rules/` committed to repo — Cursor AI rules shared across all team members automatically
- `docs/agent-context/` — 7 structured AI context files + Cursor rule (`agent-context.mdc`) for token-efficient agent sessions
- `npm run dev:setup:cloud` — lightweight setup (cloud Postgres, no Docker) for underpowered machines
- `npm run unifier:check` — masked credential status (never logs the real password)

### Navigation & Layout
- **Desktop global nav:** Fixed left sidebar (240px) — `components/layout/SideNav.tsx` (Dashboard / Projects / Users)
- **Mobile global nav:** PWA bottom nav bar — `components/layout/MobileBottomNav.tsx` (hidden on desktop, shown ≤767px)
- **Top bar:** dynamic page title (desktop) / CP Build brand (mobile), LocaleSwitcher, avatar menu — `components/layout/TopBar.tsx`
- **Project workspace:** separate `(project)/` route group with `ProjectTopBar` (blue context bar), `ProjectSideNav` (desktop), `ProjectMobileBottomNav` (Overview / Units / SOV on mobile)
- **Account menu:** bottom of desktop sidebar on dashboard pages — `components/layout/AccountMenu.tsx`; on mobile, accessed via TopBar avatar dropdown
- Auth guard in dashboard layout: `app/[locale]/(dashboard)/layout.tsx`

### Settings / Account
- Account settings page: `app/(dashboard)/settings/page.tsx`
- Offline preferences: `components/account/OfflinePreferences.tsx`

---

## What Is Pending (Next Features)

| Feature | Priority | Notes |
|---------|----------|-------|
| Units page | High | Unit list + detail views (Hannah to build shell; Phil wires API) |
| Unit detail views | High | Individual unit scope-of-work tracking |
| Project → Unifier linking | High | Connect real Unifier projects to Command Center projects (mock mode active now) |
| Inspection workflows | Medium | QC inspection tracking |
| Communication tools | Medium | In-app messaging or notes |
| Reporting dashboards | Medium | Charts (prototype has `recharts` ready) |
| Offline data selection | Low | Per-user offline preferences (UI started in `OfflinePreferences.tsx`) |

---

## Key File Map

```
app/
  (auth)/
    login/page.tsx          # Login page (card layout, Inter font, design tokens)
    invite/[token]/page.tsx # Invite acceptance flow
  (dashboard)/
    layout.tsx              # Auth guard + sidebar + topbar layout shell
    page.tsx                # Dashboard home (6 module cards)
    projects/page.tsx       # Projects page (server — fetches from DB, passes to client table)
    team/page.tsx           # Team directory
    settings/page.tsx       # Account settings
  api/
    auth/[...nextauth]/     # Auth.js handler
    projects/               # GET list, POST create
    projects/[id]/          # GET, PATCH, DELETE
    invites/                # POST create, GET list (admin)
    invites/validate/       # GET (public)
    invites/accept/         # POST (public)
    team/                   # GET list
    team/[id]/              # PATCH role, DELETE

components/
  layout/
    SideNav.tsx                # Desktop sidebar nav (Dashboard/Projects/Users)
    TopBar.tsx                 # App bar — brand/title, LocaleSwitcher, bell/avatar
    MobileBottomNav.tsx        # Mobile PWA bottom nav (hidden on desktop)
    AccountMenu.tsx            # Desktop sidebar account dropdown
    ProjectSideNav.tsx         # Project workspace desktop sidebar
    ProjectTopBar.tsx          # Blue project context bar + Back button
    ProjectMobileBottomNav.tsx # Mobile bottom nav inside project workspace
  auth/
    LoginForm.tsx              # Login form (client)
    InviteAcceptForm.tsx       # Invite acceptance form (client)
  projects/
    ProjectsTable.tsx          # Desktop project table — 7 cols, search, filters, sort
    ProjectsPageClient.tsx     # Client wrapper — Add Project button wired to modal
    ProjectDetailView.tsx      # UPM full spreadsheet view
    UnitCards.tsx              # Mobile unit cards + Unit Detail Modal (stage/status controls)
  team/
    TeamDirectory.tsx          # Member list with role management
    InviteModal.tsx            # Admin invite modal
  shared/
    StatusBadge.tsx            # Color-coded status pill
    OfflineIndicator.tsx       # aria-live offline toast
    SkipLink.tsx               # Accessibility skip nav
    RouteAnnouncer.tsx         # Screen reader route change announcer

lib/
  auth.ts                   # NextAuth config (credentials, JWT callbacks)
  db.ts                     # Prisma singleton (PrismaPg adapter)
  permissions.ts            # PERMISSIONS constants + hasPermission()
  projects.ts               # Project type, PROJECT_STATUSES, SEARCH_DEBOUNCE_MS
  email.ts                  # Resend sendInviteEmail()

prisma/
  schema.prisma             # DB models
  migrations/               # Migration history

app/globals.css             # Design tokens + base styles (source of truth)
proxy.ts                    # Route protection (Next.js 16, replaces middleware.ts)
```

---

## Local Development

```bash
# First time
cp .env.example .env
npm run dev:setup   # Docker postgres + mailpit + migrations + admin user
npm run dev         # Starts at http://localhost:3002

# Daily
npm run dev:up      # Start containers if stopped
npm run dev         # Start Next.js on :3002 (webpack — pwa requires webpack)
```

| Service | URL |
|---------|-----|
| App | http://localhost:3002 |
| Mailpit (email) | http://localhost:8025 |
| PostgreSQL | localhost:5432 |

---

## Prototype Session History

| Session | Date | What Was Built |
|---------|------|----------------|
| Session 1 | 2026-02-19 | Design system v0.1, LeftNavigation, Dashboard (6 cards), Projects data table (full), StatusBadge, React Router setup, 6 mock projects |
| Session 2 | 2026-02-19 | Layout component, StatusBadge extracted, ARIA labels, types/index.ts |
| Session 3 | 2026-02-19 | Focus-visible CSS, useDebounce hook, Escape key handlers, 100% token coverage |
| Session 4 | 2026-02-19 | API service layer (api.ts), centralized config (constants.ts), relational types (IDs + display names), loading/error states, 9-file documentation package |
| Session 5 | 2026-02-25–03-03 | Mobile-first overhaul: `(project)/` route group + project workspace layout, mobile bottom navs (`MobileBottomNav`, `ProjectMobileBottomNav`), DevTools viewport simulator + SpacingEditor, layout issue DB, mobile project cards, unit cards + Unit Detail Modal with inline ScopeStage/ScopeStatus, SOV + Units placeholder pages, 3 Railway migration files + 1 remediation migration |

---

## Deployment

| Environment | App Host | Database |
|-------------|----------|----------|
| Development | Railway `development` env | Supabase `commandcenter-dev` |
| Production | Railway `production` env | Supabase `commandcenter-prod` |

```bash
npm run promote   # Full pipeline: unit tests → build → deploy dev → smoke tests → manual gate → deploy prod
```

See `DEV_NOTES.md` for full deployment setup instructions.

---

## Sync Checklist (For New Figma Make Push)

When Hannah pushes a new session to the prototype repo:

1. `gh repo clone cp-build-dev/Commandcenterreboot /tmp/prototype-ref -- --depth=1`
2. Read `/tmp/prototype-ref/DEVELOPMENT_LOG.md` — find the new session entry at the bottom
3. Note any new components, pages, or design token changes
4. Compare with our current implementation
5. Create an implementation plan (use Plan mode)
6. Implement: wire up new UI to real backend (no mock data)
7. Update this `PROJECT_TRACKER.md` with the new session and implementation status
8. Run `npm run build && npm run lint && npm run test`
9. Commit and promote
