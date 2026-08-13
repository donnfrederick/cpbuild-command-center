# Active Branches

This file is the coordination layer between all agents (Phil's, Hannah's, RAD devs').

## Rules for all agents

1. **Read this file before starting any new branch.** Check the "Files owned" column for conflicts with what you plan to touch.
2. **Add a row as soon as you push a branch.** Use the format below.
3. **Update the Status column** as the branch progresses.
4. **Delete the row as soon as the work is done — do not keep merged branches in this table.** When the PR merges to `dev` (or `main` for release flows), remove that branch's row **in the same agent session** as the merge. Prefer deleting the row in a **final commit on the feature branch** before merge so the squash/merge commit already cleans the file; if that was missed, remove the row in the **next commit to `dev`** (e.g. a tiny `chore/` PR). Never use the `merged` status as a long-lived state — it only means "delete this row now."
5. **Never commit conflict markers.** Before pushing edits to this file, run `grep -n '<<<<<<<' docs/ACTIVE_BRANCHES.md` — it must return nothing. Finish merge/rebase resolution fully; remove the branch row in the same session as the merge to `dev`.

If you plan to touch files that another active branch owns, **surface the conflict to your user before proceeding** — do not silently edit files another branch is actively changing.

### Stale-row check (Phil's agent — session start)

When you read this file at session start: if a listed branch has **no open PR** and **`gh pr list --head <branch>` shows the last PR for that branch is `MERGED`**, delete the row and commit the fix (on your current working branch or a `chore/active-branches` branch) so coordination stays accurate.

## Status values

| Status | Meaning |
|---|---|
| `in-progress` | Branch is being actively worked on, not yet pushed |
| `pushed, awaiting local verify` | Branch pushed and quality gate passed; waiting for Phil's local verification |
| `PR open #N` | PR is open on GitHub |
| `merged` | PR merged; row can be removed |

## Active branches

| Branch | Owner | Status | Files owned | Notes |
|---|---|---|---|---|
| feat/inspection-gps-activity-filters | Phil | PR open #1957 | lib/inspections/**, lib/activity/**, lib/field-log-location-filter.ts, lib/deliver-pdf-blob.ts, components/projects/InspectionsReportClient.tsx, IssuesLogClient.tsx, ObservationsLogClient.tsx, FieldLogListSkeleton.tsx, BuildingLevelFilterSection.tsx, app/api/activity/**, app/api/projects/*/issues/export-pdf, app/api/projects/*/observations/export-pdf, lib/permissions.ts | Inspection GPS, activity location filters, field log location hierarchy filters, PDF export UX, mobile skeletons |
| fix/deploy-build-oom | Phil | pushed, awaiting local verify | .github/workflows/deploy.yml, .github/workflows/build-canary.yml | Raise Node heap for CI `next build` TypeScript OOM after #1938 |
| apl/FT-0094-Custom-Location-Update-Observation | Alvin | PR open #1944 | app/api/projects/[id]/issues/[issueId]/route.ts, app/api/projects/[id]/observations/[obsId]/route.ts, components/projects/FieldNotesEditLocationSection.tsx, components/projects/IssueDetailModal.tsx, components/projects/ObservationDetailModal.tsx | Preserve custom site unitRef on observation/issue edit |

## How to add a row

When you push a branch, add a row in this format:

```
| feat/your-branch | Phil | pushed, awaiting local verify | path/to/file.ts, components/affected/ | One-line description |
```

Keep file paths specific enough that another agent can detect a conflict at a glance. Use glob patterns (e.g. `components/tour/`) when a whole directory is in scope.
