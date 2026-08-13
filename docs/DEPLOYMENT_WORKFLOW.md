# Deployment Workflow — Dev → Verify → Prod

This document describes how to manage deploys effectively, including frontend/backend dependencies, verification in dev, and production rollout with test accounts.

---

## Quick Answers

### Will GitHub updates (Copilot, branch protection) auto-update Railway?

**No.** GitHub settings (Copilot, rulesets, branch protection) do not trigger Railway. Railway deploys when:

1. **GitHub integration** — You connect Railway to the repo and configure which branch triggers which environment. Pushes to that branch trigger deploys.
2. **CLI** — `railway up` deploys from your local directory (what `npm run promote` uses).

### Current vs desired flow

| Step | Current | Desired |
|------|---------|---------|
| Merge target | `main` only (no dev branch) | Merge to `dev` first |
| Dev deploy | Manual via `npm run promote` | Auto when merged to `dev` |
| Dev verification | Smoke tests + manual gate | Full test suite (unit, integration, E2E, smoke) |
| Prod deploy | Manual gate in promote script | Easy one-command after dev passes |
| Prod verification | Smoke tests | Full E2E with test account, temp/cleanup data |

---

## Recommended Branch & Deploy Strategy

### Branch model

```
main (production)     ← merge from dev after verification
  ↑
dev (development)     ← PRs merge here first; Railway dev auto-deploys
  ↑
feature branches      ← PRs target dev
```

### Railway configuration

| Environment | Trigger branch | Auto-deploy | Wait for CI |
|-------------|----------------|-------------|-------------|
| **development** | `dev` | Yes | Yes |
| **production** | `main` | Yes (or manual) | Yes |

**Setup in Railway:**

1. **Project → Settings → Environments** — Ensure `development` and `production` exist.
2. **Each service** — In Service Settings → Source:
   - Development environment: Connect to repo, set branch = `dev`
   - Production environment: Connect to repo, set branch = `main`
3. **Wait for CI** — Enable "Wait for CI" so Railway only deploys after GitHub Actions pass.

---

## Verification Pipeline

### 1. On merge to `dev`

- **GitHub Actions** (already runs): `lint-and-test`, CodeQL
- **Railway** (after CI): Auto-deploys `dev` branch to development environment
- **You run** (or automate): Full verification against dev URL

### 2. Full verification against dev

```bash
# Set dev URL (from .env.deploy or Railway dashboard)
export BASE_URL="https://your-dev.up.railway.app"

# Run everything
npm run test                    # Unit + integration (local)
npm run test:smoke              # Smoke E2E against dev
# Optional: npm run test:e2e     # Full E2E if you have more specs
```

### 3. Promote to production

**Option A — Merge dev → main (if prod auto-deploys from main)**

```bash
git checkout main
git merge dev --no-ff
git push origin main
# Railway auto-deploys prod after CI passes
```

**Option B — Use promote script (manual deploy, current approach)**

```bash
npm run promote
# Deploys from local main to dev, then prod, with manual gate
```

**Option C — GitHub Action for promote**

A workflow could: on manual trigger or when `dev` is tagged, run full tests against dev, then merge dev→main (or trigger Railway prod deploy).

---

## Frontend / Backend Dependencies

### Same repo (monolith)

Your app is a Next.js monolith: frontend and backend (API routes, Prisma) ship together. There are no separate deployables. When you deploy, you deploy everything.

### Migration ordering

`railway.json` already has:

```json
"startCommand": "npx prisma migrate deploy && npm run start"
```

Migrations run before the app starts, so schema changes apply before the new code runs. **Always create migrations for schema changes** and commit them with the code that uses them.

### Breaking changes

When a frontend change depends on a new API or schema:

1. **Backend first** — Add the API/column in the same PR as the frontend that uses it.
2. **Or feature-flag** — Ship backend, then frontend that gracefully handles "not yet available."

---

## Test Account & Temporary Data

### Test account

Create a dedicated E2E test user in each environment:

| Env | Email | Role | Purpose |
|-----|-------|------|---------|
| Dev | `e2e-test@yourdomain.com` | ADMIN | Full E2E with all permissions |
| Prod | `e2e-test@yourdomain.com` | ADMIN | Post-deploy verification only |

**Bootstrap once per environment:**

```bash
E2E_TEST_EMAIL=e2e-test@yourdomain.com \
E2E_TEST_PASSWORD="YourSecureE2EPassword!" \
DATABASE_URL="<env-connection-string>" \
npm run bootstrap:e2e-user
```

Store the password in a secret (e.g. GitHub Actions secret, 1Password) for E2E runs.

### Data strategy for E2E

| Strategy | Pros | Cons |
|----------|------|------|
| **Create + delete** | Simple, no schema changes | Can leave orphan data if tests crash |
| **Temp tables** | Isolated | Requires schema/migration support |
| **Transaction rollback** | Clean | Harder with Playwright + separate API |
| **Dedicated test DB** | Full isolation | Extra cost, more setup |

**Recommended:** **Create + delete** with a clear naming prefix (e.g. `[E2E] Project X`) and an optional cleanup script or cron to remove stale test data.

### Example: E2E with test account

```typescript
// e2e/authenticated.spec.ts (to add)
import { test, expect } from "@playwright/test";

const E2E_USER = process.env.E2E_TEST_EMAIL ?? "e2e-test@example.com";
const E2E_PASS = process.env.E2E_TEST_PASSWORD ?? "";

test.describe("Authenticated flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(E2E_USER);
    await page.getByLabel(/password/i).fill(E2E_PASS);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(en|es)$/);
  });

  test("can create and delete a project", async ({ page }) => {
    // Create project with [E2E] prefix
    // Assert it appears
    // Delete it
    // Assert it's gone
  });
});
```

---

## Implementation Checklist

### Phase 1 — Branch & auto-deploy (low effort)

- [ ] Create `dev` branch from `main`
- [ ] In Railway: Set development environment to deploy from `dev`
- [ ] In Railway: Enable "Wait for CI" for dev
- [ ] Update PR default target to `dev` (Settings → General → Default branch for PRs)
- [ ] Update branch protection: protect `dev` similarly to `main` (PR required, status checks)

### Phase 2 — Verification script (medium effort)

- [ ] Add `scripts/verify-dev.ts` that:
  - Runs `npm run test`
  - Runs `npm run test:smoke` against `RAILWAY_DEV_URL`
  - Optionally runs full `npm run test:e2e` against dev
- [ ] Add `npm run verify:dev` script

### Phase 3 — Test account & E2E (medium effort)

- [ ] Bootstrap E2E test user in dev and prod
- [ ] Add `e2e/authenticated.spec.ts` (or expand smoke) with login + key flows
- [ ] Use `[E2E]` prefix for created data; add cleanup script if needed
- [ ] Store `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` in GitHub secrets for CI

### Phase 4 — Promote workflow (optional)

- [ ] Add GitHub Action: `workflow_dispatch` to run full verify against dev, then merge dev→main (or trigger prod deploy)
- [ ] Or: Keep `npm run promote` as the manual "I've verified dev, ship to prod" command

---

## Summary

| Question | Answer |
|----------|--------|
| Do GitHub updates auto-update Railway? | No. Railway deploys from branch pushes (if connected) or from `railway up`. |
| How to manage frontend/backend deps? | Same repo — deploy together. Migrations run before app start. |
| Merge → dev → verify → prod? | Use `dev` branch, Railway auto-deploys dev, run full tests, then merge dev→main for prod. |
| Test account? | Bootstrap `e2e-test@...` with ADMIN role. Use in E2E. |
| Temp data? | Create with `[E2E]` prefix, delete in test. Optional cleanup script for orphans. |
