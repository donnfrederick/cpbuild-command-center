#!/usr/bin/env bash
# Create/apply migrations in dev — blocked when target matches .env.prod.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npx tsx scripts/guard-migrate-target-cli.ts
exec npx prisma migrate dev "$@"
