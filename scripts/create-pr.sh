#!/usr/bin/env bash
# Create a pull request via GitHub API.
# Requires: GITHUB_TOKEN env var (Personal Access Token with repo scope)
# Usage: ./scripts/create-pr.sh "PR title" "PR body" [base_branch]
# Example: ./scripts/create-pr.sh "chore: Cursor rule update" "Remove IHI refs" dev

set -e
cd "$(dirname "$0")/.."

TITLE="${1:?Usage: create-pr.sh \"Title\" \"Body\" [base=dev]}"
BODY="${2:-}"
BASE="${3:-dev}"
HEAD="$(git branch --show-current)"

if [[ -z "$GITHUB_TOKEN" ]]; then
  GITHUB_TOKEN=$(printf 'protocol=https\nhost=github.com\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
fi
if [[ -z "$GITHUB_TOKEN" ]]; then
  echo "Error: No GitHub token. Set GITHUB_TOKEN or ensure git credential is configured."
  exit 1
fi

# Determine owner/repo. Prefer GITHUB_REPOSITORY if set, otherwise derive from git remote.
REPO="${GITHUB_REPOSITORY:-}"

if [[ -z "$REPO" ]]; then
  REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")

  if [[ -z "$REMOTE_URL" ]]; then
    echo "Error: Could not determine git remote 'origin'. Set GITHUB_REPOSITORY or configure a remote."
    exit 1
  fi

  # Handle SSH URLs: git@github.com:owner/repo.git
  # and HTTPS URLs: https://github.com/owner/repo.git
  if [[ "$REMOTE_URL" =~ github.com[:/]+([^/]+/[^/]+)(\.git)?$ ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
fi

if [[ -z "$REPO" ]]; then
  echo "Error: Could not determine GitHub repository (owner/repo)."
  echo "Set GITHUB_REPOSITORY or ensure 'git remote get-url origin' points to github.com."
  exit 1
fi

URL="https://api.github.com/repos/$REPO/pulls"

echo "Creating PR: $TITLE"
echo "  Base: $BASE  Head: $HEAD"
echo ""

JSON_PAYLOAD=$(PR_TITLE="$TITLE" PR_BODY="$BODY" PR_HEAD="$HEAD" PR_BASE="$BASE" python - <<'PY'
import json, os

data = {
    "title": os.environ["PR_TITLE"],
    "body": os.environ.get("PR_BODY", ""),
    "head": os.environ["PR_HEAD"],
    "base": os.environ["PR_BASE"],
}
print(json.dumps(data))
PY
)

RESP=$(curl -s -X POST "$URL" \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -d "$JSON_PAYLOAD")

if echo "$RESP" | grep -q '"number"'; then
  NUM=$(echo "$RESP" | grep -o '"number":[0-9]*' | head -1 | cut -d: -f2)
  echo "✓ PR #$NUM created: https://github.com/$REPO/pull/$NUM"
else
  echo "Error creating PR:"
  echo "$RESP" | head -20
  exit 1
fi
