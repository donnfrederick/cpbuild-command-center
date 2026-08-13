#!/usr/bin/env bash
# Production build + next start for real offline/PWA testing via ngrok.
# `next dev` registers a SW but Workbox uses NetworkOnly for every route in dev —
# pre-downloaded project pages cannot open in airplane mode until you use this script
# or test on Railway dev/prod.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[$(date +"%l:%M:%S %p" | sed 's/^ //')] Stopping dev server on :3002..."
npm run dev:kill 2>/dev/null || true

echo "[$(date +"%l:%M:%S %p" | sed 's/^ //')] Building production bundle (offline SW runtime caching)..."
npm run build

echo "[$(date +"%l:%M:%S %p" | sed 's/^ //')] Starting production server on :3002..."
PORT=3002 npm run start > /tmp/dev-offline-server.log 2>&1 &

for i in $(seq 1 30); do
  if curl -sf http://localhost:3002/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

curl -sf http://localhost:3002/api/health >/dev/null || {
  echo "Server failed to start — see /tmp/dev-offline-server.log"
  tail -30 /tmp/dev-offline-server.log
  exit 1
}

bash scripts/ensure-tunnel.sh

echo ""
echo "Offline QA server ready (production SW + runtime caching)."
echo "  Local:  http://localhost:3002"
echo "  Logs:   /tmp/dev-offline-server.log"
echo "  Re-run pre-download on your phone after the first load registers the SW."
