#!/usr/bin/env bash
# Start local Studio (:5555) and prod Studio (:5557) at the same time.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Stopping any existing Studio on :5555 / :5557..."
bash "$ROOT/scripts/prisma-studio-kill.sh"

echo ""
echo "Starting local Studio (:5555)..."
nohup bash "$ROOT/scripts/prisma-studio-local.sh" > /tmp/prisma-studio-5555.log 2>&1 &
LOCAL_PID=$!

sleep 4

echo "Starting prod Studio (:5557)..."
if ! npx prisma studio --help >/dev/null 2>&1; then
  : # ensure node_modules present
fi
nohup bash "$ROOT/scripts/prisma-studio-prod.sh" > /tmp/prisma-studio-5557.log 2>&1 &
PROD_PID=$!

sleep 4

echo ""
echo "────────────────────────────────────────────────────────"
if grep -q "Prisma Studio is running" /tmp/prisma-studio-5555.log 2>/dev/null; then
  echo "✅ Local  → http://localhost:5555  (log: /tmp/prisma-studio-5555.log)"
else
  echo "❌ Local  — check /tmp/prisma-studio-5555.log"
  tail -15 /tmp/prisma-studio-5555.log 2>/dev/null || true
fi

if grep -q "Prisma Studio is running" /tmp/prisma-studio-5557.log 2>/dev/null; then
  echo "✅ Prod   → http://localhost:5557  (log: /tmp/prisma-studio-5557.log)"
else
  echo "❌ Prod   — check /tmp/prisma-studio-5557.log"
  tail -15 /tmp/prisma-studio-5557.log 2>/dev/null || true
fi
echo ""
echo "Row counts: npm run db:studio:check && npm run db:studio:prove"
echo "Stop both:  npm run db:studio:kill"
