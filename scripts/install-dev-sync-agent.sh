#!/usr/bin/env bash
# Install the macOS LaunchAgent that silently fetches origin/dev every 5 min.
# Run once: bash scripts/install-dev-sync-agent.sh
#
# What it does:
#   - Copies the plist to ~/Library/LaunchAgents/
#   - Replaces REPO_PATH placeholder with this repo's actual path
#   - Loads it so it starts immediately (and on every login)
#
# It only runs `git fetch origin dev --quiet` — never merges or touches files.
# Check the fetch log: cat /tmp/cpbuild-devsync.log

set -e
cd "$(dirname "$0")/.."

REPO="$(pwd)"
PLIST_SRC="scripts/com.cpbuild.commandcenter.devsync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/com.cpbuild.commandcenter.devsync.plist"
LABEL="com.cpbuild.commandcenter.devsync"

echo "Installing dev-sync LaunchAgent..."
echo "  Repo: $REPO"
echo "  Plist: $PLIST_DEST"
echo ""

# Replace REPO_PATH placeholder with actual path
sed "s|REPO_PATH|$REPO|g" "$PLIST_SRC" > "$PLIST_DEST"

# Unload if already loaded (ignore error if not loaded)
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Load it
launchctl load "$PLIST_DEST"

echo "✓ Installed and running."
echo ""
echo "  Fetches origin/dev every 5 minutes in the background."
echo "  Log: cat /tmp/cpbuild-devsync.log"
echo "  Error log: cat /tmp/cpbuild-devsync-error.log"
echo ""
echo "  To uninstall:"
echo "    launchctl unload $PLIST_DEST"
echo "    rm $PLIST_DEST"
