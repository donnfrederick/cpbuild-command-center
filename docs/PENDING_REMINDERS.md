# Pending Reminders

Items in this file are surfaced at the start of every agent session until dismissed.
To dismiss an item, tell the agent and it will mark it `[x]` or remove it.

---

## Temporary — Alvin hotfix merge access (revert when Phil returns)

Granted 2026-07-24 so Alvin can open and merge hotfix PRs to `dev` and `main` while Phil is out.

- [ ] **Revoke when Phil is back:**
  1. Restore `.github/CODEOWNERS` to sole owner: `*   @cp-build-dev`
  2. Demote GitHub collaborator `alvincpbuild` from **Admin** back to **Write**:  
     `gh api --method PUT repos/cp-build-dev-ops/command-center-reboot/collaborators/alvincpbuild -f permission=write`
  3. Confirm at https://github.com/cp-build-dev-ops/command-center-reboot/settings/access and https://github.com/cp-build-dev-ops/command-center-reboot/blob/dev/.github/CODEOWNERS

---

## Copilot auto-review — permanently disabled (Jul 2026)

- [x] **Copilot automatic PR reviews are off.** Disabled to reduce AI cost and agent wait time. Use Cursor pre-push discipline + CI + deploy verify instead. Do not re-enable without Phil's explicit approval.

**Repo changes (done in chore/reduce-actions-churn):**
- `copilot-review.yml` — manual `workflow_dispatch` only
- `copilot-implement-suggestions.yml` — disabled
- `gemini-pr-analysis.yml` — manual only (was firing every PR push)
- `auto-update-prs.yml` — manual only (was rebasing all open PRs on every dev merge)
- `rerun-blocked-bot-ci.yml` — removed 15-minute cron

**Phil must do once in GitHub UI (agent cannot access rulesets API):**
1. Open https://github.com/cp-build-dev-ops/command-center-reboot/rules/13245507
2. Disable or delete the **"Copilot code review"** ruleset (`review_on_push`)

### Agent behavior while Copilot is disabled

| Do | Do not |
|----|--------|
| Run full local + CI gate (`build`, `lint`, `test:unit`, integration when API touched) | Request `@copilot` on PRs (`gh pr edit --add-reviewer`) |
| Run Pre-PR i18n + CSS color audits before opening PRs | Wait for Copilot reviews or poll for Copilot comments |
| Adversarial self-review in Cursor; optional Bugbot on large/security PRs | Block merge solely because Copilot has not reviewed |
| Resolve **human** review threads; merge when CI green + Phil approved | Re-enable `copilot-review.yml` pull_request triggers |
| Hand off deploy to GitHub Actions UI; curl health for receipt | |

### PR Ready checklist substitute (feature/fix/chore PRs)

Steps 4, 5, 7 from `git-pr-workflow.mdc` Unified PR Ready Checklist are **skipped**. Required instead:

1. Phil approved PR creation  
2. Branch current on `dev`  
3. **CI green** (lint-and-test, unit, integration, CodeQL)  
4. **Pre-PR audits** — i18n + CSS color grep scripts in `project-prompt.mdc` (zero output)  
5. **Agent self-review** — Pre-Push Self-Check matrix read for touched categories  
6. All **existing** review threads resolved (not Copilot-specific)  
7. No merge conflicts  
8. **Security-sensitive files** — still require Phil's explicit merge approval  

---

## Learnings Log — Next Refresh

- [ ] **Next `COPILOT_LEARNINGS.md` refresh due: 2026-07-20** (90 days from 2026-04-21) or at PR #733 (current base + 50), whichever comes first. Run `npm run refresh:learnings` to audit, then open a refresh PR per the cadence documented in `docs/COPILOT_LEARNINGS.md` → Refresh cadence. When completed, update this reminder with the next date/PR count.

---

## Migration Fix — access:devtools permission name

- [x] Create a follow-up migration to backfill the `name` field on the `access:devtools` permission row. Fixed in `20260311000001_backfill_devtools_permission_name`.

---

## Open PRs — Promote to Prod After Dev Verify

- [x] PR #235 `chore/scope-copilot-review` — merged and confirmed (state: MERGED).

---

## Versioning — dev vs prod `package.json` (think later)

- [ ] **Revisit release/version policy** — Today prod bumps land on `main` and `dev` can lag until a sync PR (e.g. #363). Options to compare later: **dev-led semver** (bump on `dev` before prod), **prerelease tags on dev** (`x.y.z-rc.n` for attempts), **deploy identity via `GIT_SHA` in health** instead of overloading semver, and/or **automation** after successful prod to sync version onto `dev` so no manual step is skipped. Document chosen semantics (what each version segment means) when decided. No change required until Phil picks a direction.

---

## Security Hardening (post-MVP)

- [ ] Enable FileVault disk encryption — System Settings > Privacy & Security > FileVault
- [ ] Enable macOS application firewall + Stealth Mode — System Settings > Network > Firewall
- [ ] Audit Screen Sharing (port 5900 is open) — System Settings > General > Sharing > turn off if unused
- [ ] Disable AirPlay Receiver ports 5000 / 7000 — System Settings > General > AirDrop & Handoff > AirPlay Receiver
- [ ] Ask IT: who enrolled NovaSoc, what data is collected, retention policy

## Prompt Analysis — Future Feature

- [ ] **Deep prompt analysis system** — `docs/PROMPT_TIMING_LOG.md` is now tracking timing per prompt. Future work: analyze the log to identify (1) which prompt types take longest, (2) phrasing patterns that get cleaner results vs. require clarification loops, (3) categories where the agent and Phil are well-aligned vs. still calibrating. Goal: agent adjusts to Phil's natural phrasing style where reasonable; Phil refines phrasing where a small shift makes a big difference. Collaborative, not one-sided.

---

## Deploy Counting Definition — Briefing Analysis Standard

- [ ] **Definition is now enforced in Gemini prompts (daily briefing + synthesis):** A deploy is only counted as successful when it reaches production AND requires no same-day hotfix, rollback, or corrective deployment. Merged PRs ≠ deploys. The clean deploy rate (successful / total attempts) is now tracked as a reliability metric in synthesis reports.
- [ ] **Exec summary deck (`exec-summary.html`):** Updated stat from "34 items shipped" to "0 blocked prod deploys since Mar 12." If you ever want to add the actual clean deploy count for the 30-day period, look at Railway deploy history and count only runs that cleared `verify` without a follow-up corrective deploy on the same day.

---

## BI Reader — `user_public_info` view (resolved in PR-AB)

- [x] Replaced broken `user_public_info` view with column-level SELECT on `"User"` (passwordHash excluded). See `scripts/bootstrap-bi-reader-grants.ts` Option B.

---

## xlsx Security Vulnerability (no fix available)

- [ ] `xlsx@0.18.5` has 2 high CVEs (Prototype Pollution + ReDoS in SheetJS). No patch released by the vendor. Used in `lib/upm-parse.ts`, `components/projects/UnitsPageClient.tsx`, `ProjectDetailView.tsx`, `CreateProjectModal.tsx`. Risk is low (internal tool, authenticated users only). Revisit when SheetJS releases a fix, or evaluate switching to `exceljs` when next touching Excel features.

---

## Remove P3009 Recovery Block from railway-start.sh

- [x] **Removed** — recovery block removed from `scripts/railway-start.sh` and replaced with idempotent migration `20260401000000_ensure_activity_logs_exists`. Delete `PRISMA_P3009_RECOVERY` from Railway dev variables if not already done.

---

## Field daily report — scheduled midnight generate (post-deploy verify)

Code is on branch `vet/hannah-field-daily-report` (not merged to `dev`/`main` as of 2026-07-16). **Do not mark done until verified in both environments.**

### One-time setup (after merge)

- [ ] **GitHub secret** `FIELD_DAILY_CRON_SECRET` — same value on Railway **dev** and **prod**
- [ ] **GitHub repo variable** `FIELD_DAILY_CRON_APP_URL` — prod app base URL for the scheduled cron (e.g. `https://command-center-reboot-production.up.railway.app`). Hourly workflow calls this; API gates on org-TZ midnight (`America/Denver`).
- [ ] **Railway** `FIELD_DAILY_CRON_SECRET` on dev + prod (API returns 401 without it)
- [ ] Confirm workflow exists: `.github/workflows/field-daily-scheduled.yml` visible in GitHub Actions

### Dev verification (after dev deploy)

- [ ] **Manual smoke:** Actions → *Field Daily Scheduled Generate* → *Run workflow* with `force: true` and optional `report_date`. Step log should show JSON with `skipped: false` and `projectsWritten` ≥ 0 (or `0` if no field activity that day).
- [ ] **Endpoint:** `POST /api/internal/field-daily/scheduled-generate` with `Authorization: Bearer <secret>` returns 200 (not 401).
- [ ] **UI/DB:** Reports with trigger `SCHEDULED` appear for the chosen date where install managers had field activity.

### Prod verification (after prod deploy)

- [ ] Same secret/URL wiring as above; `FIELD_DAILY_CRON_APP_URL` must point at **production**.
- [ ] **Midnight gate:** On an hourly scheduled run *outside* Denver hour 0, Actions log should show `skipped: true`, `skipReason: "not_org_midnight_hour"` — no duplicate reports.
- [ ] **First real midnight:** After deploy, confirm one run near **06:10 or 07:10 UTC** (DST) returns `skipped: false` and yesterday’s reports are created once.
- [ ] Optional backfill: `workflow_dispatch` with `report_date` + `force: true` for a missed day.

**Reference:** `lib/field-daily-report/scheduled-generate.ts`, `POST /api/internal/field-daily/scheduled-generate`, local dry-run `FIELD_DAILY_CRON_FORCE=1 npm run field-daily:scheduled`.

---

## Completed This Session

- [x] SSH key (ed25519) generated, added to macOS Keychain, registered on GitHub
- [x] Git remote switched to SSH for command-center-reboot
- [x] GPG commit signing configured — all future commits will show Verified on GitHub
