# PR Workflow — Agent Guide

This document describes the complete lifecycle of a PR in this repository: from branch creation through Copilot review, comment resolution, CI, and final merge. **Read this before touching any PR.**

---

## Agent Authorization

Agents are trusted to operate autonomously on behalf of the user guiding them. You do not need to ask permission before each routine action. Act, then report what you did.

**Phil's agent is authorized to:**
- Push commits to `feat/`, `fix/`, and `chore/` branches, run Railway CLI, run GitHub CLI, set Railway env vars (dev without asking, production only when directed), resolve Copilot review threads via GraphQL, update GitHub settings when directed

**Hannah's agent is authorized to:**
- Push commits to `hannah/` branches, run `gh pr create/view/comment`, edit frontend files only (`components/`, `app/[locale]/`, `messages/`, `app/globals.css`, `public/`)

See `.cursor/rules/git-pr-workflow.mdc` → "Agent Authorization" for the full list.

---

## Merge Authority

**Only Phil (lead developer) merges PRs into `dev`.** No agent merges into `dev` autonomously.

Your job as an agent is to:
1. Build the feature/fix on a branch
2. Open a PR targeting `dev`
3. Drive the PR through the full pipeline below
4. Notify Phil when the PR is 100% ready for his final approval

---

## Full PR Lifecycle

### Standard PRs (most PRs)

```
Branch → Push → Open PR
  → Auto: Branch rebased if dev has advanced (auto-update-prs.yml)
  → CI: lint, unit-tests, integration-tests, CodeQL — all must be green
  → Agent: Verify all PR Ready checkboxes
  → Agent: Post "ready" comment on PR + update AGENT_COLLAB.md
  → Phil: Reviews, approves, and merges to dev
```

No Copilot review loop. CI green + pre-push self-check is sufficient.

### Security PRs (touching protected paths)

Copilot review is automatically triggered when a PR touches any of:
- `lib/auth.ts`, `lib/permissions.ts`, `lib/dev-session.ts`
- `proxy.ts`
- `prisma/schema.prisma`
- `.github/workflows/**`

For these PRs, the full loop is required:

```
Branch → Push → Open PR
  → Auto: Copilot code review triggered (paths filter matched)
  → Agent: Pull and analyze all Copilot comments
  → Agent: Fix or skip each comment with documented reasoning (see decision framework)
  → Agent: Push fixes → Copilot reviews again
  → Agent: Pull new comments → fix or skip → push → repeat until zero unresolved threads
  → Agent: Resolve all conversations on GitHub
  → Auto: Branch rebased if dev has advanced (auto-update-prs.yml)
  → CI: lint, unit-tests, integration-tests, CodeQL — all must be green
  → Agent: Verify all PR Ready checkboxes
  → Agent: Post "ready" comment on PR + update AGENT_COLLAB.md
  → Phil: Reviews, approves, and merges to dev
```

**The Copilot feedback loop runs after every push to a security PR — not just the first one.**
Every push triggers a new review. Keep looping until GitHub shows zero unresolved threads.

---

## Step-by-Step Agent Responsibilities

### 1. Open the PR

```bash
git push -u origin <branch>
gh pr create --title "<type>(<area>): <description>" --base dev \
  --body "$(cat <<'EOF'
## Summary
- <bullet: what changed>

## Test plan
- [ ] <what to verify>
EOF
)"
```

Label it correctly: `design`, `backend`, `dependencies`, `security`, or `chore`.

### 2. Wait for Copilot to Review (security PRs only)

Skip this step entirely for standard PRs. Copilot only reviews PRs that touch `lib/auth.ts`, `lib/permissions.ts`, `lib/dev-session.ts`, `proxy.ts`, `prisma/schema.prisma`, or `.github/workflows/**`.

For security PRs, Copilot reviews automatically within ~2 minutes. Check with:

```bash
gh pr view <PR_NUMBER> --json reviews --jq '.reviews[].author.login'
```

Wait until `copilot-pull-request-reviewer` or `github-copilot` appears before proceeding.

### 3. Pull and Analyze All Comments — Then Communicate Progress (security PRs only)

Never read comments from the GitHub UI. Pull them programmatically so you see all of them. Then follow the **4-step communication protocol** (also in `.cursor/rules/git-pr-workflow.mdc`):

**Step A — Announce in chat before touching any code:**
List every comment by number with a one-line description so Phil can see what's coming.

**Step B — Report each fix in chat as you go (not in a batch at the end):**
```
✅ 1/3 — path/to/file.ts: <what changed and why>
⏸️ 2/3 — path/to/other.ts: Skipped — <exact reason>
✅ 3/3 — path/to/third.ts: <what changed and why>
```

**Step C — Post the ready comment on the PR** (only after all comments addressed).

**Step D — Close out in chat:** "All done on PR #N. X fixed, Y skipped. Please resolve the threads on GitHub."

---

Pull all unresolved threads:

```bash
gh api graphql -f query='
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 5) {
            nodes { body author { login } }
          }
        }
      }
    }
  }
}
' -f owner="cp-build-dev-ops" -f name="command-center-reboot" -F number=<PR_NUMBER> \
  --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | { path: .path, line: .line, comment: .comments.nodes[0].body }'
```

For each unresolved thread, decide:
- **Implement** — fix it in code and push to the branch
- **Skip** — document why (conflict with project constraints, already handled, etc.)

See the **Comment Decision Framework** in `.cursor/rules/git-pr-workflow.mdc` for the full implement/skip criteria. Summary:

- **Implement:** real bugs, security issues, missing tests, broken docs, clearly correct low-risk fixes
- **Skip:** already fixed in a merged PR, conflicts with documented architectural decision, purely stylistic, no actionable code change, more complexity than it's worth
- **Never skip:** security issues, data integrity bugs, missing tests for changed code paths
- **Always document** the skip reason — vague reasons like "seems fine" or "out of scope" are not acceptable

### 4. Fix Comments in Code, Not Via Copilot Sub-PRs (security PRs only)

**Do not click "Implement suggestion" in the GitHub UI.** That triggers the Copilot SWE agent to create a sub-PR, which adds latency and complexity. Instead:

- For inline code suggestions (have a `suggestion` block): click **Commit suggestion** directly on GitHub UI to apply the one-liner without a sub-PR.
- For text-only comments (no `suggestion` block): fix the code yourself, commit, and push to the branch.

Exception: if the comment requires non-trivial reasoning you can't safely do inline, you may use the Copilot SWE agent, but know that the sub-PR auto-merge workflow (`copilot-sub-pr-auto-merge.yml`) will handle merging it back.

### 5. Resolve All Conversations (security PRs only)

After addressing each comment, resolve its thread. The automation in `copilot-sub-pr-automation.yml` resolves threads automatically when a Copilot sub-PR merges, but if you're fixing comments yourself, resolve them manually:

```bash
# Get thread IDs
THREADS=$(gh api graphql -f query='...' --jq '.data...reviewThreads.nodes[].id')

# Resolve each
gh api graphql -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread { id }
  }
}
' -f threadId="<THREAD_ID>"
```

Or resolve via the GitHub UI ("Resolve conversation" button on each thread).

### 6. Verify All CI Checks Pass

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup \
  --jq '.statusCheckRollup[] | { name: .name, conclusion: .conclusion }'
```

All of these must show `SUCCESS`:
- `lint`
- `unit-tests`
- `integration-tests`
- `lint-and-test`
- `CodeQL` (`NEUTRAL` is acceptable for CodeQL only)

If any fail, investigate the logs and fix:

```bash
# Get the failed run ID
gh run list --branch <branch> --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId'

# Get the failed job logs
gh api /repos/cp-build-dev-ops/command-center-reboot/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion == "failure") | .id' \
  | xargs -I{} gh api /repos/cp-build-dev-ops/command-center-reboot/actions/jobs/{}/logs
```

### 7. Notify Phil

Once all PR Ready checkboxes pass, post this comment on the PR and update `AGENT_COLLAB.md`:

**Standard PR (no Copilot review triggered):**

```bash
gh pr comment <PR_NUMBER> --repo cp-build-dev-ops/command-center-reboot --body "$(cat <<'EOF'
✅ **PR ready for your review, @philipamour**

**Checklist:**
- [x] Branch rebased on latest `dev`
- [x] All CI checks green (lint, unit tests, integration tests, CodeQL)
- [x] No merge conflicts

**Summary of changes:** <one sentence>

This PR is ready to merge to `dev` whenever you're ready.
EOF
)"
```

**Security PR (Copilot review was triggered — touches auth/permissions/schema/workflows):**

```bash
gh pr comment <PR_NUMBER> --repo cp-build-dev-ops/command-center-reboot --body "$(cat <<'EOF'
✅ **PR ready for your review, @philipamour**

**Checklist:**
- [x] Branch rebased on latest `dev`
- [x] All CI checks green (lint, unit tests, integration tests, CodeQL)
- [x] Copilot code review complete
- [x] All Copilot comments analyzed (pulled via `gh api graphql`)
- [x] All Copilot comments addressed in code or skipped with documented reasoning
- [x] All conversations resolved on GitHub
- [x] No merge conflicts

**Summary of changes:** <one sentence>

**Copilot comments actioned:**
- <path>: <what Copilot flagged> → Implemented / Skipped because <reason>

This PR is ready to merge to `dev` whenever you're ready.
EOF
)"
```

Then add to `AGENT_COLLAB.md` Needs/Handoffs:
```
| Agent | Phil | PR #N ready to merge — <one-line summary> | Ready |
```

---

## Automation Reference

These workflows run automatically — you don't trigger them manually.

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `copilot-review.yml` | PR opened/reopened touching security paths | Requests a Copilot code review (only for auth/permissions/schema/workflow changes) |
| `copilot-implement-suggestions.yml` | After Copilot review completes | Posts status comment; triggers SWE agent if needed |
| `copilot-sub-pr-automation.yml` | Copilot sub-PR merged | Resolves parent PR threads; closes redundant sub-PRs; notifies Phil |
| `auto-update-prs.yml` | Push to `dev` | Rebases all open non-Dependabot PRs targeting dev |
| `deploy.yml` | Push to `dev` or `main` | Deploys to Railway (dev or production environment) |
| `deploy-failure-alert.yml` | Deploy workflow fails | Opens a GitHub issue with diagnostics |
| `ci.yml` | Any PR or push | Runs lint, unit tests, integration tests |

---

## PR Dashboard — Check Any Time

To see all open PRs, their CI status, and Copilot review state:

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,reviews \
  --jq '.[] | {
    pr: .number,
    title: .title,
    branch: .headRefName,
    ci: ([.statusCheckRollup[] | select(.conclusion != "SUCCESS" and .conclusion != "NEUTRAL") | .name] | if length == 0 then "✅ all green" else "❌ failing: " + join(", ") end),
    copilot: ([.reviews[] | select(.author.login | test("copilot"))] | if length > 0 then "✅ reviewed" else "⏳ pending" end)
  }'
```

Or run the npm shortcut (if available):
```bash
npm run pr:status
```

---

## Common Errors and Fixes

### "PR is out of date with base branch"
The `auto-update-prs.yml` workflow handles this automatically when `dev` is updated. To force it manually:
```bash
gh pr update-branch <PR_NUMBER> --rebase
```

### "All comments must be resolved before merging"
Resolve all review threads — either via the GitHub UI or the GraphQL mutation above.

### CI fails with "Incompatible React versions"
This happens when `react` and `react-dom` are bumped by separate Dependabot PRs. Close both and ask Phil to create a combined bump PR.

### Deploy fails after merge to dev
Check the `deploy-failure` GitHub issue that was auto-created. Follow the diagnostic steps in the issue body. Alert Phil if Railway credentials or environment config needs updating.
