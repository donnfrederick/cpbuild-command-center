# Project Overview — CP Build Command Center

> **Agent instruction:** Read this file first. It gives you the product context needed to reason about any task without loading source files.

## What It Is

**CP Build Command Center** is an enterprise-grade internal operations platform for a construction company. It is used daily by Install Managers, Project Managers, and QC teams to track construction projects, unit-level scope-of-work progress, and team activity.

- **Type:** Internal tool — employees only, not public-facing
- **Users:** Admins, Install Managers, Project Managers, QC reviewers
- **Design philosophy:** Structured, operational, utilitarian (construction management software, not a consumer app)
- **No IHI connection:** This project has no relationship to IHI Tools or any external dashboard. Do not reference IHI anywhere.

## Core Workflows

### 1. Project Lifecycle
1. Admin or PM creates a project (linked to a Unifier project via `unifierPid`)
2. Upload a UPM (Unit Plan Matrix) Excel file → parsed into `ProjectRow` records
3. Install Manager drives rows through scope stages: **STAGING → ASSEMBLY → INSTALL**
4. Within each stage, status progresses: **NOT_STARTED → IN_PROGRESS → BLOCKED → COMPLETE**
5. At INSTALL + COMPLETE, a QC reviewer sets `inspectionStatus`: **READY → PASSED / FAILED**

### 2. Team Management
1. Admin invites team member via email → tokenized invite link sent via Resend
2. Invitee clicks link → accept form creates their user account
3. Admin can update roles and remove members from the team directory

### 3. Offline Support
- Users select which data modules to cache locally (offline preferences)
- The app functions on-site without connectivity; syncs when back online

### 4. DevTools (dev + admin only)
- Layout issue tracker, viewport simulator, spacing editor
- Not available in production

## Key Terminology

| Term | Meaning |
|------|---------|
| UPM | Unit Plan Matrix — the Excel spreadsheet that defines project scope |
| Project Row | One line of a UPM; represents a unit of work within a project |
| Scope Stage | Phase of physical work: STAGING, ASSEMBLY, INSTALL |
| Scope Status | Progress state within a stage: NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETE |
| Inspection Status | QC clearance after INSTALL+COMPLETE: READY, PASSED, FAILED |
| Unifier | Oracle Primavera Unifier (PDS API) — upstream project data source |
| unifierPid | Unifier's internal project identifier, used for API lookups |
| Install Manager | The user role responsible for driving unit-level scope progress |
| DevTools | Admin-only floating panel for debugging layout, running tests, checking diagnostics |

## Repo Structure

| Repo | Purpose |
|------|---------|
| `cp-build-dev-ops/command-center-reboot` | **This repo** — production Next.js app |
| `cp-build-dev/Commandcenterreboot` | Figma Make prototype — design reference only, NOT deployed |

## Deployment

| Environment | Host | Database |
|-------------|------|----------|
| Development | Railway **dashboard** env `development` — **`railway up --environment dev`** (CLI env name is `dev`) | Supabase `commandcenter-dev` |
| Production | Railway **dashboard** env `production` — **`railway up --environment production`** | Supabase `commandcenter-prod` |

**Agents — read these before changing deploy behavior** (do not rely on chat memory alone):

| Doc / artifact | Role |
|----------------|------|
| `.github/workflows/deploy.yml` | **Canonical automation:** push to `dev` or `main` → unit/integration tests → build → `railway up` → `/api/health` verify (and non-blocking smoke/tour jobs). |
| `docs/DEPLOYMENT_QUICKSTART.md` | Railway dashboard checklist (source branch per environment, **Wait for CI**, secrets like `RAILWAY_DEV_URL`). |
| `DEV_NOTES.md` → **Deployment (Railway + Supabase)** | Full setup, `npm run promote`, migrations on deploy. |
| `.cursor/rules/git-pr-workflow.mdc` | **PR → `dev` → verify → `main` / prod** rules (merge strategy for releases, deploy receipts, security-sensitive paths). |

- Dev URL: polled via `/api/health` after deploy.
- Local promote script: `npm run promote` (unit tests → build → deploy dev → smoke → manual gate → deploy prod).
- **If docs and Railway settings disagree**, treat **`deploy.yml` + `git-pr-workflow.mdc`** as the merge/deploy contract; update `DEPLOYMENT_QUICKSTART.md` or this section when you change the pipeline so they stay aligned.
- **Transactional email** (invites, forgot-password): production normally needs a real **`RESEND_API_KEY`**, **`EMAIL_FROM`**, and **`NEXTAUTH_URL`** on Railway — see `DEV_NOTES.md` → **Authentication and email (deployed environments)** and `docs/agent-context/key-services.md` → `lib/email.ts`.
