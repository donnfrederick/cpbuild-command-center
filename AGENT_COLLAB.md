# Agent Collaboration — Team Standup

> **How to use this file:**
> - **All agents:** Read at the start of every session. Update after every commit — note what you built, what you need Phil to review, and if you're blocked.
> - **Phil:** Read to pick up backend requests, PR-ready notifications, and handoffs. Update when you've wired up a backend need or left something for the team.
>
> Keep entries concise. Replace stale entries rather than accumulating them.

> ⚠️ **Merge Authority:** Only Phil may merge PRs into `dev`. Agents prepare PRs to the PR Ready standard (see `.cursor/rules/git-pr-workflow.mdc`) and then notify Phil here and on the PR. Never merge into `dev` without Phil's explicit approval.

---

## 🔄 Currently In Progress

| Who | Working on | Branch |
|-----|-----------|--------|
| Phil | Backend infrastructure, API routes, auth, deployment | `dev` / `main` |
| Hannah | Frontend UI/UX — new pages and components | `hannah/*` |

---

## 📬 Needs / Handoffs

_Requests between team members and agents. Remove entries once resolved._
_For PR-ready notifications, use format: `PR #N ready to merge — <one-line summary>`_

| From | To | Request | Status |
|------|----|---------|--------|
| — | — | Nothing pending | — |

---

## 🚧 Blockers

_Anything blocking progress. Remove once unblocked._

| Who | Blocker | Notes |
|-----|---------|-------|
| — | None | — |

---

## ✅ Recently Completed

_Last ~3 items resolved here. Full history is in `CHANGELOG.md`._

| Who | What | PR |
|-----|------|----|
| Phil | Hannah onboarding overhaul, CHANGELOG, PROJECT_TRACKER update | #66 |
| Phil | DevTools error boundary wrap-up, Unifier setup docs | #62 |
| Phil | Deployment workflow, lightweight dev setup, CI maintenance docs | #57 |

---

## 📋 How Agents Use This File

### Notifying Phil a PR is ready to merge

1. Complete all 7 steps in the PR Ready Protocol (`.cursor/rules/git-pr-workflow.mdc`)
2. Post the ready comment on the GitHub PR (template in the rule file)
3. Add a row here:
   ```
   | Agent | Phil | PR #N ready to merge — <one-line summary> | Ready |
   ```

### Requesting a backend API (Hannah's agent)

When a UI component needs an API that doesn't exist yet:

1. Add a comment at the top of the component file:
   ```tsx
   // Backend needed: GET /api/units — returns list of units with { id, name, status, installManager }
   ```
2. Add a row to the Needs/Handoffs table:
   ```
   | Hannah | Phil | GET /api/units endpoint | Pending |
   ```
3. Mention it in your PR description.

Phil will create the endpoint as a follow-up and check it off here.
