# DEV_NOTES — Command Center

Quick orientation for developers and AI agents picking up this codebase.

---

## Project Scope

**Command Center** is a standalone internal construction project management platform. It tracks projects, units, phases, and install teams. Integrates with Oracle Primavera Unifier (PDS API).

**No IHI or external dashboard references.** This project has no connection to IHI Tools or any other external dashboard. Do not introduce IHI or shared-database coordination when analyzing or describing this codebase.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, webpack build) |
| Language | TypeScript 5 strict mode |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| Auth | Auth.js v5 beta (next-auth), credentials provider, JWT strategy |
| Database | PostgreSQL via Prisma 7 + `@prisma/adapter-pg` |
| Email | Resend |
| Validation | Zod 4 (shared server + client) |
| PWA | @ducanh2912/next-pwa (webpack plugin, disabled in dev) |
| i18n | next-intl (English + Spanish, locale-prefixed routing `/en/`, `/es/`) |
| Testing | Vitest + React Testing Library + jsdom |

---

## Environment Parity

Use the same Node/npm versions and install flow so all developers get consistent behavior (no divergent ERESOLVE warnings, audit counts, or hangs).

### Required versions (from `package.json` engines)

| Tool | Version |
|------|---------|
| Node | `>=22.0.0` |
| npm | `>=10.0.0` |

**Recommended:** Use [nvm](https://github.com/nvm-sh/nvm) and run `nvm use` (or `nvm install 22` if needed).

### Install command

```bash
# First-time or after pulling dependency changes
npm ci
```

Use `npm ci` (not `npm install`) for reproducible installs. It uses `package-lock.json` exactly and fails if it’s out of sync with `package.json`.

If you add or change dependencies, run `npm install` to update the lockfile, then commit both `package.json` and `package-lock.json`.

### Project config (`.npmrc`)

The project includes `.npmrc` with `legacy-peer-deps=true` to suppress ERESOLVE peer dependency warnings (e.g. nodemailer / @auth/core). Do not override this in your global `~/.npmrc` for this project.

### Reference environment (Phil)

| Item | Value |
|------|-------|
| Node | v22.22.0 (via nvm) |
| npm | 10.9.4 |
| Project `.npmrc` | Yes (legacy-peer-deps, engine-strict) |
| Global `~/.npmrc` | None |
| Install command | `npm ci` |

### Troubleshooting

- **npm install hangs:** Stop the dev server and any file watchers, then retry. On macOS, `ENOTEMPTY` during install can occur if processes hold locks on `node_modules`.
- **ERESOLVE / peer dependency warnings:** Ensure you have the project `.npmrc` (with `legacy-peer-deps=true`). Do not override in `~/.npmrc`.
- **Different audit/vulnerability counts:** Use `npm ci` (not `npm install`) so both use the exact lockfile. Run `npm audit` after install to compare.

---

## Directory Structure

```
app/
  [locale]/                      # Locale segment (en, es) — all pages locale-prefixed
    (auth)/                      # Public auth pages — no session required
      login/                     # → /en/login
      invite/[token]/            # → /en/invite/<token>
    (dashboard)/                 # Protected dashboard — global sidebar + TopBar + MobileBottomNav
      page.tsx                   # Dashboard home → /en
      projects/                  # Projects list + mobile card view
      users/                     # User management
      settings/                  # User settings
      layout.tsx                 # Auth guard + SideNav + TopBar + MobileBottomNav
    (project)/                   # Project workspace — project-scoped sidebar + context bar
      projects/[id]/
        page.tsx                 # Project overview (stats, UPM link card)
        install/                 # Install Manager placeholder
        units/                   # Mobile unit card list + Unit Detail Modal
        sov/                     # Schedule of Values placeholder
        upm/                     # Unit Plan Matrix (full spreadsheet)
        layout.tsx               # ProjectTopBar + ProjectSideNav + ProjectMobileBottomNav
  api/
    auth/[...nextauth]/          # Auth.js handler
    invites/                     # CRUD + validate + accept + resend
    projects/                    # GET list, POST create
    projects/[id]/               # GET, PATCH, DELETE single project
    projects/[id]/units/         # GET all rows, POST add rows
    projects/[id]/units/[rowId]/ # PATCH (incl. scopeStage/scopeStatus), DELETE
    projects/[id]/units/bulk-delete/
    team/                        # GET list, PATCH role, DELETE member
    roles/                       # GET available roles
    lookups/                     # GET scope/location/cost/installer/uom types
    offline/preferences/         # GET/PUT offline settings per user
    offline/snapshot/            # GET offline data bundle
    health/                      # GET health check
    unifier/projects/            # Unifier PDS proxy
    devtools/                    # Dev-only routes (gated by isDevToolsAllowed)
      layout-issues/             # GET list, POST create
      layout-issues/[id]/        # PATCH (status/fix), DELETE

components/
  layout/
    SideNav.tsx                  # Global desktop sidebar (Dashboard, Projects, Users)
    TopBar.tsx                   # App bar — brand/title, LocaleSwitcher, Bell/avatar
    MobileBottomNav.tsx          # Mobile bottom nav (Dashboard, Projects, Users)
  projects/
    ProjectSideNav.tsx           # Project workspace desktop sidebar
    ProjectTopBar.tsx            # Blue context bar — project name + Back button
    ProjectMobileBottomNav.tsx   # Mobile bottom nav for project workspace (Overview/Units/SOV)
    ProjectsTable.tsx            # Desktop project table with sort/filter
    ProjectsPageClient.tsx       # Client wrapper — wires Add Project button to modal
    ProjectDetailView.tsx        # UPM full spreadsheet view (desktop)
    UnitCards.tsx                # Mobile unit cards + Unit Detail Modal + scope stage/status
    ProjectDocuments.tsx         # Unifier document listing
  devtools/
    DevToolsPanel.tsx            # Floating DevTools launcher + tab panel
    DevToolsPanelWrapper.tsx     # Client-only conditional render wrapper
    ViewportToggle.tsx           # Figma-style device viewport simulator
    SpacingEditor.tsx            # Live CSS token editor + layout issue tracker
    FrontendDebugger.tsx         # Network/performance diagnostics
  ui/                            # shadcn/ui primitives
  auth/                          # LoginForm, InviteAcceptForm
  team/                          # TeamDirectory, InviteModal
  shared/                        # SkipLink, RouteAnnouncer, OfflineIndicator, StatusBadge

lib/
  auth.ts                        # NextAuth config (credentials, JWT, trustHost)
  db.ts                          # Prisma singleton (PrismaPg adapter)
  permissions.ts                 # PERMISSIONS catalog + ROLE_PERMISSIONS + hasPermission()
  email.ts                       # Resend sendInviteEmail()
  projects.ts                    # Project type + constants (PROJECT_STATUSES, SEARCH_DEBOUNCE_MS)
  project-rows.ts                # mapRowToColumns(), rowKey(), insertProjectRows()
  upm-parse.ts                   # parseUPM(), parseUPMFromFile() — XLSX → ProjectRow[]
  devtools-env.ts                # isDevToolsAllowed(), DEVTOOLS_BLOCKED_MESSAGE
  devtools-auth.ts               # requireDevToolsAdmin() — server-side DevTools auth guard
  unifier/
    client.ts                    # Unifier PDS API client (fetchAllRows, pagination)
    service.ts                   # getProjects(), getProjectByPid(), mapUnifierStatus()
  validations/
    auth.ts                      # loginSchema, registerSchema, acceptInviteSchema
    invite.ts                    # createInviteSchema

prisma/
  schema.prisma                  # All models — see Database section below
  migrations/                    # 10 migration files — run in order by prisma migrate deploy

proxy.ts                         # Route protection middleware + next-intl locale routing
i18n/
  routing.ts / request.ts / navigation.ts
messages/
  en.json / es.json              # All UI strings — namespaced by feature

LAYOUT_RULES.md                  # CSS token reference + platform standards (agents: read this)
scripts/
  bootstrap-admin.ts             # One-time admin user creation
  deploy-railway.sh              # Railway deploy helper (dev|prod)

__tests__/
  unit/                          # Vitest isolated unit tests
  integration/                   # Vitest + mocked DB integration tests
e2e/                             # Playwright — smoke + authenticated flows
public/
  manifest.json                  # PWA manifest
  sw.js                          # Generated at build — gitignored
```

---

## Localization (i18n)

- **Locales**: English (`en`), Spanish (`es`). All routes are locale-prefixed: `/en/projects`, `/es/projects`.
- **Translation files**: `messages/en.json`, `messages/es.json`. Add new keys under namespaces (e.g. `projects.addRow`).
- **Usage**: Server Components use `getTranslations('namespace')`; Client Components use `useTranslations('namespace')`. Use `t('key')` for the string.
- **Navigation**: Use `Link`, `useRouter`, `usePathname` from `@/i18n/navigation` (not `next/link` or `next/navigation`) so links preserve locale.
- **Locale switcher**: `LocaleSwitcher` in TopBar and login page. Users can switch between EN/ES.

---

## Auth Model

- **Strategy**: JWT (stateless). Role is embedded in the JWT at sign-in.
- **Password hashing**: bcryptjs, 12 salt rounds.
- **Session**: `session.user` includes `id`, `email`, `name`, `role`.
- **Server-side enforcement**: Every API route and server action calls `auth()` then `hasPermission()`. The middleware (`proxy.ts`) handles redirect-only — it does NOT grant access by itself.

### Authentication and email (deployed environments)

- **Passwords are never in the repository.** Agents and docs must not infer production credentials from git. Use your password manager, **Forgot password** (when email works), `scripts/bootstrap-admin.ts` / DB access for recovery, or another admin.
- **Local dev bypass:** `DEV_BYPASS_AUTH=true` (with `NODE_ENV !== "production"`) uses `getSession()` in `lib/dev-session.ts`. Set **`DEV_BYPASS_USER_EMAIL`** to your real local user’s email (e.g. the admin you bootstrapped or invited) so the session **`id` matches the database** — otherwise the default is synthetic `dev-user`, which breaks anything keyed by user id (feedback assignee, “My items”, some notifications). Per-browser override: `/api/dev-switch-user?email=…` (cookie wins over `DEV_BYPASS_USER_EMAIL`). **Production and Railway `development` use real Auth.js** — no bypass unless you explicitly mirror those vars (not recommended on shared dev).
- **Forgot-password and invite links** depend on **`NEXTAUTH_URL`** matching the environment’s public URL (no trailing slash issues — app normalizes). Wrong `NEXTAUTH_URL` → reset links point at the wrong host.
- **Email transport** (`lib/email.ts`):
  - **Production (typical):** Set **`RESEND_API_KEY`** to a real key, leave **`SMTP_HOST` unset**, set **`EMAIL_FROM`** (e.g. `CP Build <noreply@yourdomain>`). Optional: **`DEV_EMAIL_OVERRIDE`** is ignored when `NODE_ENV === "production"` and `APP_ENV` is not `dev`.
  - **Dev with Mailpit:** Set **`SMTP_HOST=localhost`**, **`SMTP_PORT=1025`** (or use compose defaults); use **`SMTP_UI_PORT`** (default 8025) for the Mailpit inbox URL in logs.
  - **Troubleshooting “no reset email” on Railway:** Confirm `RESEND_API_KEY` is not a placeholder, domain sending is verified in Resend, `EMAIL_FROM` is allowed for that domain, and `NEXTAUTH_URL` is the Railway **production** or **development** service URL. Check application logs for `[email] Resend send failed`.

---

## Roles & Permissions

Defined in `lib/permissions.ts`:

| Permission | ADMIN | MEMBER |
|---|---|---|
| `invite:member` | ✓ | — |
| `view:team` | ✓ | ✓ |
| `manage:roles` | ✓ | — |
| `remove:member` | ✓ | — |

Always call `hasPermission(session.user.role, PERMISSIONS.XXX)` on the server before acting.

---

## Database

Prisma 7 requires a driver adapter — we use `PrismaPg` from `@prisma/adapter-pg`.

```typescript
// lib/db.ts pattern
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
```

After schema changes, run:
```bash
npm run db:migrate   # creates and applies a migration
npm run db:generate  # regenerates Prisma client types
```

---

## Local Dev Setup

### Prerequisites

- **Node 22+** (`nvm install 22 && nvm use 22`)
- **Docker Desktop** (for PostgreSQL + Mailpit) — or use the **lightweight setup** (no Docker) for MacBook Air / underpowered machines: see [docs/DEV_SETUP_LIGHTWEIGHT.md](docs/DEV_SETUP_LIGHTWEIGHT.md)

### First-time setup (run once)

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and edit if needed (defaults work out of the box)
cp .env.example .env
# Optional: update AUTH_SECRET with a real value:
#   openssl rand -base64 32   → paste into .env

# 3. Start PostgreSQL + Mailpit, run migrations, create admin user
npm run dev:setup

# 4. Start the Next.js dev server
npm run dev
```

That's it. Open http://localhost:3002 and sign in with the credentials printed by `dev:setup`.

### What `npm run dev:setup` does

```
[1/4] Docker        → docker compose up -d  (starts postgres + mailpit)
[2/4] PostgreSQL    → waits for port 5432 to accept connections
[3/4] Migrations    → prisma migrate deploy (or db push for first run)
[4/4] Admin user    → npm run bootstrap:admin (skips if already exists)
```

### Daily workflow

```bash
npm run dev:up      # start containers if they stopped
npm run dev:start   # detached dev server (recommended — survives terminal close)
# OR npm run dev    # foreground in your own terminal (fine for interactive work)
npm run dev:status  # health check + log tail if down
npm run dev:kill    # stop server on :3002
```

### Dev server keeps dying? (common causes)

| Symptom | Cause | Fix |
|--------|--------|-----|
| Agent said it started the server but browser can't connect | Cursor shell ended → `npm run dev &` was killed | Use **`npm run dev:start`** (daemon). Agents must never use bare `&`. |
| Server stopped after heavy RAM use | `npm run dev:guarded` memory guardian killed it on critical pressure | Check `.guardian.log`, wait for RAM to settle, **`npm run dev:restart`** |
| Port in use / zombie process | Stale Next.js on :3002 | **`npm run dev:kill`** then **`npm run dev:start`** |

Log file: `/tmp/command-center-dev-server.log` · Pid file: `.dev-server.pid` (gitignored)

**Cursor agents:** see `.cursor/rules/session-context.mdc` → Starting the Dev Server.

### Lightweight setup (no Docker)

For MacBook Air or underpowered machines, use cloud Postgres + Resend instead of Docker:

```bash
# 1. Create free Supabase/Neon project, get DATABASE_URL
# 2. cp .env.example .env — set DATABASE_URL (cloud), RESEND_API_KEY, unset SMTP_HOST
# 3. npm run dev:setup:cloud
# 4. npm run dev
```

See [docs/DEV_SETUP_LIGHTWEIGHT.md](docs/DEV_SETUP_LIGHTWEIGHT.md) for full setup.

### Local services

| Service | URL | Notes |
|---|---|---|
| Next.js app | http://localhost:3002 | `npm run dev` |
| Mailpit (email UI) | http://localhost:8025 | all emails captured here |
| PostgreSQL | localhost:5432 | user: postgres / pass: postgres / db: commandcenter |

### Ngrok (public URL for local dev)

For phone testing, OAuth callbacks, or webhooks to your laptop. The dev server uses **port 3002**.

1. Install [ngrok](https://ngrok.com/download) (or `brew install ngrok/ngrok/ngrok`). One-time: `ngrok config add-authtoken <token>` from the ngrok dashboard.
2. Terminal A: `git pull origin dev` then `npm run dev`.
3. Terminal B: `npm run tunnel` (same as `ngrok http 3002`). Copy the **https** forwarding URL.
4. In `.env`, set `NEXTAUTH_URL` to that origin (no trailing slash) and keep `AUTH_TRUST_HOST="true"`. Restart `npm run dev`.

Open `https://<your-subdomain>.ngrok-free.app/en` (locale prefix required). Free tunnels may show ngrok’s interstitial on first load.

### Email in development

Emails are **never** sent externally in dev. Any email the app tries to send (e.g. invite emails) is caught by Mailpit and visible at http://localhost:8025.

The transport is selected automatically:
- `SMTP_HOST` is set in `.env` → uses Mailpit SMTP on localhost:1025
- `RESEND_API_KEY` is a placeholder (`re_YOUR_...`) → also falls back to Mailpit
- `RESEND_API_KEY` is a real key AND `SMTP_HOST` is unset → uses Resend (production mode)

```bash
npm run dev:mail   # shortcut: opens http://localhost:8025
```

### Other dev lifecycle commands

`npm run dev` only runs `next dev` (after `check:dev`). It does **not** start Docker, touch volumes, or run any reset.

```bash
npm run dev:down   # stop containers (data preserved)
npm run dev:db     # Postgres only (skip Mailpit)
npm run dev:logs   # tail Docker logs (postgres + mailpit)
# Fresh DB (intentionally manual): docker compose down -v && npm run dev:setup
npm run db:studio:kill  # Stop Studio on :5555 / :5556 / :5557
npm run db:studio:check # Hosts/refs for all three ports (no secrets)
npm run db:studio:prove # Row counts for .env DATABASE_URL (fingerprint)
npm run db:studio       # Local — .env — http://localhost:5555
npm run db:studio:dev   # Railway dev — .env.dev.local — http://localhost:5556
npm run db:studio:prod  # Railway prod — .env.prod.local — http://localhost:5557
npm run db:studio:all   # Start local + dev + prod Studio together
npm run db:migrate      # create a new migration (after schema changes)
```

### Prisma Studio — local, Railway dev, Railway prod (three ports)

| Port | Command | Config file | Database |
|------|---------|-------------|----------|
| **5555** | `npm run db:studio` | `.env` | Local Supabase (same as `npm run dev`) |
| **5556** | `npm run db:studio:dev` | `.env.dev.local` | Railway **dev** Postgres (`DATABASE_PUBLIC_URL`) |
| **5557** | `npm run db:studio:prod` | `.env.prod.local` | Railway **prod** Postgres (`DATABASE_PUBLIC_URL`) |

`npm run db:studio:all` starts all three. Each script passes `--url` explicitly — never bare `npx prisma studio`.

#### One-time: `.env.dev.local` and `.env.prod.local`

Use Railway **`DATABASE_PUBLIC_URL`** from the Postgres service (`*.proxy.rlwy.net`). Internal `postgres.railway.internal` URLs do not work from your laptop.

```bash
cp .env.dev.local.example .env.dev.local
cp .env.prod.local.example .env.prod.local
# Dev (CLI linked to dev):  railway variables -s Postgres --json | jq -r .DATABASE_PUBLIC_URL
# Prod:                    railway variables -e production -s Postgres --json | jq -r .DATABASE_PUBLIC_URL
# Paste each as DATABASE_URL= in the matching file.

npm run db:studio:check
npm run db:studio:all
```

**Local `.env`** is your personal Supabase sandbox — it is not Railway dev and not prod.

#### Stale Studio on :5555 showing the wrong project count

**Symptom:** Local app shows ~8 projects; Prisma Studio on http://localhost:5555 shows 40+ (looks like production).

**Cause:** An old `prisma studio` process started **without** `--url` (e.g. bare `npx prisma studio --port 5555`). It keeps the `DATABASE_URL` from when that process was first started, which may be an old prod or shared URL. Editing `.env` later does **not** update a running Studio.

**Fix:**

```bash
npm run db:studio:kill
npm run db:studio
```

The start script prints `Active projects in this DB: N` — that **N** must match your local app. It also passes `--url` from `.env` explicitly.

**Do not use** bare `npx prisma studio` for this project. Always:

- `npm run db:studio` — local `.env` → **:5555**
- `npm run db:studio:dev` — `.env.dev.local` → **:5556** (Railway dev `DATABASE_PUBLIC_URL`)
- `npm run db:studio:prod` — `.env.prod.local` → **:5557**
- `npm run db:studio:all` — all three in background

If Studio still looks wrong after kill + restart, run `npm run db:studio:prove` and compare the project count to the terminal line when Studio starts.

---

## Build & CI

```bash
npm run build         # Next.js production build (webpack, generates sw.js)
npm run lint          # ESLint (ignores public/sw.js and workbox files)
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright end-to-end tests (needs BASE_URL set)
npm run test:smoke    # Alias: smoke tests only (needs BASE_URL set)
npm run promote       # Full deploy pipeline: dev → verify → prod
```

**Important**: Both dev and production use `--webpack`. The `@ducanh2912/next-pwa` plugin requires webpack and is incompatible with Turbopack. `npm run dev:turbo` is available as an opt-in alternative for faster iteration _without_ PWA — do not use it for PWA-related work.

**Webpack cache auto-clear**: `npm run dev` always deletes `.next/cache/webpack` before starting. This prevents the recurring "Router action dispatched before initialization" / "stale webpack" error that appears when the incremental cache drifts out of sync across dev sessions. Only the cache subdirectory is removed — the rest of `.next/` is preserved — so startup is ~10 s slower than a warm restart but nothing like a full cold rebuild. If you ever see the stale-webpack error, it means the server was started without `npm run dev` (e.g. via a bare `next dev` command); use `npm run dev` instead.

---

## Deployment (Railway + Supabase)

### Architecture

| Environment | App | Database |
|---|---|---|
| Development | Railway `development` environment | Supabase project: `commandcenter-dev` |
| Production | Railway `production` environment | Supabase project: `commandcenter-prod` |

**Field media capture metadata:** set `GOOGLE_GEOCODING_API_KEY` on Railway dev + prod for project-site distance (cached per project). Local dev works without it — client GPS/device metadata still saves; geocode distance and watermark proximity lines are omitted until the key is set.

### One-time setup

#### 1. Supabase (two databases)

1. Go to [supabase.com](https://supabase.com) and create two projects:
   - `commandcenter-dev`
   - `commandcenter-prod`
2. For each project: **Settings → Database → Connection string → URI** — copy the `postgresql://...` connection string
3. Keep both strings handy for the Railway env var step below

#### 2. Railway

1. Install the Railway CLI:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. Create a new Railway project:
   ```bash
   railway init
   # Choose "Empty project", name it "command-center"
   ```

3. Link your local directory:
   ```bash
   railway link
   # Select the project you just created
   ```

4. Create two environments in the Railway dashboard:
   - **Settings → Environments → New Environment** → name it `development`
   - **Settings → Environments → New Environment** → name it `production`

5. Set environment variables for each environment in Railway dashboard
   (**Variables** tab, switch environment at the top):

   For **development**:
   ```
   DATABASE_URL          = <Supabase dev connection string>
   AUTH_SECRET           = <openssl rand -base64 32>
   NEXTAUTH_URL          = https://your-service-dev.up.railway.app
   RESEND_API_KEY        = re_...
   EMAIL_FROM            = Command Center <noreply@yourdomain.com>
   BOOTSTRAP_ADMIN_EMAIL = admin@yourdomain.com
   BOOTSTRAP_ADMIN_PASSWORD = <strong password>
   PORT                  = 3000
   ```

   For **production** (same keys, different values):
   ```
   DATABASE_URL          = <Supabase prod connection string>
   AUTH_SECRET           = <different random string>
   NEXTAUTH_URL          = https://your-service.up.railway.app
   # ... etc
   ```

6. Get your service domain from **Railway dashboard → your service → Settings → Networking → Generate Domain** for each environment. You'll need the `development` domain now.

7. Create `.env.deploy` (gitignored — never committed):
   ```bash
   cp .env.deploy.example .env.deploy
   # Edit .env.deploy and fill in RAILWAY_DEV_URL and RAILWAY_PROD_URL
   ```

8. Install Playwright browser:
   ```bash
   npm run test:e2e:install
   ```

9. Bootstrap the admin user for each environment:
   ```bash
   # Bootstrap dev (run once after first Railway deploy)
   BOOTSTRAP_ADMIN_EMAIL=admin@dev.example.com \
   BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123! \
   DATABASE_URL="<supabase-dev-url>" \
   npm run bootstrap:admin

   # Bootstrap prod (after first production deploy)
   BOOTSTRAP_ADMIN_EMAIL=admin@prod.example.com \
   BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123! \
   DATABASE_URL="<supabase-prod-url>" \
   npm run bootstrap:admin
   ```

### Promote pipeline (`npm run promote`)

Once set up, the full deploy flow is a single command:

```bash
npm run promote
```

This runs the following steps automatically:

```
[1/10] Pre-flight checks          (Railway CLI, Playwright, curl)
[2/10] Unit tests                 (Vitest — must pass to proceed)
[3/10] Production build           (Next.js webpack build)
[4/10] Deploy → development       (railway up --environment development)
[5/10] Wait for dev health        (polls /api/health every 5s, up to 3 min)
[6/10] Smoke tests on dev         (Playwright — opens browser automatically)
[7/10] ★ MANUAL GATE ★           (YOU type y/N in terminal)
[8/10] Deploy → production        (railway up --environment production)
[9/10] Wait for prod health       (polls /api/health)
[10/10] Smoke tests on prod       (Playwright — opens browser automatically)
```

The script exits non-zero if any step fails, so it's safe to run in loops.

### Database migrations

Migrations run automatically as part of the Railway start command (`prisma migrate deploy && npm run start`). `prisma migrate deploy` is idempotent — it only applies unapplied migrations.

To create a new migration locally:
```bash
npm run db:migrate    # prisma migrate dev (interactive, creates migration file)
git add prisma/migrations
git commit -m "migration: <description>"
```

The next `npm run promote` will apply the migration to dev, then (after approval) to prod.

---

## PWA

- Manifest: `public/manifest.json`
- Service worker: generated at build time into `public/sw.js`
- Offline indicator: `components/shared/OfflineIndicator.tsx` — `aria-live="assertive"`
- Add 192×192 and 512×512 PNG icons to `public/icons/` before first deployment

---

## Accessibility

- `<SkipLink>` — first child of `<body>`, links to `#main-content`
- `<RouteAnnouncer>` — moves focus to `h1` on route change
- `<Toaster>` (Sonner) — for toast notifications
- `<OfflineIndicator>` — `aria-live="assertive"` when offline
- All form fields use `aria-describedby` for error IDs and `aria-invalid` for invalid state
- shadcn/ui components are built on Radix (keyboard + screen reader accessible by default)

---

## DevTools in Production

DevTools (Data Visualizer, diagnostics) are normally blocked when `RAILWAY_ENVIRONMENT_NAME=production`. To enable them for admin use in production, set:

```
DEVTOOLS_ENABLED=true   # Railway production variables
```

An authenticated ADMIN session is still required (`requireDevToolsAdmin()` guard unchanged).

---

## Agent Context Layer

`docs/agent-context/` contains 7 structured reference files for AI agents. Agents should load these instead of scanning raw source files to reduce token usage:

| File | Covers |
|------|--------|
| `project-overview.md` | Product, users, workflows, terminology |
| `architecture.md` | Stack, route groups, auth flow, caveats |
| `database-schema.md` | All 18 models, enums, relationships |
| `backend-patterns.md` | API route anatomy, validation, error handling |
| `frontend-patterns.md` | Components, tokens, i18n, a11y |
| `api-endpoints.md` | Every endpoint with inputs/outputs |
| `key-services.md` | lib/ utilities with usage examples |

`.cursor/rules/agent-context.mdc` tells agents which files to load per task type.

---

## Known Caveats

1. **`@auth/prisma-adapter` version skew**: `@auth/prisma-adapter` pulls `@auth/core` 0.41.1 while `next-auth` bundles 0.41.0. The `PrismaAdapter` is cast to `any` in `lib/auth.ts` to bypass the TS incompatibility. Runtime behavior is identical.
2. **Prisma 7 adapter-required**: Unlike Prisma 5/6, the `PrismaClient` constructor _requires_ an adapter or Accelerate URL. No direct connection string in `schema.prisma`.
3. **JWT augmentation**: Auth.js v5 module augmentation for `next-auth/jwt` is unreliable — we use bracket notation (`token["role"]`) in JWT callbacks as a workaround.
4. **`proxy.ts` not `middleware.ts`**: Next.js 16 renamed the middleware entry point from `middleware.ts` to `proxy.ts`. If you know Next.js ≤15, `proxy.ts` _is_ the new `middleware.ts` — same role, same file structure, just renamed.
5. **`AUTH_TRUST_HOST` is required on Railway/Vercel**: `lib/auth.ts` sets `trustHost: process.env.AUTH_TRUST_HOST === "true"`. This env var must be set to `"true"` on deployed environments; it is not set automatically. Without it, Auth.js will reject sessions from proxy IPs.

---

## Figma Make Prototype Reference

The UI/UX design is prototyped by Hannah in **Figma Make** and pushed to a separate GitHub repository:

```
github.com/cp-build-dev/Commandcenterreboot
```

This repo is **reference only** — it is a Vite/React prototype with mock data. Our production app (this repo) implements the same UI but wired to a real backend.

### When Hannah Pushes a New Session

```bash
# 1. Pull the latest prototype
gh repo clone cp-build-dev/Commandcenterreboot /tmp/prototype-ref -- --depth=1

# 2. Read the changelog (find the new session at the bottom)
cat /tmp/prototype-ref/DEVELOPMENT_LOG.md

# 3. Review any new components or token changes
cat /tmp/prototype-ref/DESIGN_SYSTEM.md
cat /tmp/prototype-ref/COMPONENT_LIBRARY.md
```

Then compare with our implementation, create a plan, and implement — wiring new UI to real backend instead of mock data.

### Key Prototype Docs

| File | Purpose |
|------|---------|
| `DEVELOPMENT_LOG.md` | **Read first.** Session-by-session changelog |
| `DESIGN_SYSTEM.md` | Color, typography, spacing, component patterns |
| `DESIGN_TOKENS_REFERENCE.md` | Quick CSS variable cheat sheet |
| `COMPONENT_LIBRARY.md` | Component ASCII diagrams + code examples |
| `PRODUCTION_READINESS_GUIDE.md` | DB schema, API patterns, auth, deployment |

### Prototype Session History

| Session | Date | Summary |
|---------|------|---------|
| Session 1 | 2026-02-19 | Design system v0.1, navigation, dashboard (6 cards), projects data table, StatusBadge |
| Session 2 | 2026-02-19 | Layout component, StatusBadge extracted, ARIA labels, centralized types |
| Session 3 | 2026-02-19 | Focus-visible CSS, useDebounce hook, keyboard nav, 100% token coverage |
| Session 4 | 2026-02-19 | API service layer, relational types, loading/error states, 9-file documentation package |
| Session 5 | 2026-02-25–03-03 | Mobile-first overhaul: project workspace layout (`(project)/` route group), mobile bottom navs, DevTools viewport simulator + SpacingEditor with layout issue DB, mobile project cards, unit cards + Unit Detail Modal, inline ScopeStage/ScopeStatus controls, ProjectTopBar redesign, SOV + Units placeholder pages, 3 new Railway migration files |

### Master Project Doc

See **`PROJECT_TRACKER.md`** at the project root for the full handoff document: what's implemented, what's pending, key file map, and sync checklist.
