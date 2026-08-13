#!/usr/bin/env bash
# Apply pending migrations — blocked when DATABASE_URL/DIRECT_URL matches .env.prod.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx tsx scripts/guard-migrate-target-cli.ts
exec npx prisma migrate deploy "$@"
