# Deployment Guide — CP Build Command Center

**Environments:** Local → Dev → Prod

---

## 1. GitHub (Source of Truth)

### Create repo and push

```bash
# Create a new repo on GitHub: github.com/your-org/command-center-reboot
# Then:

git remote add origin https://github.com/YOUR_ORG/command-center-reboot.git

# Stage and commit everything
git add -A
git status   # Review before committing
git commit -m "Initial deployable state: auth, users, invites, projects, PWA"

git branch -M main
git push -u origin main
```

**Branch strategy (recommended):**
- `main` → deploys to **prod**
- `dev` → deploys to **dev** (or use Railway’s branch-based deploys)

---

## 2. Railway (Dev + Prod)

The project already has `railway.json` and `nixpacks.toml` configured.

### Option A: Two Railway projects (recommended)

| Project | Branch | Purpose |
|---------|--------|---------|
| `command-center-dev` | `dev` or `main` | Dev/staging |
| `command-center-prod` | `main` | Production |

### Setup steps

1. **Railway account:** [railway.app](https://railway.app) → Sign in with GitHub.

2. **Dev project**
   - New Project → Deploy from GitHub repo
   - Select `command-center-reboot`
   - Add **Postgres** plugin (or use external DB)
   - Add **service** for the app
   - Connect repo; set branch to `dev` if using a dev branch

3. **Prod project**
   - New Project → Deploy from GitHub repo
   - Same repo, branch `main`
   - Add Postgres (separate from dev)
   - Add service for the app

4. **Variables** (see section 3)

---

## 3. Environment Variables (Per Environment)

### Required for all deployments

| Variable | Dev | Prod | Notes |
|----------|-----|------|-------|
| `DATABASE_URL` | ✅ | ✅ | From Railway Postgres or external |
| `AUTH_SECRET` | ✅ | ✅ | `openssl rand -base64 32` — **different per env** |
| `NEXTAUTH_URL` | ✅ | ✅ | Full URL, e.g. `https://command-center-dev.up.railway.app` |
| `NODE_ENV` | `development` | `production` | Railway sets automatically |
| `APP_ENV` | `dev` | (unset) | Optional. DevTools also auto-enable when Railway env is \"development\"/\"dev\"/\"staging\" or branch is `dev`. |
| `DEV_BYPASS_AUTH` | ❌ | ❌ | **Never** `true` in deployed envs |

### Email (Resend)

| Variable | Dev (Railway) | Prod |
|----------|---------------|------|
| `RESEND_API_KEY` | ✅ Required | ✅ Required |
| `EMAIL_FROM` | ✅ Required | ✅ Required |

**Local dev** uses Mailpit (SMTP on localhost) — no Resend needed. **Railway dev** has no Mailpit, so invite emails require Resend to reach real inboxes.

**Setup (already done — for reference):**
- The team domain `cp-command-center.com` is verified in Resend (DNS records in Squarespace).
- `RESEND_API_KEY` and `EMAIL_FROM=CP Build <noreply@cp-command-center.com>` are set in Railway for both dev and production.
- In **dev**, `DEV_EMAIL_OVERRIDE` is set to the lead developer's inbox, redirecting all outgoing emails regardless of recipient. This avoids needing each developer to verify their own email address.
- For new environments or local dev: copy `RESEND_API_KEY` from Phil, set `EMAIL_FROM=CP Build <noreply@cp-command-center.com>`, and set `DEV_EMAIL_OVERRIDE` to your own email address.

### Unifier (if using real integration)

| Variable | Dev | Prod |
|----------|-----|------|
| `UNIFIER_BASE_URL` | ✅ | ✅ |
| `UNIFIER_USERNAME` | ✅ | ✅ |
| `UNIFIER_PASSWORD` or Azure Key Vault | ✅ | ✅ |
| `UNIFIER_MOCK` | Optional `true` | ❌ Never |

### Bootstrap admin (automated)

Set these in Railway Variables; bootstrap runs automatically on every deploy:

| Variable | Required | Notes |
|----------|----------|-------|
| `BOOTSTRAP_ADMIN_EMAIL` | ✅ | Your real email (e.g. `you@cpbuild.com`) |
| `BOOTSTRAP_ADMIN_PASSWORD` | ✅ | Strong password — **not** the placeholder |

The deploy start command runs `bootstrap:admin` before starting the app. On first run, it creates the admin user **only if no admin user exists yet** (idempotent — safe to rerun without creating duplicates). On subsequent deploys, if an admin user already exists, the script **does not** update that user's email or password, even if `BOOTSTRAP_ADMIN_EMAIL` or `BOOTSTRAP_ADMIN_PASSWORD` have changed in Railway Variables. There is currently **no automatic password rotation mechanism** via these variables; rotate the admin password using your normal user-management flow instead. If vars are missing or still placeholders, bootstrap is skipped — set real values and redeploy.


---

## 4. Database

### Railway Postgres (simplest)

- Add Postgres plugin to each project
- Railway sets `DATABASE_URL` automatically
- Run migrations: `npx prisma migrate deploy` (already in `railway.json` startCommand)

### External (Supabase / Neon)

- Create a project per environment
- Copy connection string → `DATABASE_URL`
- Run migrations manually or via deploy script

---

## 5. Troubleshooting: Healthcheck Failing

If the build succeeds but healthcheck fails ("service unavailable"):

1. **Check Deploy logs** in Railway → your service → Deployments → View logs. Look for errors during `prisma migrate deploy` or `npm run start`.

2. **DATABASE_URL not set** — Add Postgres: Project → "+ New" → "Database" → Postgres. Then add the variable to your **app service**: Variables → "+ New Variable" → `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (use your Postgres service name). Railway does not auto-inject it; you must reference it.

3. **Migrations failing** — If you see "Can't reach database server" or similar, the app can't reach Postgres. Ensure Postgres is in the same Railway project and the app service has `DATABASE_URL` (auto-injected when both are in the same project).

4. **Failed migration (P3009)** — If you see "migrate found failed migrations in the target database", run:
   ```bash
   DATABASE_URL="<your-railway-postgres-url>" npx prisma migrate resolve --rolled-back "20260223000000_project_rows_individual_columns"
   ```
   Then redeploy. The migration will run again.

4. **Port binding** — The start script uses `-H 0.0.0.0 -p ${PORT}` so the app listens on Railway's PORT. If you overrode the start command, ensure it uses `$PORT`.

---

## 6. Security Checklist

- [ ] `AUTH_SECRET` is unique per environment (32+ bytes)
- [ ] `DEV_BYPASS_AUTH` is unset or `false` in dev/prod
- [ ] `NEXTAUTH_URL` matches the deployed URL exactly (no trailing slash)
- [ ] Database URLs are not committed
- [ ] Resend / Unifier keys are in env vars only
- [ ] Rotate `BOOTSTRAP_ADMIN_PASSWORD` after first login

---

## 7. Quick Start (Today)

### Option A: Railway dashboard (easiest, ~5 min)

1. **Dev**
   - [railway.app](https://railway.app) → New Project → **Deploy from GitHub**
   - Select `cp-build-dev-ops/command-center-reboot`, branch `main`
   - Add **Postgres** (Variables → "+ New" → "Add Plugin" → Postgres)
   - In your app service → **Variables** → add:
     - `AUTH_SECRET` = `openssl rand -base64 32` (run locally)
     - `NEXTAUTH_URL` = your dev URL (e.g. `https://command-center-reboot-dev-production.up.railway.app` — get from Settings → Networking after deploy)
     - `RESEND_API_KEY` = from [resend.com](https://resend.com)
     - `EMAIL_FROM` = `CP Build <noreply@yourdomain.com>`
   - Deploy (automatic on first connect)

2. **Bootstrap admin** (after first deploy)
   ```bash
   # Get DATABASE_URL from Railway → Postgres → Connect → "Postgres Connection URL"
   DATABASE_URL="postgresql://..." \
   BOOTSTRAP_ADMIN_EMAIL=admin@yourdomain.com \
   BOOTSTRAP_ADMIN_PASSWORD="YourStrongPassword123!" \
   npm run bootstrap:admin
   ```

3. **Prod**
   - New Project → Deploy from GitHub → same repo, `main`
   - Add Postgres, set variables (different `AUTH_SECRET`, prod `NEXTAUTH_URL`)
   - Bootstrap admin, then invite first user

### Option B: Railway CLI

```bash
railway login   # One-time, opens browser
./scripts/deploy-railway.sh dev
# Set NEXTAUTH_URL, RESEND_API_KEY, EMAIL_FROM in dashboard
# Bootstrap admin with DATABASE_URL from Postgres
```

---

## 8. Branch Strategy

| Workflow | Branch | Deploys to |
|----------|--------|------------|
| Feature work | `feature/xyz` | — |
| Merge to dev | `dev` | Dev |
| Release | `main` | Prod |

Or: single `main` branch with Railway “preview” for dev.
