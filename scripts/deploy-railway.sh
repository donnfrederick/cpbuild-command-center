#!/usr/bin/env bash
# Deploy to Railway (dev or prod)
#
# One-time setup: Run `railway login` in your terminal (opens browser)
#
# Usage:
#   ./scripts/deploy-railway.sh dev
#   ./scripts/deploy-railway.sh prod

set -e

ENV="${1:-dev}"
if [[ "$ENV" != "dev" && "$ENV" != "prod" ]]; then
  echo "Usage: $0 dev|prod"
  exit 1
fi

# Check auth
if ! railway whoami &>/dev/null; then
  echo "Not logged in. Run once: railway login"
  exit 1
fi

cd "$(dirname "$0")/.."

echo "=== Deploying to Railway ($ENV) ==="

# Link to project (creates .railway/config.json)
# First time: railway init, then railway link
railway link 2>/dev/null || {
  echo "No project linked. Create one:"
  echo "  1. railway init -n command-center-${ENV}"
  echo "  2. railway add -d postgres"
  echo "  3. Run this script again"
  exit 1
}

# Set AUTH_SECRET if not already set
if ! railway variable list 2>/dev/null | grep -q AUTH_SECRET; then
  railway variable set AUTH_SECRET="$(openssl rand -base64 32)" 2>/dev/null || true
fi

echo "Deploying..."
railway up --detach

echo ""
echo "Deploy triggered. Check: railway logs"
echo "After deploy: set NEXTAUTH_URL, RESEND_API_KEY, EMAIL_FROM in Railway dashboard"
