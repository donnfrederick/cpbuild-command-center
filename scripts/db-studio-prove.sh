#!/usr/bin/env bash
# Fingerprint DATABASE_URL from a file (row counts + ref) — no secrets printed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-$ROOT/.env}"
KEY="${2:-DATABASE_URL}"

# shellcheck source=scripts/lib/supabase-db-ref.sh
source "$ROOT/scripts/lib/supabase-db-ref.sh"

URL="$(grep -E "^${KEY}=" "$FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$URL" ]]; then
  echo "No ${KEY} in $FILE"
  exit 1
fi

REF="$(supabase_db_ref "$URL" || echo unknown)"
HOST="$(echo "$URL" | sed -E 's#.*@([^/]+)/.*#\1#')"

export DATABASE_URL="$URL"
cd "$ROOT"
node -e "
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });
(async () => {
  const [projects, clearInsp, users] = await Promise.all([
    db.project.count({ where: { deletedAt: null } }),
    db.clearInspection.count(),
    db.user.count(),
  ]);
  console.log(JSON.stringify({ projects, clearInspections: clearInsp, users }, null, 2));
  await db.\$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
" 2>/dev/null

echo "File: $FILE"
echo "Key: $KEY"
echo "Supabase ref: $REF"
echo "Host: $HOST"
