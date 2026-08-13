# Copilot Rounds Dashboard

> Auto-generated from `docs/COPILOT_ROUNDS_METRICS.jsonl` by `.github/workflows/track-copilot-rounds.yml` after each PR merge. Do not hand-edit — commit changes to the JSONL file or the renderer instead.

_Last updated: 2026-08-05 (UTC, merge date of most recent tracked PR)_

## Session-start trend line

The agent surfaces this line in the session-start status report:

```
Last 10 PRs rounds: 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0 → 0 → | preventable ratio: n/a 
```

## What these numbers mean

- **rounds** — how many Copilot review rounds this PR required before merge. Target: trend toward 1.
- **preventable_ratio** — fraction of Copilot comments that matched a category already in our pre-push self-check (`session-checklist.md` top-3 or a row in `project-prompt.mdc`'s Pre-Push Self-Check table). Target: trend toward 0 — a low ratio means we are catching issues upfront, not after Copilot flags them.
- **novel comments** — Copilot catches that did NOT match any existing category. These are the patterns we have not yet captured in a rule. Each one is a candidate for a new Pre-Push row or a new `session-checklist.md` entry.

## Recent PRs

| PR | Merged | Rounds | Comments | Preventable | Novel | Ratio | Title |
|----|--------|--------|----------|-------------|-------|-------|-------|
| #1912 | 2026-07-23 | 0 | 0 | 0 | 0 | n/a | chore(deps): Bump next from 16.2.10 to 16.2.11 |
| #1921 | 2026-07-23 | 0 | 0 | 0 | 0 | n/a | chore(deps): Bump next-auth from 5.0.0-beta.30 to 5.0.0-b… |
| #1928 | 2026-07-23 | 0 | 0 | 0 | 0 | n/a | chore(deps): Bump hono from 4.12.26 to 4.12.31 |
| #1930 | 2026-07-24 | 0 | 0 | 0 | 0 | n/a | chore: temporary Alvin hotfix merge access (Phil out) |
| #1934 | 2026-07-24 | 0 | 0 | 0 | 0 | n/a | [mergeOrder 3/3] merge test |
| #1938 | 2026-07-25 | 0 | 0 | 0 | 0 | n/a | [mergeOrder 3/3] feat(activity): heat map, GPS on activit… |
| #1940 | 2026-07-25 | 0 | 0 | 0 | 0 | n/a | [mergeOrder 3/3] fix(ci): deploy build OOM — raise Node h… |
| #1944 | 2026-07-31 | 0 | 0 | 0 | 0 | n/a | [mergeOrder 3/3] fix(field-notes): preserve custom site u… |
| #1952 | 2026-08-04 | 0 | 0 | 0 | 0 | n/a | chore(deps): Bump hono from 4.12.31 to 4.13.0 |
| #1957 | 2026-08-05 | 0 | 0 | 0 | 0 | n/a | [mergeOrder 5/5] feat: field log location filters, inspec… |

