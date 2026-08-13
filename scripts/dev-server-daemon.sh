#!/usr/bin/env bash
# Durable local dev server for agent sessions and Phil's machine.
#
# Problem this solves: `npm run dev &` from Cursor's shell tool dies when the
# shell session ends. Redirecting to /tmp/log without nohup/disown is not enough.
#
# Usage (via npm scripts):
#   npm run dev:start    # pull (optional) + start detached + wait for health
#   npm run dev:status   # pid, port, health, last log lines
#   npm run dev:kill     # stop pid file + anything on :3002
#   npm run dev:restart  # kill + start
#
# Env overrides:
#   DEV_PULL_BRANCH=dev     — git pull origin <branch> before start (default: ff-only pull current branch)
#   DEV_SKIP_PULL=1         — skip all git pull
#   DEV_START_TIMEOUT=90    — seconds to wait for /api/health

set -euo pipefail

PORT=3002
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$PROJECT_DIR/.dev-server.pid"
LOG_FILE="/tmp/command-center-dev-server.log"
HEALTH_URL="http://localhost:${PORT}/api/health"
START_TIMEOUT="${DEV_START_TIMEOUT:-90}"

log() {
  echo "[$(date +"%l:%M:%S %p" | sed 's/^ //')] $*"
}

port_pids() {
  lsof -ti "tcp:${PORT}" 2>/dev/null || true
}

read_pid_file() {
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE" 2>/dev/null || true
  fi
}

is_healthy() {
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  [ "$code" = "200" ]
}

stop_server() {
  local pid file_pid pids
  file_pid="$(read_pid_file)"
  if [ -n "$file_pid" ]; then
    kill "$file_pid" 2>/dev/null || true
    sleep 1
    kill -9 "$file_pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"

  pids="$(port_pids)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(port_pids)"
    if [ -n "$pids" ]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

maybe_pull() {
  if [ "${DEV_SKIP_PULL:-}" = "1" ]; then
    return 0
  fi
  cd "$PROJECT_DIR"
  if [ -n "${DEV_PULL_BRANCH:-}" ]; then
    log "git pull origin ${DEV_PULL_BRANCH}..."
    git pull origin "$DEV_PULL_BRANCH"
  else
    log "git pull --ff-only (current branch)..."
    git pull --ff-only 2>/dev/null || true
  fi
}

start_server() {
  cd "$PROJECT_DIR"

  if is_healthy; then
    log "Dev server already healthy at ${HEALTH_URL}"
    return 0
  fi

  stop_server
  maybe_pull

  : > "$LOG_FILE"
  log "Starting dev server (nohup) — log: ${LOG_FILE}"
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"
  disown "$pid" 2>/dev/null || true

  local elapsed=0
  while [ "$elapsed" -lt "$START_TIMEOUT" ]; do
    if is_healthy; then
      log "Dev server ready — ${HEALTH_URL}"
      curl -s "$HEALTH_URL" || true
      echo ""
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  log "ERROR: Dev server did not become healthy within ${START_TIMEOUT}s"
  log "Last log lines:"
  tail -20 "$LOG_FILE" || true
  return 1
}

status_server() {
  local pid file_pid pids code
  file_pid="$(read_pid_file)"
  pids="$(port_pids)"
  code=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  echo "health_http=${code} url=${HEALTH_URL}"
  echo "pid_file=${file_pid:-none} port_pids=${pids:-none}"
  echo "log=${LOG_FILE}"

  if [ "$code" = "200" ]; then
    curl -s "$HEALTH_URL" || true
    echo ""
    return 0
  fi

  echo "Server not healthy. Last log lines:"
  tail -15 "$LOG_FILE" 2>/dev/null || echo "(no log yet)"
  return 1
}

cmd="${1:-status}"
case "$cmd" in
  start) start_server ;;
  stop|kill) stop_server; log "Dev server stopped." ;;
  restart) stop_server; start_server ;;
  status) status_server ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}" >&2
    exit 1
    ;;
esac
