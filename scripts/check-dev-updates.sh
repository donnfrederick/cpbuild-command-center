#!/usr/bin/env bash
# Check if origin/dev has new commits. npm run check:dev uses check-dev-updates.ts (Windows-friendly).
# You can still run this script directly on macOS/Linux: bash scripts/check-dev-updates.sh

set -e
cd "$(dirname "$0")/.."

git fetch origin dev 2>/dev/null || true

LOCAL=$(git rev-parse dev 2>/dev/null || echo "none")
REMOTE=$(git rev-parse origin/dev 2>/dev/null || echo "none")

if [[ "$LOCAL" == "none" || "$REMOTE" == "none" ]]; then
  echo "⚠️  Could not determine dev vs origin/dev state (missing local 'dev' branch or 'origin/dev' ref). Skipping up-to-date check."
  exit 0
fi

if [[ "$LOCAL" != "$REMOTE" ]]; then
  BEHIND=$(git rev-list --count dev..origin/dev 2>/dev/null || echo "?")
  echo "⚠️  dev is behind origin/dev by ${BEHIND} commit(s). Run: git pull origin dev"
  exit 0
fi

echo "✓ dev is up to date with origin/dev"
exit 0
