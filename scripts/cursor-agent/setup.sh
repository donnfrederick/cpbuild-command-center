#!/usr/bin/env bash
# setup.sh — One-command setup for the Cursor Voice Agent.
# Run once: bash scripts/cursor-agent/setup.sh

set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

step()  { echo -e "\n${CYAN}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✓ $*${NC}"; }
warn()  { echo -e "${YELLOW}⚠ $*${NC}"; }
fail()  { echo -e "${RED}✗ $*${NC}"; }
hr()    { echo -e "${CYAN}────────────────────────────────────────────${NC}"; }

hr
echo -e "${CYAN}  Cursor Voice Agent — Setup${NC}"
hr

# ── 1. Fix Homebrew permissions ───────────────────────────────────────────────
step "Fixing Homebrew directory permissions..."
BREW_DIRS="/opt/homebrew /opt/homebrew/Cellar /opt/homebrew/bin /opt/homebrew/lib \
           /opt/homebrew/include /opt/homebrew/opt /opt/homebrew/share \
           /opt/homebrew/etc /opt/homebrew/var /opt/homebrew/Frameworks \
           /opt/homebrew/sbin /opt/homebrew/var/homebrew"

sudo chown -R "$(whoami)" $BREW_DIRS 2>/dev/null || true
chmod u+w $BREW_DIRS 2>/dev/null || true
ok "Homebrew permissions fixed."

# ── 2. Install portaudio ──────────────────────────────────────────────────────
step "Installing portaudio (required for microphone access)..."
if /opt/homebrew/bin/brew list portaudio &>/dev/null; then
  ok "portaudio already installed."
else
  /opt/homebrew/bin/brew install portaudio
  ok "portaudio installed."
fi

# ── 3. Install Python packages ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
step "Installing Python packages from requirements.txt..."

# Prefer Python 3.11 from Homebrew for best compatibility
PYTHON=$(/opt/homebrew/bin/brew --prefix python@3.11 2>/dev/null)/bin/python3
if [ ! -x "$PYTHON" ]; then
  PYTHON=$(which python3)
fi

echo "Using Python: $PYTHON ($($PYTHON --version))"
"$PYTHON" -m pip install --quiet --upgrade pip
"$PYTHON" -m pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
ok "Python packages installed."

# ── 4. Pre-download Whisper model ─────────────────────────────────────────────
step "Pre-downloading Whisper tiny.en model (~75 MB, one-time only)..."
"$PYTHON" -c "import whisper; whisper.load_model('tiny.en')" 2>&1 | grep -v "^$" || true
ok "Whisper model ready."

# ── 5. Check environment variables ────────────────────────────────────────────
step "Checking API keys..."
SHELL_RC="$HOME/.zshrc"
KEYS_MISSING=0

if [ -z "${GEMINI_API_KEY:-}" ]; then
  warn "GEMINI_API_KEY not set — smart filtering will use regex-only mode."
  echo "  Get a free key at: https://aistudio.google.com/app/apikey"
  echo "  Then add to $SHELL_RC:"
  echo "    export GEMINI_API_KEY=\"your-key-here\""
  KEYS_MISSING=1
else
  ok "GEMINI_API_KEY found."
fi

if [ -z "${PICOVOICE_ACCESS_KEY:-}" ]; then
  warn "PICOVOICE_ACCESS_KEY not set — voice commands ('computer ...') will be unavailable."
  echo "  Get a FREE key (no credit card) at: https://console.picovoice.ai"
  echo "  Then add to $SHELL_RC:"
  echo "    export PICOVOICE_ACCESS_KEY=\"your-key-here\""
  KEYS_MISSING=1
else
  ok "PICOVOICE_ACCESS_KEY found."
fi

# ── 6. Make main.py executable and write a launcher alias ─────────────────────
chmod +x "$SCRIPT_DIR/main.py"

# Write a tiny launcher in the project root for convenience
LAUNCHER="$SCRIPT_DIR/../../cursor-agent.sh"
cat > "$LAUNCHER" <<LAUNCHER
#!/usr/bin/env bash
# Launch the Cursor Voice Agent from anywhere in the project.
# Usage:  ./cursor-agent.sh          start
#         ./cursor-agent.sh status   check if already running
PYTHON=\$(/opt/homebrew/bin/brew --prefix python@3.11 2>/dev/null)/bin/python3
[ ! -x "\$PYTHON" ] && PYTHON=\$(which python3)
cd "\$(dirname "\$0")/scripts/cursor-agent"
exec "\$PYTHON" main.py "\$@"
LAUNCHER
chmod +x "$LAUNCHER"

# ── 7. Summary ────────────────────────────────────────────────────────────────
hr
echo ""
if [ "$KEYS_MISSING" -eq 0 ]; then
  echo -e "${GREEN}✅ Setup complete! Everything is ready.${NC}"
  echo ""
  echo "  Start the agent:     ./cursor-agent.sh"
  echo "  Or directly:         cd scripts/cursor-agent && python3 main.py"
else
  echo -e "${YELLOW}⚠  Setup complete — but add the missing API keys above to unlock full features.${NC}"
  echo ""
  echo "  After adding keys, reload your shell:  source $SHELL_RC"
  echo ""
  echo "  Then start the agent:   ./cursor-agent.sh"
fi
echo ""
echo "  Say 'computer' to activate voice commands."
echo "  Say 'computer, what just happened' for a Gemini summary."
echo "  Press Ctrl+C or say 'computer, stop' to quit."
echo ""
hr
