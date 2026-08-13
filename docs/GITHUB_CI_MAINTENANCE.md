# GitHub CI & Branch Protection — Maintenance Guide

This doc helps maintainers avoid CI/branch-protection mismatches and keep PR deployments fast.

---

## Critical Rule: Required Checks Must Exist in Workflow

**Branch protection** (Settings → Branches → dev) requires certain status checks to pass before merge. If the CI workflow doesn't have a job that reports that status, the check will sit in "Waiting for status to be reported" and block all PRs.

### Required check (as of this writing)

| Check name | Purpose |
|------------|---------|
| `lint-and-test` | Gate that all lint + unit + integration tests passed |

### Before changing the CI workflow

1. **Check branch protection** — Settings → Branches → Edit rule for `dev` → see "Require status checks to pass before merging"
2. **If you rename or remove a job** — Update branch protection to match, or add a gate job that reports the expected name
3. **If you add a new required check** — Add it to branch protection after the workflow is merged

### Recommended workflow structure

The CI workflow should either:

- **Option A:** Have a single job named `lint-and-test` (runs lint + test)
- **Option B:** Have separate jobs (`lint`, `unit-tests`, `integration-tests`) plus a **gate job** named `lint-and-test` with `needs: [lint, unit-tests, integration-tests]`

Option B allows parallel jobs (faster) while satisfying branch protection.

---

## Workflow Optimizations (Already in Place)

| Optimization | Status |
|--------------|--------|
| `cache: "npm"` in setup-node | ✅ Reduces npm ci time |
| `CHECKPOINT_DISABLE: "1"` | ✅ Avoids Prisma telemetry firewall block |
| Parallel jobs (lint, unit, integration) | ✅ On copilot branch; faster than sequential |
| Gate job for branch protection | ✅ `lint-and-test` reports when others pass |

---

## Optional: Make CI Even Faster

- **Skip CI on draft PRs** — Add `if: github.event.pull_request.draft != true` to avoid running on WIP PRs
- **Path filters** — Only run full CI when relevant files change (e.g. skip tests if only docs changed) — adds complexity
- **Make Copilot code review optional** — If it's a required check and slow, consider making it optional in branch protection

---

## Known Issue: Auto-Rebase Doesn't Retrigger CI

**Symptom:** A PR shows `lint-and-test` as "Expected — Waiting for status to be reported" even though CI previously passed on that branch.

**Root cause:** The `auto-update-prs.yml` workflow runs `gh pr update-branch --rebase` when `dev` is updated. This creates a new commit SHA on the PR branch. GitHub requires CI to pass for the *current* HEAD SHA — the previous passing run (on the old SHA) doesn't count.

**Fix:** Push any commit to the branch to trigger a new CI run:
```bash
git fetch origin <branch> && git reset --hard origin/<branch>
git commit --allow-empty -m "ci: retrigger after auto-rebase"
git push
```

Or re-run the CI workflow manually from the Actions tab → select the workflow → "Re-run all jobs".

**Long-term mitigation options:**
- Disable `auto-update-prs.yml` and let developers rebase manually before merge
- Add a step to `auto-update-prs.yml` that triggers a workflow dispatch on each rebased PR branch (complex, not yet implemented)
- Use merge commits instead of rebase (avoids the SHA change problem but creates noisier history)

For now, the empty commit approach is the fastest fix when it happens.

---

## Checklist When Modifying CI

- [ ] Does the workflow have a job that reports each required check?
- [ ] Run `npm run lint` and `npm run test` locally before pushing
- [ ] If you changed job names, update branch protection required checks
- [ ] Push and verify the new workflow runs and all checks pass

---

## Quick Reference: Branch Protection Settings

**Location:** Repo → Settings → Branches → Branch protection rules → dev

**Required status checks (typical):**

- `CI / lint-and-test` (or `lint-and-test`)
- `CodeQL / Analyze` (if using CodeQL)

**Optional (can slow merges):**

- Copilot code review — Consider making optional if it blocks merges
