# Architectural Decision Log

This log records significant architectural and design decisions made in this project. Each entry explains the context (why the decision was needed), the decision itself, and its consequences. This prevents the same questions from being re-litigated and gives new contributors instant context.

**Format:** Decisions are numbered sequentially. Status: `Decided` | `Superseded by ADR-NNN` | `Reversed`.

When you make a new architectural decision, add an entry here in the same PR that implements it. If the decision was made without a formal PR, add it retrospectively with the approximate date.

---

## ADR-001 — No Interactive Prisma Transactions (PgBouncer Incompatibility)

**Date:** 2026-02-25  
**Status:** Decided  
**PRs:** #96, #107

**Context:**  
Railway's internal Postgres runs behind PgBouncer in transaction pooling mode. Prisma's interactive transactions (`$transaction(async tx => {})`) require a persistent stateful connection across the duration of the transaction. PgBouncer releases the connection back to the pool between statements, breaking this assumption.

**Decision:**  
Never use `$transaction(async tx => {})` anywhere in this codebase.

Instead:
- **Multiple independent writes:** Use sequential `db.X()` calls
- **Writes that need a rollback on failure:** Use sequential calls with a compensating operation (delete/update) in the `catch` block
- **Stateless batch operations:** Array-form `$transaction([op1, op2])` is safe — each op is a single statement

See `app/api/projects/route.ts` for the canonical pattern (create project → insert rows → compensating delete if rows fail).

**Consequences:**  
- No true ACID atomicity. Partial failures leave orphan records that must be cleaned up manually or via compensating logic.
- Code is more verbose but is production-safe on Railway.
- The `TxClient` type in `lib/project-rows.ts` accepts both `db` and a tx client — always pass `db`.

---

## ADR-002 — Locale-Prefixed Routing with next-intl

**Date:** 2026-02-18 (initial setup)  
**Status:** Decided

**Context:**  
The app must support English and Spanish. We needed a routing strategy that is native to Next.js App Router and supports SSR-friendly locale switching.

**Decision:**  
Use `next-intl` with locale-prefixed routing (`/en/...`, `/es/...`). All pages live under `app/[locale]/`. Locale routing and middleware are handled in `proxy.ts` (not the conventional `middleware.ts` — see ADR-003).

Import `Link`, `redirect`, `useRouter`, `usePathname` exclusively from `@/i18n/navigation`, which wraps `next/link`/`next/navigation` with locale awareness.

**Consequences:**  
- Every new page must be created under `app/[locale]/`
- Every new UI string must be added to both `messages/en.json` and `messages/es.json`
- Server Components use `getTranslations()`, Client Components use `useTranslations()`
- Navigation utilities must be imported from `@/i18n/navigation`, never `next/*` directly

---

## ADR-003 — `proxy.ts` as the Middleware Entrypoint

**Date:** 2026-02-18 (initial setup)  
**Status:** Decided

**Context:**  
Next.js conventionally uses `middleware.ts` for middleware. This project needed both next-intl locale routing and auth-based route protection in the same middleware file. The file was named `proxy.ts` during initial setup.

**Decision:**  
Keep `proxy.ts` as the middleware entrypoint. Do not rename it to `middleware.ts`. This is a known and intentional deviation from Next.js convention.

**Consequences:**  
- New contributors must be told explicitly — Copilot and ESLint will sometimes suggest renaming it
- Add to `copilot-instructions.md` and `base-pack.md` so reviewers know not to flag it

---

## ADR-004 — Railway for Hosting, PgBouncer Connection Pooling

**Date:** 2026-02-18 (initial setup)  
**Status:** Decided

**Context:**  
We needed a managed PaaS that could host a Next.js app and Postgres together. Railway was chosen for its simplicity and Git-triggered deployments.

**Decision:**  
Host on Railway. Use Railway's internal Postgres (not an external DB). Accept PgBouncer in transaction pooling mode as the connection pool.

Build config: `nixpacks.toml` with `npm run db:deploy && npm start` as the start command (migrations auto-apply on every deployment).

**Consequences:**  
- PgBouncer constraint (see ADR-001)
- `DATABASE_URL` must use Railway's internal hostname for low-latency
- Migrations always run on startup — keep them idempotent
- `RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_GIT_BRANCH` are available to detect environment in server code

---

## ADR-005 — Resend for Transactional Email (Mailpit Locally)

**Date:** 2026-02-20  
**Status:** Decided  
**PR:** #95 (email deliverability hardening)

**Context:**  
The app sends invite emails. We needed a reliable transactional email provider for production and a local SMTP server for development.

**Decision:**  
- Production: Resend (`lib/email.ts` sends via Resend API)
- Local dev: Mailpit (runs via Docker, catches all outbound email for inspection)
- Dev/staging: `DEV_EMAIL_OVERRIDE` env var redirects all outbound email to a test address; guarded by `isNonProd()` which checks both `NODE_ENV` and `APP_ENV`

**Consequences:**  
- `FROM_EMAIL` must be a verified Resend domain address
- `DEV_EMAIL_OVERRIDE` must never be set in production — the guard is in code but defense-in-depth means also not setting the var
- Never log full email addresses — use `maskEmail()` everywhere

---

## ADR-006 — PrismaPg Driver Adapter

**Date:** 2026-02-18 (initial setup)  
**Status:** Decided

**Context:**  
Prisma 5.4+ supports a driver adapter layer (`@prisma/adapter-pg`) that routes queries through a dedicated Postgres driver. This is required for some connection pooling configurations.

**Decision:**  
Use the `PrismaPg` adapter in `lib/db.ts`. This is required for the Railway/PgBouncer setup.

**Consequences:**  
- The `db` client initialization in `lib/db.ts` is slightly different from a vanilla Prisma setup
- New contributors following Prisma docs should use `lib/db.ts` as the reference, not external examples
- Array-form transactions (`$transaction([...])`) work; interactive transactions do not (see ADR-001)

---

## ADR-007 — Raw SQL Bulk Insert for `project_rows`

**Date:** 2026-02-23  
**Status:** Decided  
**File:** `lib/project-rows.ts`

**Context:**  
UPM (Unit Plan Matrix) imports can involve 2,000–5,000 rows at once. Prisma's `createMany` does not support `RETURNING` and has per-row overhead. A raw parameterized INSERT batched by 500 is significantly faster.

**Decision:**  
Use `db.$executeRawUnsafe()` for bulk inserts in `lib/project-rows.ts`. The function accepts either `db` or a Prisma transaction client (`TxClient`), though in practice always pass `db` directly (see ADR-001).

Rows are inserted in batches of 500 to stay within Postgres parameter limits.

**Consequences:**  
- Column list in the raw SQL must exactly match the `project_rows` table schema — they are not type-checked by Prisma
- Migrations that add/rename columns in `project_rows` must also update `lib/project-rows.ts`
- `createdAt` and `updatedAt` are explicitly set to `NOW()` in the INSERT (migration ADR-008 added these columns)

---

## ADR-008 — `project_rows` Timestamps Added via Migration

**Date:** 2026-02-27  
**Status:** Decided  
**PR:** #108

**Context:**  
The `project_rows` table was created in migration `20260223000000` without `createdAt` or `updatedAt` columns. The Prisma schema declared them, and `lib/project-rows.ts` included them in every raw INSERT. This caused `column "createdAt" does not exist` errors on Railway.

**Decision:**  
Added migration `20260227000000_project_rows_timestamps` to backfill these columns with `DEFAULT CURRENT_TIMESTAMP`.

**Consequences:**  
- All existing rows have `createdAt = updatedAt = migration-run-time`
- Future `project_rows` migrations must include these columns if recreating the table
- The mismatch between Prisma schema and actual DB is now resolved

---

## ADR-009 — UPM Empty Row Detection by Identity Fields

**Date:** 2026-02-28  
**Status:** Decided  
**PR:** #110

**Context:**  
Field Tracker Excel spreadsheets have template filler rows at the end — rows with no unit data but with `0` pre-filled in numeric columns (Area, Ship Phase). The original "all cells empty" check let these through, inserting hundreds of blank rows into the database on every import.

**Decision:**  
A UPM row is considered "empty" (and excluded) when **Building, Level, and Unit are all blank**. These three fields uniquely identify a unit — no other columns affect this decision.

Applied in both:
- `lib/upm-parse.ts` (client-side, so preview count is accurate)
- `app/api/projects/route.ts` (server-side, as defence-in-depth)

**Consequences:**  
- Rows with data in any of Building/Level/Unit are always kept, even if all other fields are blank
- Template filler rows (numeric columns only, no identity) are excluded
- The preview row count shown in the modal accurately reflects what will be inserted

---

## ADR-010 — DevTools Behind `isDevToolsAllowed()` Flag

**Date:** 2026-02-22  
**Status:** Decided

**Context:**  
The app has a developer tools panel (test runner, server logs, coverage report, schema diff, etc.). These features are inappropriate for production or non-admin users.

**Decision:**  
All DevTools endpoints check `isDevToolsAllowed()` from `lib/devtools-env.ts`. This returns `true` only when:
- `APP_ENV` is not `production`, OR  
- The request is from an authenticated user with the `ADMIN` role on a non-Railway environment

The test runner additionally checks `isDeployedEnvironment()` and returns an explanatory SSE message if run on Railway, since running tests on a deployed server makes no sense.

**Consequences:**  
- DevTools endpoints are always present in the bundle (for SSE connectivity) but gate access via auth
- On Railway dev environment, DevTools panel is accessible to admins
- On Railway production environment, DevTools are disabled entirely

---

## Adding a New Decision

Copy this template and add your entry above this section:

```markdown
## ADR-NNN — Short Title

**Date:** YYYY-MM-DD  
**Status:** Decided  
**PRs:** #N (if applicable)

**Context:**  
Why this decision was needed.

**Decision:**  
What was decided, and what alternatives were rejected.

**Consequences:**  
What this means for future development. Include trade-offs.
```

---

## ADR-011 — Supabase as Default Local Dev Database (Replacing Docker)

**Date:** 2026-02-25  
**Status:** Decided  
**PR:** chore/supabase-dev-default

**Context:**  
The original dev setup used Docker Compose (PostgreSQL + Mailpit) running locally. This worked but required Docker Desktop, consumed significant CPU/RAM (problematic on MacBook Airs), and added friction for new developers (Hannah joining as first external dev). Railway's production Postgres also runs behind PgBouncer, so local Docker didn't replicate the production constraint anyway.

**Decision:**  
Switch the **default** local dev setup to Supabase free tier + Resend:
- `DATABASE_URL` → Supabase **transaction pooler** (port 6543) — matches Railway's PgBouncer behavior in dev
- `DIRECT_URL` → Supabase **direct connection** (port 5432) — used exclusively by `prisma migrate deploy` / `prisma migrate dev`
- Email: Resend (same provider as production) with `DEV_EMAIL_OVERRIDE` to redirect to personal inbox
- Docker Compose kept as an optional alternative (still documented in `.env.example`)

The Prisma `datasource` block now declares both `url` and `directUrl`, enabling Prisma to use the pooled connection for runtime queries and the direct connection for DDL migrations automatically.

Alternatives rejected:
- **Neon**: Similar to Supabase but less familiar and slightly more complex auth for new devs.
- **Keep Docker**: Too heavy for the team's current machines; doesn't replicate PgBouncer constraint.

**Consequences:**  
- New devs need a free Supabase account (5-minute setup) instead of Docker Desktop.
- `DIRECT_URL` must be set when using Supabase — if absent, `prisma migrate dev` / `prisma migrate deploy` will use the pooler and may fail with PgBouncer incompatibility errors during DDL. Railway and Docker setups do not require it (no PgBouncer in those environments).
- `dev:setup:cloud` is now the primary setup command; `dev:setup` (Docker) is the secondary.
- Local dev now runs through PgBouncer (pooler) just like Railway, making the "interactive transactions are banned" rule easier to catch early.
