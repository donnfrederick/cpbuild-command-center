#!/usr/bin/env bash
# Show which database each Prisma Studio port uses (hosts/refs only — no secrets).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/supabase-db-ref.sh
source "$ROOT/scripts/lib/supabase-db-ref.sh"

read_url_from_file() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    echo ""
    return
  fi
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

host_from_url() {
  echo "$1" | sed -E 's#.*@([^/]+)/.*#\1#'
}

LOCAL_FILE="$ROOT/.env"
DEV_FILE="$ROOT/.env.dev.local"
PROD_FILE="$ROOT/.env.prod.local"

LOCAL_URL="$(read_url_from_file "$LOCAL_FILE" DATABASE_URL)"
DEV_URL="$(read_url_from_file "$DEV_FILE" DATABASE_URL)"
PROD_URL="$(read_url_from_file "$PROD_FILE" DATABASE_URL)"

label_url() {
  local url="$1"
  if [[ -z "$url" ]]; then
    echo "ref/host: (not set)"
    return
  fi
  local ref host
  ref="$(supabase_db_ref "$url" 2>/dev/null || true)"
  host="$(host_from_url "$url")"
  if [[ -n "$ref" && "$ref" != "unknown" ]]; then
    echo "ref: ${ref}  host: ${host}"
  else
    echo "host: ${host}  (Railway Postgres)"
  fi
}

echo "Prisma Studio targets"
echo "────────────────────────────────────────────────────────"
printf "  :5555  npm run db:studio       →  .env\n"
printf "         %s\n" "$(label_url "$LOCAL_URL")"
printf "  :5556  npm run db:studio:dev   →  .env.dev.local (Railway dev)\n"
printf "         %s\n" "$(label_url "$DEV_URL")"
printf "  :5557  npm run db:studio:prod  →  .env.prod.local (Railway prod)\n"
printf "         %s\n" "$(label_url "$PROD_URL")"
echo ""
echo "Prove row counts:"
echo "  npm run db:studio:prove"
echo "  npm run db:studio:prove -- .env.dev.local DATABASE_URL"
echo "  npm run db:studio:prove -- .env.prod.local DATABASE_URL"
echo ""
echo "Start all three: npm run db:studio:all"
echo ""

if [[ -z "$DEV_URL" ]]; then
  echo "⚠️  .env.dev.local missing — cp .env.dev.local.example and paste Railway dev DATABASE_PUBLIC_URL."
fi
if [[ -z "$PROD_URL" ]]; then
  echo "⚠️  .env.prod.local missing — see .env.prod.local.example."
fi

same_pair() {
  local a="$1" b="$2"
  [[ -n "$a" && -n "$b" && "$a" == "$b" ]]
}

if same_pair "$LOCAL_URL" "$DEV_URL" || same_pair "$LOCAL_URL" "$PROD_URL" || same_pair "$DEV_URL" "$PROD_URL"; then
  echo "⚠️  Two or more ports share the same DATABASE_URL — they will show identical data."
else
  if [[ -n "$LOCAL_URL" && -n "$DEV_URL" && -n "$PROD_URL" ]]; then
    echo "✅ Three distinct connection strings configured."
  fi
fi
