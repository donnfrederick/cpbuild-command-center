#!/usr/bin/env bash
# Prisma Studio — Railway dev database. Port 5556 (.env.dev.local).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/supabase-db-ref.sh
source "$ROOT/scripts/lib/supabase-db-ref.sh"

ENV_FILE="${PRISMA_STUDIO_DEV_ENV:-$ROOT/.env.dev.local}"
LOCAL_ENV="${PRISMA_STUDIO_LOCAL_ENV:-$ROOT/.env}"
PROD_ENV="${PRISMA_STUDIO_PROD_ENV:-$ROOT/.env.prod.local}"
PORT="${PRISMA_STUDIO_DEV_PORT:-5556}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "  cp .env.dev.local.example .env.dev.local"
  echo "  Paste Railway dev Postgres DATABASE_PUBLIC_URL:"
  echo "    railway variables -s Postgres   (CLI linked to dev environment)"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

URL="${DATABASE_URL:-}"
if [[ -z "$URL" ]]; then
  echo "DATABASE_URL is not set in $ENV_FILE"
  exit 1
fi

DEV_HOST="$(echo "$URL" | sed -E 's#.*@([^/]+)/.*#\1#')"
DEV_REF="$(supabase_db_ref "$URL" || true)"

read_other_url() {
  local file="$1"
  grep -E '^DATABASE_URL=' "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

if [[ -f "$LOCAL_ENV" ]]; then
  LOCAL_URL="$(read_other_url "$LOCAL_ENV")"
  if [[ -n "$LOCAL_URL" && "$URL" == "$LOCAL_URL" ]]; then
    echo "ERROR: .env.dev.local DATABASE_URL matches .env (local)."
    echo "  Port 5556 must be Railway dev — use DATABASE_PUBLIC_URL from dev Postgres service."
    exit 1
  fi
fi

if [[ -f "$PROD_ENV" ]]; then
  PROD_URL="$(read_other_url "$PROD_ENV")"
  if [[ -n "$PROD_URL" && "$URL" == "$PROD_URL" ]]; then
    echo "ERROR: .env.dev.local DATABASE_URL matches .env.prod.local (production)."
    exit 1
  fi
fi

if [[ "$URL" == *"railway.internal"* ]]; then
  echo "ERROR: DATABASE_URL uses postgres.railway.internal — not reachable from your laptop."
  echo "  Use DATABASE_PUBLIC_URL from Railway dev Postgres (proxy.rlwy.net)."
  exit 1
fi

LOSF="$(command -v lsof 2>/dev/null || true)"
if [[ -z "$LOSF" && -x /usr/sbin/lsof ]]; then
  LOSF=/usr/sbin/lsof
fi
if [[ -n "$LOSF" ]]; then
  STALE_PID="$("$LOSF" -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  if [[ -n "$STALE_PID" ]]; then
    STALE_CMD="$(ps -p "$STALE_PID" -o args= 2>/dev/null || true)"
    echo "ERROR: Port $PORT is already in use (PID $STALE_PID)."
    echo "  Command: ${STALE_CMD:-unknown}"
    if [[ "$STALE_CMD" != *"--url"* ]]; then
      echo "  That Studio was started WITHOUT --url — it may show the wrong database."
    fi
    echo "  Stop it: kill $STALE_PID"
    echo "  Then run: npm run db:studio:dev"
    exit 1
  fi
fi

export DATABASE_URL="$URL"
FINGERPRINT="$(node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });
(async () => {
  const projects = await db.project.count({ where: { deletedAt: null } });
  console.log(projects);
  await db.\$disconnect();
})().catch(() => process.exit(1));
" 2>/dev/null || echo "?")"

echo "Prisma Studio (Railway dev) → http://localhost:$PORT"
echo "  Config: $ENV_FILE"
echo "  Host: ${DEV_HOST:-unknown}"
echo "  Supabase ref (if any): ${DEV_REF:-n/a — Railway Postgres}"
echo "  Active projects in this DB (deletedAt null): $FINGERPRINT"

cd "$ROOT"
exec npx prisma studio --port "$PORT" --url "$URL"
