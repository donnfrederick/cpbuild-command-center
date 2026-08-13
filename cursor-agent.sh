#!/usr/bin/env bash
# Launch the Cursor Voice Agent — kills any existing instance first.
# Usage: ./cursor-agent.sh [stop]

PYTHON=/opt/homebrew/bin/python3.11

if [ "${1:-}" = "stop" ]; then
  pkill -9 -f "cursor-agent/main\.py" 2>/dev/null && echo "Agent stopped." || echo "No agent was running."
  exit 0
fi

# Kill any existing instances before starting a fresh one
pkill -9 -f "cursor-agent/main\.py" 2>/dev/null && echo "Stopped previous instance." || true
sleep 1

cd "$(dirname "$0")/scripts/cursor-agent"
exec "$PYTHON" main.py "$@"
