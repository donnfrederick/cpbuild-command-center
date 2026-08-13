#!/usr/bin/env bash
# Keeps the ngrok tunnel alive while the dev server is running.
# Started in the background by `npm run dev` — exits when the parent shell session ends.
#
# Polls every 30s; if ngrok is dead or 4040 has no tunnel, re-runs ensure-tunnel.sh.

set -euo pipefail

POLL_INTERVAL="${TUNNEL_WATCH_INTERVAL:-30}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

tunnel_live() {
  curl -sf http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else '')" 2>/dev/null \
    || echo ""
}

while true; do
  URL="$(tunnel_live)"
  if [[ -z "$URL" ]] || ! pgrep -f "ngrok http" >/dev/null 2>&1; then
    bash "$SCRIPT_DIR/ensure-tunnel.sh" >/tmp/tunnel-watch.log 2>&1 || true
  fi
  sleep "$POLL_INTERVAL"
done
