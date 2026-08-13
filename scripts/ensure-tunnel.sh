#!/usr/bin/env bash
# Ensures the ngrok tunnel to localhost:3002 is live.
# Idempotent — safe to call even when ngrok is already running.
# Called automatically by `npm run dev` in the background.
#
# Exit codes:
#   0 — tunnel is live (prints the public URL)
#   0 — ngrok not installed or failed to start (warning printed; dev server still starts)

set -e

NGROK_BIN=$(which ngrok 2>/dev/null || echo "")

if [[ -z "$NGROK_BIN" ]]; then
  echo "⚠️  ngrok not found in PATH — skipping tunnel (install ngrok to enable)" >&2
  exit 0
fi

# ── Check if a tunnel is already live ────────────────────────────────────────

EXISTING_URL=$(curl -sf http://localhost:4040/api/tunnels 2>/dev/null \
  | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else '')" 2>/dev/null \
  || echo "")

if [[ -n "$EXISTING_URL" ]]; then
  echo ""
  echo "✓ ngrok tunnel already live: $EXISTING_URL"
  exit 0
fi

# ── Start a fresh tunnel ──────────────────────────────────────────────────────

pkill -f "ngrok http" 2>/dev/null || true
sleep 1

nohup "$NGROK_BIN" http 3002 > /tmp/ngrok.log 2>&1 &

# Wait up to 15 s for the tunnel to establish
for i in $(seq 1 10); do
  sleep 1.5
  URL=$(curl -sf http://localhost:4040/api/tunnels 2>/dev/null \
    | python3 -c "import sys,json; t=json.load(sys.stdin)['tunnels']; print(t[0]['public_url'] if t else '')" 2>/dev/null \
    || echo "")
  if [[ -n "$URL" ]]; then
    echo ""
    echo "✓ ngrok tunnel live: $URL"
    exit 0
  fi
done

echo ""
echo "⚠️  ngrok tunnel did not start within 15 s — check /tmp/ngrok.log" >&2
cat /tmp/ngrok.log >&2
exit 0  # non-fatal: dev server should still start even if tunnel fails
