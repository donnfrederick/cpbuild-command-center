#!/usr/bin/env bash
# Start local (:5555), Railway dev (:5556), and prod (:5557) Studio together.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Stopping any existing Studio on :5555 / :5556 / :5557..."
bash "$ROOT/scripts/prisma-studio-kill.sh"

start_one() {
  local label="$1"
  local port="$2"
  local script="$3"
  local log="/tmp/prisma-studio-${port}.log"
  echo ""
  echo "Starting ${label} (:${port})..."
  nohup bash "$ROOT/scripts/${script}" > "$log" 2>&1 &
  sleep 5
  if grep -qE "Prisma Studio is running|Prisma Studio is up" "$log" 2>/dev/null; then
    echo "✅ ${label}  → http://localhost:${port}  (log: ${log})"
  else
    echo "❌ ${label}  — check ${log}"
    tail -15 "$log" 2>/dev/null || true
  fi
}

start_one "Local" 5555 "prisma-studio-local.sh"
start_one "Dev" 5556 "prisma-studio-dev.sh"
start_one "Prod" 5557 "prisma-studio-prod.sh"

echo ""
echo "Fingerprints: npm run db:studio:check"
echo "Stop all:     npm run db:studio:kill"
