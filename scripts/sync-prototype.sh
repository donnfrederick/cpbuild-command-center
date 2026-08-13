#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# sync-prototype.sh
#
# Pulls the latest from Hannah's Figma prototype repo and shows a clear diff
# of what changed since the last sync. Run this whenever Hannah says she's
# pushed new work.
#
# Usage:
#   npm run sync:prototype
#
# What it does:
#   1. Switches to the cp-build-dev GitHub account
#   2. Pulls the latest commits from the prototype repo
#   3. Shows a colour-coded diff of changed files
#   4. Lists what components/pages changed so you know what to implement
#   5. Switches back to your personal account
# ─────────────────────────────────────────────────────────────────────────────

set -e

PROTO_DIR="$(cd "$(dirname "$0")/../../../cp-build-prototype" 2>/dev/null && pwd || echo "")"
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "\n${BOLD}${CYAN}▶ CP Build Prototype Sync${RESET}\n"

# ── 1. Find or clone the prototype repo ──────────────────────────────────────

if [ ! -d "$PROTO_DIR/.git" ]; then
  echo -e "  Prototype not found at $PROTO_DIR"
  echo -e "  Cloning from GitHub (requires cp-build-dev account)...\n"

  gh auth switch --user cp-build-dev 2>/dev/null || true
  git clone https://github.com/cp-build-dev/Commandcenterreboot.git \
    "$(dirname "$0")/../../../cp-build-prototype"
  gh auth switch --user psalt21 2>/dev/null || true
  echo -e "  ${GREEN}✓ Cloned${RESET}\n"
  exit 0
fi

# ── 2. Record the current HEAD so we can diff against it ─────────────────────

cd "$PROTO_DIR"
BEFORE=$(git rev-parse HEAD)

# ── 3. Pull latest ────────────────────────────────────────────────────────────

echo -e "  Pulling latest from prototype repo..."
gh auth switch --user cp-build-dev 2>/dev/null || true
git pull --ff-only origin main 2>&1 | sed 's/^/  /'
gh auth switch --user psalt21 2>/dev/null || true

AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo -e "\n  ${GREEN}✓ Already up to date — no changes from Hannah.${RESET}\n"
  exit 0
fi

# ── 4. Show what changed ──────────────────────────────────────────────────────

echo -e "\n${BOLD}New commits:${RESET}"
git log --oneline "${BEFORE}..${AFTER}" | sed 's/^/  /'

echo -e "\n${BOLD}Changed files:${RESET}"
git diff --name-status "${BEFORE}..${AFTER}" | sed 's/^/  /'

echo -e "\n${BOLD}${YELLOW}Design system changes:${RESET}"
git diff "${BEFORE}..${AFTER}" -- "src/styles/theme.css" "DESIGN_SYSTEM.md" | head -80 | sed 's/^/  /'

echo -e "\n${BOLD}${CYAN}Next steps:${RESET}"
echo -e "  Review the changed files above and implement the corresponding"
echo -e "  changes in the Next.js app at ~/Projects/command-center-reboot"
echo -e ""
echo -e "  Key mappings:"
echo -e "    src/styles/theme.css      →  app/globals.css (design tokens)"
echo -e "    src/app/components/*.tsx  →  components/layout/*.tsx"
echo -e "    src/app/pages/*.tsx       →  app/(dashboard)/*/page.tsx"
echo -e ""
