#!/usr/bin/env bash
# refresh-learnings.sh
#
# Dry-run audit for docs/COPILOT_LEARNINGS.md and .cursor/rules/project-prompt.mdc.
# Reports candidates for archival, merge, or retirement. Does NOT modify any files.
# Human review before any archive action — this is a reporting tool, not an editor.
#
# Usage:
#   bash scripts/refresh-learnings.sh
#   npm run refresh:learnings
#
# Cadence (per COPILOT_LEARNINGS.md "Refresh cadence"):
#   Every 50 merged PRs OR 90 days, whichever comes first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LEARNINGS_FILE="docs/COPILOT_LEARNINGS.md"
PROMPT_FILE=".cursor/rules/project-prompt.mdc"
STALE_DAYS="${STALE_DAYS:-90}"

if [[ ! -f "$LEARNINGS_FILE" ]]; then
  echo "Error: $LEARNINGS_FILE not found" >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: $PROMPT_FILE not found" >&2
  exit 1
fi

printf '==================================================================\n'
printf ' COPILOT_LEARNINGS.md refresh audit\n'
printf ' Stale threshold: %s days\n' "$STALE_DAYS"
printf ' Ran: %s\n' "$(date -u +'%Y-%m-%d %H:%M UTC')"
printf '==================================================================\n\n'

# ---------- 1. Stale entries ----------
printf '[1/4] Stale entries (date-stamped headings older than %s days)\n' "$STALE_DAYS"
printf -- '------------------------------------------------------------------\n'

TODAY_EPOCH=$(date -u +%s)
STALE_CUTOFF_EPOCH=$((TODAY_EPOCH - STALE_DAYS * 86400))

STALE_FOUND=0
# Headings look like: "### 2026-04-17 | PR #682 | ci/automation — metrics-silent-fail"
while IFS= read -r line; do
  date_part=$(printf '%s' "$line" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -n1 || true)
  [[ -z "$date_part" ]] && continue

  if [[ "$OSTYPE" == "darwin"* ]]; then
    entry_epoch=$(date -u -j -f '%Y-%m-%d' "$date_part" +%s 2>/dev/null || echo 0)
  else
    entry_epoch=$(date -u -d "$date_part" +%s 2>/dev/null || echo 0)
  fi
  [[ "$entry_epoch" == "0" ]] && continue

  if (( entry_epoch < STALE_CUTOFF_EPOCH )); then
    printf '  STALE  %s  %s\n' "$date_part" "$(printf '%s' "$line" | sed 's/^### //' | cut -c1-90)"
    STALE_FOUND=$((STALE_FOUND + 1))
  fi
done < <(grep -E '^### [0-9]{4}-[0-9]{2}-[0-9]{2}' "$LEARNINGS_FILE" || true)

if (( STALE_FOUND == 0 )); then
  printf '  (none)\n'
else
  printf '\n  Action: consider archiving to docs/archive/COPILOT_LEARNINGS_<YYYY-MM>.md\n'
  printf '          if the pattern is now muscle memory or the linked bug class no longer applies.\n'
fi
printf '\n'

# ---------- 2. Duplicate-keyword clusters ----------
printf '[2/4] Duplicate-keyword clusters (headings sharing 3+ non-stopword tokens)\n'
printf -- '------------------------------------------------------------------\n'

DUP_FOUND=$(awk '
  /^### [0-9]{4}-[0-9]{2}-[0-9]{2}/ {
    line = tolower($0)
    gsub(/[^a-z0-9 ]/, " ", line)
    n = split(line, tokens, " ")
    tokenset = ""
    for (i = 1; i <= n; i++) {
      t = tokens[i]
      if (length(t) < 4) continue
      if (t ~ /^(with|from|that|this|when|where|have|into|about|over|been|were|will|would|could|should|retro|session|round|pull|request|merge|fixed|issue)$/) continue
      if (t ~ /^[0-9]+$/) continue
      tokenset = tokenset " " t
    }
    headings[NR] = $0
    sets[NR] = tokenset
  }
  END {
    for (i in sets) {
      for (j in sets) {
        if (i >= j) continue
        shared = 0
        split(sets[i], ta, " ")
        split(sets[j], tb, " ")
        seen = ""
        for (x in ta) {
          if (ta[x] == "") continue
          for (y in tb) {
            if (tb[y] == ta[x] && index(seen, " " ta[x] " ") == 0) {
              shared++
              seen = seen " " ta[x] " "
            }
          }
        }
        if (shared >= 3) {
          gsub(/^ +| +$/, "", seen)
          printf "  CLUSTER  shared=%d  keys=[%s]\n", shared, seen
          printf "           A: %s\n", substr(headings[i], 1, 100)
          printf "           B: %s\n\n", substr(headings[j], 1, 100)
        }
      }
    }
  }
' "$LEARNINGS_FILE")

if [[ -z "$DUP_FOUND" ]]; then
  printf '  (none)\n'
else
  printf '%s' "$DUP_FOUND"
  printf '  Action: consider merging duplicates into a single canonical entry,\n'
  printf '          keeping the most recent date and linking the older PRs in the body.\n'
fi
printf '\n'

# ---------- 3. Pre-Push rows referencing potentially-retired APIs ----------
printf '[3/4] Pre-Push Self-Check rows referencing APIs flagged as retired/dead\n'
printf -- '------------------------------------------------------------------\n'

RETIRED_PATTERNS=(
  'DEAD API'
  'do not use'
  'deprecated'
  'silently no-op'
  'silent drift'
)

DEAD_ROWS=0
for pat in "${RETIRED_PATTERNS[@]}"; do
  while IFS= read -r hit; do
    [[ -z "$hit" ]] && continue
    line_no="${hit%%:*}"
    excerpt=$(printf '%s' "$hit" | cut -c1-140)
    printf '  RETIRED?  L%s  %s\n' "$line_no" "$excerpt"
    DEAD_ROWS=$((DEAD_ROWS + 1))
  done < <(grep -niE "$pat" "$PROMPT_FILE" || true)
done

if (( DEAD_ROWS == 0 )); then
  printf '  (none)\n'
else
  printf '\n  Action: when the linked API has been retired long enough that the\n'
  printf '          lesson is muscle memory (~90 days since the entry), consider\n'
  printf '          retiring the Pre-Push row. The underlying COPILOT_LEARNINGS\n'
  printf '          entry stays as historical record.\n'
fi
printf '\n'

# ---------- 4. Summary ----------
printf '[4/4] Summary\n'
printf -- '------------------------------------------------------------------\n'
printf '  Stale entries       : %d\n' "$STALE_FOUND"
printf '  Duplicate clusters  : %d\n' "$(printf '%s' "$DUP_FOUND" | grep -c '^  CLUSTER' || true)"
printf '  Retired-flag hits   : %d\n' "$DEAD_ROWS"
printf '\n'
printf '  Next step: if any category has hits worth acting on, open a refresh PR that:\n'
printf '    (a) archives stale entries to docs/archive/COPILOT_LEARNINGS_<YYYY-MM>.md\n'
printf '    (b) merges duplicates into one canonical entry\n'
printf '    (c) retires Pre-Push rows whose learning has become muscle memory\n'
printf '  Ask Phil before opening the PR, per git-pr-workflow.mdc gate.\n'
