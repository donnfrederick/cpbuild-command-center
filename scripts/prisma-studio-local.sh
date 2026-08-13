#!/usr/bin/env bash
# Prisma Studio — DATABASE_URL from .env (port 5555). Always passes --url (never rely on a stale process).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/lib/supabase-db-ref.sh
source "$ROOT/scripts/lib/supabase-db-ref.sh"

ENV_FILE="${PRISMA_STUDIO_LOCAL_ENV:-$ROOT/.env}"
PORT="${PRISMA_STUDIO_LOCAL_PORT:-5555}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy .env.example to .env"
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

REF="$(supabase_db_ref "$URL" || true)"

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
      echo "  That Studio was started WITHOUT --url — it may show the wrong database (e.g. old prod URL)."
    fi
    echo "  Stop it: kill $STALE_PID"
    echo "  Then run: npm run db:studio"
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

echo "Prisma Studio → http://localhost:$PORT"
echo "  Source: $ENV_FILE (DATABASE_URL)"
echo "  Supabase project ref: ${REF:-unknown}"
echo "  Active projects in this DB (deletedAt null): $FINGERPRINT"
echo "  (Local app should match this count. Prod site uses Railway Postgres — different host.)"

cd "$ROOT"
exec npx prisma studio --port "$PORT" --url "$URL"
