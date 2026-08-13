#!/usr/bin/env bash
# Stop Prisma Studio on ports 5555 (local), 5557 (prod), and legacy 5556.
set -euo pipefail

LOSF="$(command -v lsof 2>/dev/null || true)"
if [[ -z "$LOSF" && -x /usr/sbin/lsof ]]; then
  LOSF=/usr/sbin/lsof
fi

for PORT in 5555 5556 5557; do
  if [[ -z "$LOSF" ]]; then
    continue
  fi
  PIDS="$("$LOSF" -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$PIDS" ]]; then
    echo "Stopping Prisma Studio on :$PORT (PID(s): $PIDS)"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
  else
    echo "Port $PORT: nothing listening"
  fi
done

sleep 1
echo "Done. Start: npm run db:studio:all  (or :dev / :prod individually)"
