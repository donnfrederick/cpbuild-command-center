#!/usr/bin/env bash
# Runs dev server with background poller that syncs from origin/dev every 5 min.
# Kills any existing dev server on port 3002 before starting.
# Usage: npm run dev:with-sync

set -e
cd "$(dirname "$0")/.."

PORT=3002

# ── Kill any process already using port 3002 ──────────────────────────────────
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null || true)
if [[ -n "$EXISTING" ]]; then
  echo "→ Stopping existing process on port $PORT (PID $EXISTING)..."
  kill "$EXISTING" 2>/dev/null || true
  # Wait up to 3s for port to free
  for i in 1 2 3; do
    sleep 1
    lsof -ti tcp:$PORT &>/dev/null || break
  done
  echo "  Done."
fi

# ── Cleanup on exit: kill the background poller ───────────────────────────────
POLLER_PID=""
cleanup() {
  if [[ -n "$POLLER_PID" ]]; then
    kill "$POLLER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ── Start poller in background ────────────────────────────────────────────────
npx tsx scripts/dev-sync-poller.ts &
POLLER_PID=$!

# ── Start dev server in foreground ────────────────────────────────────────────
exec npm run dev
