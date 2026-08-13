# Contributing to CP Build Command Center

> **For AI agents:** This file is the onboarding reference for RAD dev contributors. Read it alongside `docs/agent-context/project-overview.md` before starting any task. If you are Phil's agent, follow `.cursor/rules/project-prompt.mdc` instead.

---

## Getting Started

```bash
# Clone the repo
git clone git@github.com:cp-build-dev-ops/command-center-reboot.git
cd command-center-reboot

# Install dependencies (always use npm ci — never npm install)
npm ci

# Start the dev server (runs on port 3002)
npm run dev
```

**Prerequisites:** Node ≥ 22, npm ≥ 10. The `.npmrc` sets `legacy-peer-deps=true` — don't override it.

You will need a `.env.local` file with dev credentials. Phil shares this securely — it is never committed to the repo. Place it in the repo root before running `npm run dev`.

---

## Codebase Orientation

Before writing code, read the context docs. They give you architectural knowledge without scanning raw source files:

| What you're doing | Read this first |
|---|---|
| Any task | `docs/agent-context/project-overview.md` |
| API route or server logic | `docs/agent-context/backend-patterns.md` + `docs/agent-context/architecture.md` |
| Component or UI work | `docs/agent-context/frontend-patterns.md` + `docs/agent-context/architecture.md` |
| Database query or migration | `docs/agent-context/database-schema.md` + `docs/agent-context/backend-patterns.md` |
| Using a `lib/` utility | `docs/agent-context/key-services.md` |

These 7 files replace scanning raw source directories. Load them first, open source files only when you need a specific implementation detail.

---

## Branch Naming

Always branch off `dev`. Target `dev` with your PR. Never target `main`.

| Type | Pattern | Example |
|---|---|---|
| New feature | `feat/short-description` | `feat/unit-detail-modal` |
| Bug fix | `fix/short-description` | `fix/offline-sync-conflict` |
| Maintenance | `chore/short-description` | `chore/update-deps` |

Keep branches focused on one feature or fix. Do not bundle unrelated changes.

```bash
git fetch origin
git checkout -b feat/your-feature origin/dev
```

---

## Quality Gate — Run Before Every Push

Run these locally before pushing. CI enforces lint and tests; build is your responsibility to verify locally before opening a PR:

```bash
npm run build        # verify locally — no TypeScript errors
npm run lint         # must pass — 0 errors (warnings OK)
npm run test:unit    # must pass — all unit tests green
```

Every code change requires a matching test. See `.cursor/rules/testing.mdc` for the full testing standard.

---

## Protected Files — Require Phil's Approval

These files are enforced by CODEOWNERS and branch protection. GitHub will **block the Merge button** on any PR touching them until Phil explicitly approves — this is not just a convention, it is a hard gate.

### Agent memory and project rules (new for contributor PRs)

- `.cursor/rules/` — agent behavior rules that govern all AI agents in this repo
- `docs/` — shared project memory (context layer, learnings log, decisions, coordination)
- `DEV_NOTES.md`, `PROJECT_TRACKER.md`, `LAYOUT_RULES.md`, `DESIGN-SYSTEM.md`, `CHANGELOG.md`
- `.github/` — CI workflows and CODEOWNERS

These files are the shared brain of the project. Changes here affect every agent and every team member. Until the team's agent process matures, Phil reviews all changes to these files. This will loosen over time as trust in the process grows.

### Security-sensitive source files

- `prisma/schema.prisma` — database schema changes affect all environments
- `lib/auth.ts`, `lib/permissions.ts`, `lib/dev-session.ts` — auth and authorization
- Any file containing `hasPermission`, `PERMISSIONS`, or `auth()`

### What happens when you touch a protected file

1. A bot will post a comment on your PR immediately explaining the gate
2. Copilot will review your PR automatically
3. CI will run as normal
4. The Merge button stays disabled until Phil approves — resolve everything else first, then tag Phil

If your task genuinely requires modifying a protected file, open the PR normally, resolve all Copilot comments, and leave a comment explaining why the change is needed. Tag @cp-build-dev. Phil reviews promptly.

---

## PR Checklist

Before marking your PR ready for review:

- [ ] Branch is rebased on latest `dev`
- [ ] `npm run build` passes
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run test:unit` passes
- [ ] New code has a matching test file
- [ ] No secrets, `.env` files, or credentials committed
- [ ] PR targets `dev` (not `main`)

```bash
# Rebase before pushing
git fetch origin
git rebase origin/dev
git push --force-with-lease
```

---

## How Code Review Works

Every contributor PR gets an automatic Copilot review within a few minutes of being opened. Your job is to get the PR merge-ready before bringing Phil in:

1. Open PR — Copilot review triggers automatically
2. Address every Copilot comment (fix in code or document why you're skipping)
3. Resolve all review threads on GitHub
4. Confirm CI is green (`lint-and-test` passes)
5. Only then tag Phil or post "ready for review" — Phil will not merge PRs with unresolved threads or failing CI

Phil reviews and merges all contributor PRs. The Merge button is disabled for all contributors by branch protection — you cannot self-merge into `dev`.

---

## AI Agent Behavior (for Cursor users)

If you use Cursor, the `.cursor/rules/` files define how your AI agent should behave in this repo. Your agent will read these automatically. Key rules:

- **Skip the session startup checklist** (PR queue checks, auto-merge) — that is Phil's agent only
- **Do not attempt to merge PRs** — your agent should only push branches and create PRs
- **Do not touch protected files** (`.cursor/rules/`, `docs/`, `lib/auth.ts`, etc.) without Phil's explicit approval — CODEOWNERS will block the merge anyway, but surfacing the need early is better
- **Always run the quality gate** before committing

The `docs/agent-context/` files are the agent's architectural reference — they replace scanning raw directories. Your agent should load the relevant ones at the start of any task.

---

## What You'll Need Later

When you're ready to test against the live dev environment (not just local):

- Railway access to the `development` environment — ask Phil for an invite
- Supabase `commandcenter-dev` project access — ask Phil
- Updated `.env.local` with dev database credentials

These are not needed to start — local dev with the provided `.env.local` is fully functional.
