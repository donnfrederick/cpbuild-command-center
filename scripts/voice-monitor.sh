#!/usr/bin/env bash
# voice-monitor.sh
#
# Monitors Cursor terminal output and reads key events aloud via macOS `say`.
# Designed to run in a background terminal while you work — stays alive until
# you press Ctrl+C or run: ./scripts/voice-monitor.sh stop
#
# Usage:
#   ./scripts/voice-monitor.sh          # start monitoring
#   ./scripts/voice-monitor.sh mute     # toggle mute on/off
#   ./scripts/voice-monitor.sh stop     # stop all instances
#   ./scripts/voice-monitor.sh status   # is it running / muted?
#
# The monitor only reads NEW output — it ignores anything that was already
# in the terminal files before it started.

set -euo pipefail

TERMINALS_DIR="/Users/philpersonal/.cursor/projects/Users-philpersonal-Projects-command-center-reboot/terminals"
MUTE_FLAG="/tmp/cc-voice-muted"
PID_FILE="/tmp/cc-voice-monitor.pid"
VOICE="Samantha"
RATE=190   # words per minute — tweak if too fast/slow

# ── Filter patterns ──────────────────────────────────────────────────────────
# Lines matching INCLUDE will be spoken (regex, ERE)
INCLUDE='\[[0-9]{2}:[0-9]{2}:[0-9]{2}\]|✅|❌|⚠|[Ee]rror|FAILED|PASS|passed|failed|merged|[Dd]eploy|build|lint|compiled|TypeScript|test|PR #|issue|conflict|merge|push|CI'

# Lines matching EXCLUDE are always silenced (server noise, HTTP spam)
EXCLUDE='GET /api|POST /api|DELETE /api|PUT /api|[0-9]+ in [0-9]+ms|Fast Refresh|compile:|proxy\.ts:|generate-params|render:|○ Compiling|⚠ Fast|○ Skipping|hot-reload'

# ── Helpers ──────────────────────────────────────────────────────────────────
speak() {
  [ -f "$MUTE_FLAG" ] && return 0
  # Strip ANSI color codes, [server] prefix, markdown symbols, then speak
  local clean
  clean=$(printf '%s' "$1" \
    | sed 's/\[server\] *//' \
    | sed $'s/\x1b\\[[0-9;]*[mGKHF]//g' \
    | sed 's/[`*_#]//g' \
    | cut -c1-220)   # truncate very long lines
  [ -z "$clean" ] && return 0
  say -v "$VOICE" -r "$RATE" -- "$clean" 2>/dev/null &
}

log() {
  echo "[$(date +"%H:%M:%S")] $*"
}

# ── Subcommands ───────────────────────────────────────────────────────────────
case "${1:-start}" in
  mute)
    if [ -f "$MUTE_FLAG" ]; then
      rm "$MUTE_FLAG"
      say -v "$VOICE" -r "$RATE" "Voice monitor unmuted" 2>/dev/null &
      echo "Voice monitor: unmuted"
    else
      touch "$MUTE_FLAG"
      echo "Voice monitor: muted"
    fi
    exit 0
    ;;

  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      kill "$PID" 2>/dev/null && echo "Voice monitor stopped (pid $PID)" || echo "Process not found"
      rm -f "$PID_FILE"
    else
      echo "No running voice monitor found"
    fi
    # Kill any orphaned tail processes from this script
    pkill -f "tail -n 0 -F.*terminals" 2>/dev/null || true
    exit 0
    ;;

  status)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "Voice monitor: RUNNING (pid $(cat "$PID_FILE"))"
    else
      echo "Voice monitor: STOPPED"
    fi
    if [ -f "$MUTE_FLAG" ]; then
      echo "Sound: MUTED"
    else
      echo "Sound: ON"
    fi
    exit 0
    ;;

  start) ;;  # fall through to main logic
  *)
    echo "Usage: $0 [start|mute|stop|status]"
    exit 1
    ;;
esac

# ── Guard: don't run two instances ───────────────────────────────────────────
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Voice monitor is already running (pid $(cat "$PID_FILE")). Use 'stop' first."
  exit 1
fi

echo $$ > "$PID_FILE"

cleanup() {
  log "Voice monitor shutting down."
  pkill -f "tail -n 0 -F.*terminals" 2>/dev/null || true
  rm -f "$PID_FILE"
}
trap cleanup EXIT INT TERM

log "Voice monitor started — watching $TERMINALS_DIR"
speak "Voice monitor started. Listening for activity."

# ── File watcher ──────────────────────────────────────────────────────────────
# Associates file path → 1 once we've started tailing it
declare -A watched

tail_file() {
  local f="$1"
  tail -n 0 -F "$f" 2>/dev/null | while IFS= read -r line; do
    if printf '%s' "$line" | grep -qE "$INCLUDE" \
    && ! printf '%s' "$line" | grep -qE "$EXCLUDE"; then
      speak "$line"
    fi
  done &
}

# ── Main loop: pick up new terminal files every 5 seconds ────────────────────
log "Scanning for terminal files every 5s. Press Ctrl+C to stop."
log "Commands:  mute → ./scripts/voice-monitor.sh mute   |   stop → ./scripts/voice-monitor.sh stop"
echo ""

while true; do
  for f in "$TERMINALS_DIR"/*.txt; do
    [ -f "$f" ] || continue
    if [ -z "${watched[$f]+x}" ]; then
      watched[$f]=1
      log "Now watching: $(basename "$f")"
      tail_file "$f"
    fi
  done
  sleep 5
done
