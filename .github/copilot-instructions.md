# Copilot Instructions — Command Center

**Project overview:** Next.js PWA with real auth, RBAC, and team management. Internal construction project management for CP Build — tracks projects, units, phases, install teams. Integrates with Oracle Primavera Unifier. Locale-prefixed routing (`/en/`, `/es/`), i18n, Prisma + Postgres. Stack: Next.js 16, next-intl, shadcn/ui, Vitest, Playwright.

**Standalone application.** Command Center has no connection to IHI Tools or any other external dashboard. Do not reference IHI or shared-database coordination when analyzing this codebase.

**Trust these instructions.** Only search the codebase if information here is incomplete or found to be wrong. Avoid re-exploring build steps, layout, or conventions already documented below.

---

## Code Review (PR analysis)

**Prioritize:** Security (auth, secrets, input validation), API authz (`auth()` + `hasPermission`), accessibility (ARIA, focus, contrast), and correctness (logic bugs, type safety). Acknowledge good patterns when you see them.

**Do not flag:**
- Style/formatting that ESLint already enforces (semicolons, line length, etc.)
- Use of `proxy.ts` instead of `middleware.ts` — this repository intentionally uses `proxy.ts` as its middleware entrypoint
- Use of `Link`/`redirect`/`useRouter`/`usePathname` from `@/i18n/navigation` — required for locale-aware routing, not a mistake
- CSS variables from `app/globals.css` — we avoid hardcoded hex/pixels by design
- Mocking `lib/db` and `lib/auth` in tests — required pattern
- Lock files, generated files (e.g. Prisma client), or `package.json` unless the PR explicitly changes them

**Review style:** Be specific and actionable. Explain the "why." Avoid vague suggestions like "consider refactoring" without a concrete alternative. If code intent is unclear, ask a clarifying question rather than assuming.

---

## Environment Parity (required for consistent installs)

**Use `npm ci`** (not `npm install`) for dependency installs. Node ≥22, npm ≥10. The project `.npmrc` has `legacy-peer-deps=true` — do not override in global config. See [DEV_NOTES.md#environment-parity](../DEV_NOTES.md#environment-parity) for full setup. When helping a developer with install issues (ERESOLVE, audit differences, hangs), direct them to that section and ensure they use `npm ci`.

---

## Build & Validation

Run in this order:

```bash
npm ci                 # Use npm ci for reproducible installs (not npm install)
npm run build          # Next.js webpack build (--webpack flag required; Turbopack is dev-only)
npm run lint           # ESLint
npm run test:unit      # Vitest unit tests
npm run test:integration  # Vitest integration tests
```

**Preconditions:**
- Node 22+ (`nvm use 22`).
- Copy `.env.example` → `.env`. Set `DATABASE_URL` (Supabase transaction pooler, port 6543), `DIRECT_URL` (Supabase direct connection, port 5432), and `AUTH_SECRET`. See `docs/DEV_SETUP_LIGHTWEIGHT.md` for the full walkthrough.
- Run `npm run dev:setup:cloud` for first-time setup (runs migrations via `DIRECT_URL`, creates admin user). No Docker required — Postgres runs on Supabase, email goes via Resend.
- **Docker alternative:** `npm run dev:up && npm run dev:setup` — see `.env.example` for the Docker connection strings.
- `npm run build` uses `--webpack` because `@ducanh2912/next-pwa` is incompatible with Turbopack.

Run `npm run test:unit` and `npm run lint` before every commit.

---

## Project Layout

```
app/
  [locale]/           # All pages are locale-prefixed (/en/, /es/)
    (auth)/           # Public auth pages (login, invite acceptance)
    (dashboard)/      # Protected pages — session guard in layout.tsx
    api/              # API routes (auth, invites, team, projects, etc.)
components/
  ui/                 # shadcn/ui primitives
  auth/               # LoginForm, InviteAcceptForm
  team/               # TeamDirectory, InviteModal
  shared/             # SkipLink, RouteAnnouncer, OfflineIndicator
lib/
  auth.ts             # NextAuth config (credentials provider, JWT)
  db.ts               # Prisma singleton (PrismaPg adapter)
  permissions.ts      # PERMISSIONS constants + ROLE_PERMISSIONS + hasPermission()
  email.ts            # Resend / Mailpit email
  validations/        # Zod schemas (auth.ts, invite.ts)
messages/
  en.json             # English translations
  es.json             # Spanish translations
i18n/
  navigation.ts       # Locale-aware Link, redirect, useRouter, usePathname
proxy.ts              # Route protection + next-intl middleware (NOT middleware.ts)
__tests__/
  unit/               # *.unit.test.ts
  integration/        # *.integration.test.ts
e2e/                  # Playwright end-to-end tests
prisma/
  schema.prisma       # Models: User, Account, Session, Invite
types/index.ts        # SessionUser, ApiError, ApiSuccess
```

---

## Conventions

- **TypeScript strict mode** — no `any`. Use `interface` for object shapes.
- **Service layer** — all API calls go through the service layer in `lib/`; never `fetch` directly from components.
- **i18n** — add every new UI string to both `messages/en.json` and `messages/es.json` under the appropriate namespace. Use `getTranslations` in Server Components, `useTranslations` in Client Components.
- **Locale-aware routing** — always use `Link`, `redirect`, `useRouter`, `usePathname` from `@/i18n/navigation`, never from `next/link` or `next/navigation`.
- **CSS** — use CSS variables from `app/globals.css`; no hardcoded hex or arbitrary pixel values.
- **Commit style**: `feat(area): description`, `fix(area): description`, `chore: description`.

---

## Testing

- Unit tests: `__tests__/unit/*.unit.test.ts`
- Integration tests: `__tests__/integration/*.integration.test.ts`
- E2E: `e2e/` with Playwright (`npm run test:e2e:local` for local, needs app running).
- Mock `lib/db` (Prisma) and `lib/auth` (`auth()`) in all unit and integration tests.
- Run `npm run test:unit` and `npm run lint` before every commit.

---

## Auth & Permissions

- Every API route must call `auth()` to get the session, then `hasPermission(session.user.role, PERMISSIONS.XXX)` before acting. Example:

  ```typescript
  const session = await auth();
  if (!session || !hasPermission(session.user.role, PERMISSIONS.VIEW_TEAM)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  ```

- Roles and permissions are defined in `lib/permissions.ts`. Never rely on client-side checks alone.
- `proxy.ts` handles redirect-only route protection; it does **not** grant access by itself. This project uses `proxy.ts` as its custom middleware entrypoint instead of the conventional `middleware.ts`.

---

## PR Workflow

- Branch from `dev` (not `main`). Naming: `feat/name`, `fix/description`, `hannah/feature`, `chore/description`.
- Before opening a PR: `npm run build && npm run lint && npm run test:unit` must all pass.
- All PRs target `dev`. Only `dev` → `main` promotions go to `main`, handled by Phil only.
- Use the PR template and add the correct label: `design`, `backend`, `dependencies`, `security`, or `chore`.
- When addressing review feedback, fix comments directly in code and push to the branch. Do not open multiple sub-PRs for the same review thread. When a code suggestion has a `suggestion` block, use "Commit suggestion" in the GitHub UI to apply it as a single commit.
- **Only Phil merges into `dev`.** Agents prepare PRs (CI green, all Copilot comments addressed, all threads resolved) and notify Phil via a PR comment and `AGENT_COLLAB.md`. See `docs/COPILOT_PR_WORKFLOW.md` for the full protocol.
- **When modifying `.github/workflows/ci.yml`:** The workflow must have a job named `lint-and-test` (branch protection requires it). See [docs/GITHUB_CI_MAINTENANCE.md](../docs/GITHUB_CI_MAINTENANCE.md).
- **GitHub Actions permissions:** The `cp-build-dev-ops` org has read/write workflow permissions and "Allow GitHub Actions to create and approve pull requests" enabled at the org level. Workflows do not require manual approval to run. Individual workflows declare their own `permissions:` blocks — do not remove them.
- **Agent authorization:** Agents acting on behalf of Phil are authorized to push to branches, run Railway CLI, run GitHub CLI, set Railway env vars (dev freely, production only when directed), and resolve review threads programmatically. See `.cursor/rules/git-pr-workflow.mdc` → "Agent Authorization" for the complete policy.
