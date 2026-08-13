# Deployment Quickstart — Your Action Checklist

Direct path to get the dev → verify → prod workflow running.

---

## Phase 1 — Done ✓

- [x] `dev` branch created and pushed
- [x] Branch protection on `dev` (same as `main`)
- [x] Default branch set to `dev` (new PRs target dev)
- [x] Copilot reviews PRs to dev

---

## Phase 2 — Done ✓

- [x] `npm run verify:dev` — runs unit, integration, smoke, and (optionally) authenticated E2E against dev

---

## Phase 3 — Your Action: Railway

**GitHub Actions (repo automation):** Pushes to **`dev`** and **`main`** trigger the **Deploy** workflow (`.github/workflows/deploy.yml`): tests → build → **`railway up`** into the Railway environment named **`dev`** or **`production`** → hard gate on **`/api/health`**. Check the **Actions** tab if dev stopped updating after merges.

**Manual deploy (same workflow):** GitHub → **Actions** → **Deploy** → **Run workflow** → select **`dev`** (or **`main`**). Dispatch is **blocked** on other branches so dev/prod secrets are not applied to unmerged code. Use when a push did not enqueue a run but Railway must be updated.

**Secrets required for Deploy to succeed** (see header in `.github/workflows/deploy.yml`): `RAILWAY_TOKEN_DEV` / `RAILWAY_TOKEN_PROD`, `RAILWAY_SERVICE_ID`, `RAILWAY_DEV_URL`, `RAILWAY_PROD_URL` (and optional smoke/tour secrets documented in the workflow file).

**Configure Railway to auto-deploy from `dev`:**

1. Open: **https://railway.app/dashboard**
2. Select your **command-center** project
3. Click your **service** (the Next.js app)
4. Go to **Settings** → **Source**
5. Under **Branch**, change from `main` to `dev` for the **development** environment
6. Enable **Wait for CI** (so Railway waits for GitHub Actions before deploying)

**For production:** Ensure the production environment deploys from `main`.

**Railway config to avoid auth redirect loops** (Settings → Variables):

| Variable | Value |
|----------|-------|
| `NEXTAUTH_URL` | Your app URL, e.g. `https://command-center-reboot-dev.up.railway.app` |

`trustHost: true` is set in `lib/auth.ts` for proxy deployments and, together with a correct `NEXTAUTH_URL`, prevents redirect loops behind Railway's proxy.

**Required Auth.js env vars (also set on Railway):**

| Variable | Value |
|----------|-------|
| `AUTH_SECRET` | Random string used for Auth.js signing (e.g. `openssl rand -base64 32`) |

---

## Phase 4 — Your Action: GitHub Secrets

**Add these repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Purpose |
|--------|---------|
| `RAILWAY_DEV_URL` | Dev URL for verify workflow (e.g. `https://xxx-dev.up.railway.app`) |
| `E2E_TEST_EMAIL` | (Optional) E2E test user email |
| `E2E_TEST_PASSWORD` | (Optional) E2E test user password |

---

## Phase 5 — Your Action: Bootstrap Your Account

**Run once per environment** (local, dev, prod) to create your Super Admin account:

```bash
BOOTSTRAP_USER_EMAIL="you@example.com" \
BOOTSTRAP_USER_NAME="Your Name" \
BOOTSTRAP_USER_PASSWORD="<choose a strong, unique password>" \
BOOTSTRAP_USER_ROLE=ADMIN \
DATABASE_URL="<connection string>" \
npm run bootstrap:user
```

See `docs/BOOTSTRAP_USER.md` for details.

---

## Phase 6 — Your Action: Bootstrap E2E User

**Run once per environment** (dev and prod):

```bash
E2E_TEST_EMAIL="e2e-test@yourdomain.com" \
E2E_TEST_PASSWORD="YourSecurePassword123!" \
DATABASE_URL="<Railway dev connection string>" \
npm run bootstrap:e2e-user
```

Get `DATABASE_URL` from Railway → your service → Variables, or from Supabase dashboard.

---

## Daily Workflow

1. **Create PR** → targets `dev` (default)
2. **CI + Copilot** run automatically
3. **Merge to dev** → Railway auto-deploys dev (after CI passes)
4. **Verify:** `npm run verify:dev` (or run "Verify Dev" workflow in Actions)
5. **Promote to prod:** Create PR from `dev` → `main`, merge when ready
6. **Railway** auto-deploys prod from `main`

---

## Quick Links

| Task | Link |
|------|------|
| Railway dashboard | https://railway.app/dashboard |
| GitHub repo settings | https://github.com/cp-build-dev-ops/command-center-reboot/settings |
| Add secrets | https://github.com/cp-build-dev-ops/command-center-reboot/settings/secrets/actions |
| Run Verify Dev workflow | https://github.com/cp-build-dev-ops/command-center-reboot/actions/workflows/verify-dev.yml |
