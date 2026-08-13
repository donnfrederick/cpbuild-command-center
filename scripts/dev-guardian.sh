#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# dev-guardian.sh
#
# Watches macOS memory pressure and automatically pauses / resumes the Next.js
# dev server to keep Cursor from crashing during heavy agent sessions.
#
# Uses kern.memorystatus_vm_pressure_level — the same kernel signal macOS uses
# internally:
#   1 = Normal   (plenty of RAM)
#   2 = Warn     (compressing pages — Cursor may slow)
#   4 = Critical (actively paging — crashes likely)
#
# Behaviour (defaults):
#   • Pressure = warn (2)           → logs warning only (does NOT kill by default)
#   • Pressure = critical (4)       → kills dev server immediately
#   • Pressure returns to normal    → waits RESTART_DELAY, restarts server
#   • Server ready (initial start)  → opens Simple Browser tab in Cursor
#
# Environment variable overrides:
#   KILL_ON_WARN=true   — restore old behaviour: kill after WARN_GRACE at warn
#   OPEN_BROWSER=false  — skip opening Cursor Simple Browser on startup
#
# Usage:
#   npm run dev:guarded     ← dev server + guardian together (recommended)
#   npm run dev:guardian    ← guardian only (if server already running)
#
# Stop: Ctrl+C in the terminal running it
# ─────────────────────────────────────────────────────────────────────────────

PORT=3002
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$PROJECT_DIR/.guardian.log"

POLL_INTERVAL=8        # seconds between pressure checks
WARN_GRACE=120         # seconds at "warn" before killing (only when KILL_ON_WARN=true)
RESTART_DELAY=20       # seconds to wait after pressure normalises before restarting

# Feature flags (override via env vars)
KILL_ON_WARN="${KILL_ON_WARN:-false}"   # set to "true" to kill server on sustained warn pressure
OPEN_BROWSER="${OPEN_BROWSER:-true}"    # set to "false" to skip Cursor Simple Browser on startup

PAUSED=false
WARN_START=0           # epoch when we first hit warn level
BROWSER_OPENED=false   # track whether we've opened the browser yet this session

# ── Helpers ───────────────────────────────────────────────────────────────────

notify() {
  osascript -e "display notification \"$1\" with title \"${2:-CP Build Guardian}\"" 2>/dev/null
}

log() {
  local ts
  ts=$(date '+%H:%M:%S')
  local msg="[$ts] $1"
  echo "$msg" | tee -a "$LOG_FILE"
}

pressure_level() {
  # 1=normal 2=warn 4=critical
  sysctl -n kern.memorystatus_vm_pressure_level 2>/dev/null || echo 1
}

pressure_label() {
  case "$1" in
    1) echo "normal" ;;
    2) echo "warn" ;;
    4) echo "critical" ;;
    *) echo "unknown($1)" ;;
  esac
}

is_running() {
  lsof -ti:"$PORT" > /dev/null 2>&1
}

kill_server() {
  local reason="$1"
  local pids
  pids=$(lsof -ti:"$PORT" 2>/dev/null)
  if [ -n "$pids" ]; then
    kill "$pids" 2>/dev/null
    sleep 1
    pids=$(lsof -ti:"$PORT" 2>/dev/null)
    [ -n "$pids" ] && kill -9 "$pids" 2>/dev/null
    log "🛑  Dev server stopped — ${reason}"
    notify "Dev server paused — ${reason}. Cursor protected." "CP Build Guardian ⚠️"
    BROWSER_OPENED=false
  fi
}

start_server() {
  cd "$PROJECT_DIR" || return
  nohup npm run dev >> "$LOG_FILE" 2>&1 &
  disown
  log "🚀  Restarting dev server on :$PORT…"
}

open_cursor_browser() {
  [ "$OPEN_BROWSER" = "false" ] && return
  [ "$BROWSER_OPENED" = "true" ] && return

  local url="http://localhost:${PORT}/en"
  local cursor_bin=""

  # Locate whichever Cursor variant is installed
  for app_name in "Cursor - Work" "Cursor - Personal" "Cursor"; do
    local candidate="/Applications/${app_name}.app/Contents/Resources/app/bin/cursor"
    if [ -x "$candidate" ]; then
      cursor_bin="$candidate"
      break
    fi
  done

  if [ -n "$cursor_bin" ]; then
    "$cursor_bin" --open-url "vscode://vscode.simple-browser.show?url=${url}" 2>/dev/null &
    log "🌐  Opened Simple Browser in Cursor → $url"
    BROWSER_OPENED=true
  else
    log "⚠️  Cursor binary not found — skipping Simple Browser open"
  fi
}

# Wait for the server to become available on $PORT (used on initial start)
wait_for_server() {
  local max_wait=60
  local elapsed=0
  while [ $elapsed -lt $max_wait ]; do
    if is_running; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# ── Main loop ─────────────────────────────────────────────────────────────────

echo "" > "$LOG_FILE"

log "🛡  Memory Guardian active — polling every ${POLL_INTERVAL}s"
if [ "$KILL_ON_WARN" = "true" ]; then
  log "   Warn grace period : ${WARN_GRACE}s before server is killed (KILL_ON_WARN=true)"
else
  log "   Warn pressure     : log-only (set KILL_ON_WARN=true to enable kill)"
fi
log "   Restart delay     : ${RESTART_DELAY}s after pressure normalises"
log "   Open browser      : ${OPEN_BROWSER}"
log "   Project           : $PROJECT_DIR"
notify "Memory guardian is watching your dev server" "CP Build Guardian"

# On initial launch, wait for the server that concurrently is starting, then open browser
if wait_for_server; then
  log "✅  Dev server up at http://localhost:$PORT"
  open_cursor_browser
fi

while true; do
  LEVEL=$(pressure_level)
  LABEL=$(pressure_label "$LEVEL")
  NOW=$(date +%s)

  if [ "$PAUSED" = false ]; then
    if [ "$LEVEL" -eq 4 ]; then
      # Critical — kill immediately regardless of KILL_ON_WARN setting
      if is_running; then
        kill_server "RAM pressure CRITICAL"
        PAUSED=true
        WARN_START=0
      fi

    elif [ "$LEVEL" -eq 2 ]; then
      if [ "$KILL_ON_WARN" = "true" ]; then
        # Warn kill enabled — start grace period countdown
        if [ "$WARN_START" -eq 0 ]; then
          WARN_START=$NOW
          log "⚠️  Pressure: warn — grace period started (${WARN_GRACE}s)"
        elif [ $(( NOW - WARN_START )) -ge "$WARN_GRACE" ]; then
          if is_running; then
            kill_server "RAM pressure elevated for ${WARN_GRACE}s"
            PAUSED=true
            WARN_START=0
          fi
        fi
      else
        # Warn kill disabled (default) — log occasionally, never kill
        if [ "$WARN_START" -eq 0 ]; then
          WARN_START=$NOW
          log "ℹ️  Pressure: warn — monitoring (server stays up; set KILL_ON_WARN=true to change)"
        fi
      fi

    else
      # Normal — reset warn timer
      if [ "$WARN_START" -ne 0 ]; then
        log "✅  Pressure back to normal"
      fi
      WARN_START=0
    fi

  else
    # Currently paused — wait for normal pressure before restarting
    if [ "$LEVEL" -eq 1 ]; then
      log "✅  Pressure normal — waiting ${RESTART_DELAY}s before restarting…"
      sleep "$RESTART_DELAY"

      # Re-check after the rest period
      LEVEL=$(pressure_level)
      if [ "$LEVEL" -eq 1 ]; then
        start_server
        sleep 5
        if is_running; then
          log "✅  Dev server up at http://localhost:$PORT"
          notify "Dev server restarted at localhost:$PORT" "CP Build Guardian ✅"
          open_cursor_browser
        else
          log "❌  Dev server failed to start — run 'npm run dev' manually"
          notify "Dev server restart failed — start manually" "CP Build Guardian ❌"
        fi
        PAUSED=false
      else
        log "⏳  Pressure still elevated after rest (${LABEL}) — staying paused"
      fi
    fi
  fi

  sleep "$POLL_INTERVAL"
done
