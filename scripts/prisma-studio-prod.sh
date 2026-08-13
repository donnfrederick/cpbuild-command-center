#!/usr/bin/env bash
# Prisma Studio — production database. Port 5557 (.env.prod.local).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/supabase-db-ref.sh
source "$ROOT/scripts/lib/supabase-db-ref.sh"

ENV_FILE="${PRISMA_STUDIO_PROD_ENV:-$ROOT/.env.prod.local}"
LOCAL_ENV="${PRISMA_STUDIO_LOCAL_ENV:-$ROOT/.env}"
PORT="${PRISMA_STUDIO_PROD_PORT:-5557}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "  cp .env.prod.local.example .env.prod.local"
  echo "  Paste commandcenter-prod DATABASE_URL from:"
  echo "    Railway → production → Variables → DATABASE_URL"
  echo "    or Supabase → commandcenter-prod → Settings → Database → Connection string"
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

PROD_REF="$(supabase_db_ref "$URL" || true)"

if [[ -f "$LOCAL_ENV" ]]; then
  # shellcheck disable=SC1090
  set +a
  LOCAL_URL=""
  # shellcheck disable=SC1091
  LOCAL_URL="$(grep -E '^DATABASE_URL=' "$LOCAL_ENV" | head -1 | cut -d= -f2- | tr -d '"')"
  LOCAL_REF="$(supabase_db_ref "$LOCAL_URL" || true)"
  if [[ -n "$PROD_REF" && -n "$LOCAL_REF" && "$PROD_REF" == "$LOCAL_REF" ]]; then
    echo "ERROR: .env and .env.prod.local use the SAME Supabase project ($PROD_REF)."
    echo "  Port 5557 must use commandcenter-prod (or Railway prod Postgres) — different from local .env."
    echo "  Paste production DATABASE_URL into .env.prod.local (Railway production variables)."
    exit 1
  fi
fi

if [[ "$URL" == *"railway.internal"* ]]; then
  echo "ERROR: DATABASE_URL uses postgres.railway.internal — not reachable from your laptop."
  echo "  Use DATABASE_PUBLIC_URL from Railway production Postgres (proxy.rlwy.net)."
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
    echo "  Then run: npm run db:studio:prod"
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

echo "Prisma Studio (prod) → http://localhost:$PORT"
echo "  Config: $ENV_FILE"
echo "  Supabase project ref: ${PROD_REF:-unknown}"
echo "  Active projects in this DB (deletedAt null): $FINGERPRINT"

cd "$ROOT"
exec npx prisma studio --port "$PORT" --url "$URL"
