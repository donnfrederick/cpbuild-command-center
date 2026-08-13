#!/bin/bash
# Railway container startup script.
# Called by railway.json startCommand: bash scripts/railway-start.sh
#
# Uses explicit steps with timeout so prisma migrate deploy can never hang
# the container forever. If it times out, we skip it and start the app anyway
# (safe since we know pending migrations are rare and should be handled via CI).

set -e

# One-time: mark the 20260401 migration as rolled-back so migrate deploy retries it.
# Set ROLLBACK_FAILED_MIGRATION=1 in Railway dev, then remove after successful deploy.
if [ "${ROLLBACK_FAILED_MIGRATION:-0}" = "1" ]; then
  echo "[railway-start] Step 0a: marking failed migration as rolled-back (15s timeout)..."
  if timeout 15 npx prisma migrate resolve --rolled-back 20260401000000_ensure_activity_logs_exists 2>&1; then
    echo "[railway-start] Step 0a: done — migrate deploy will retry it."
  else
    EXIT=$?
    if [ $EXIT -eq 124 ]; then
      echo "[railway-start] Step 0a: timed out after 15s — skipping and continuing."
    else
      echo "[railway-start] Step 0a: resolve failed (exit $EXIT; may not exist or already resolved) — continuing."
    fi
  fi
fi

# One-time: re-apply checksum for 20260331160000_activity_log after fixing the
# "projects" → "Project" typo in that migration file. Without this, Prisma's
# checksum validation would fail on the corrected file.
if [ "${FIX_ORIGINAL_CHECKSUM:-0}" = "1" ]; then
  echo "[railway-start] Step 0b: re-registering corrected migration checksum (15s timeout)..."
  if timeout 15 npx prisma migrate resolve --applied 20260331160000_activity_log 2>&1; then
    echo "[railway-start] Step 0b: checksum updated."
  else
    EXIT=$?
    if [ $EXIT -eq 124 ]; then
      echo "[railway-start] Step 0b: timed out after 15s — skipping and continuing."
    else
      echo "[railway-start] Step 0b: resolve failed (exit $EXIT) — continuing."
    fi
  fi
fi

# One-time: mark the 20260430120000 migration as rolled-back so migrate deploy
# retries it with the fixed (idempotent) SQL that includes CREATE TABLE IF NOT EXISTS.
# Set ROLLBACK_SUBMISSION_SOURCE_MIGRATION=1 in Railway env, then remove after deploy.
if [ "${ROLLBACK_SUBMISSION_SOURCE_MIGRATION:-0}" = "1" ]; then
  echo "[railway-start] Step 0c: marking failed submission-source migration as rolled-back (15s timeout)..."
  if timeout 15 npx prisma migrate resolve --rolled-back 20260430120000_add_submission_source_backfill 2>&1; then
    echo "[railway-start] Step 0c: done — migrate deploy will retry it."
  else
    EXIT=$?
    if [ $EXIT -eq 124 ]; then
      echo "[railway-start] Step 0c: timed out after 15s — skipping and continuing."
    else
      echo "[railway-start] Step 0c: resolve failed (exit $EXIT; may not exist or already resolved) — continuing."
    fi
  fi
fi

# One-time: mark the failed inspection FK migration as rolled-back so migrate deploy
# can retry after RUN_INSPECTION_REPORTING_BACKFILL=1 backfill completes.
# Set ROLLBACK_INSPECTION_FK_MIGRATION=1 in Railway dev, then remove after deploy.
if [ "${ROLLBACK_INSPECTION_FK_MIGRATION:-0}" = "1" ]; then
  echo "[railway-start] Step 0c2: marking failed inspection FK migration as rolled-back (15s timeout)..."
  if timeout 15 npx prisma migrate resolve --rolled-back 20260523140000_inspection_form_fk_constraints 2>&1; then
    echo "[railway-start] Step 0c2: done — migrate deploy will retry it after backfill."
  else
    EXIT=$?
    if [ $EXIT -eq 124 ]; then
      echo "[railway-start] Step 0c2: timed out after 15s — skipping and continuing."
    else
      echo "[railway-start] Step 0c2: resolve failed (exit $EXIT; may not exist or already resolved) — continuing."
    fi
  fi
fi

if [ "${RUN_INSPECTION_REPORTING_BACKFILL:-0}" = "1" ]; then
  echo "[railway-start] Step 0d: backfilling inspection reporting tables BEFORE migrate (one-time FK gate)..."
  if timeout 300 npm run backfill:inspection-reporting; then
    echo "[railway-start] Step 0d: inspection reporting backfill OK"
  else
    EXIT=$?
    echo "[railway-start] Step 0d: inspection reporting backfill failed or timed out (exit $EXIT)"
    exit "$EXIT"
  fi

  echo "[railway-start] Step 0e: verifying inspection reporting backfill..."
  if npm run verify:inspection-reporting-backfill; then
    echo "[railway-start] Step 0e: inspection reporting verify OK"
  else
    EXIT=$?
    echo "[railway-start] Step 0e: inspection reporting verify FAILED (exit $EXIT)"
    exit "$EXIT"
  fi
fi

echo "[railway-start] Step 1: deploying pending migrations (90s timeout)..."
if timeout 90 npx prisma migrate deploy; then
  echo "[railway-start] migrate deploy OK"
else
  EXIT=$?
  if [ $EXIT -eq 124 ]; then
    echo "[railway-start] FATAL: migrate deploy timed out after 90s — aborting container boot so Railway keeps old container alive"
  else
    echo "[railway-start] FATAL: migrate deploy failed (exit $EXIT) — aborting container boot so Railway keeps old container alive"
  fi
  # Exiting non-zero here causes Railway to:
  #   1. Fail this container's health check
  #   2. Keep the previous healthy container serving traffic
  #   3. Retry up to restartPolicyMaxRetries times
  # This prevents users from ever hitting a live app with unapplied migrations.
  exit 1
fi

# ── Idempotent data bootstrapping ─────────────────────────────────────────────
# RULE: Migrations own schema (DDL). Bootstrap scripts own reference/seed data
# (DML — rows that must exist in every environment). If it is not called here,
# it does not exist in any deployed environment, regardless of what runs locally.
#
# Every script called in this block MUST be idempotent (safe to re-run on every
# container start). When adding a new bootstrap script, add a step here in the
# same PR — never as a follow-up or a manual one-off.
# ──────────────────────────────────────────────────────────────────────────────

echo "[railway-start] Step 2: bootstrapping roles (idempotent)..."
npm run bootstrap:roles

echo "[railway-start] Step 2a: bootstrapping permissions (idempotent)..."
npm run bootstrap:permissions

echo "[railway-start] Step 2a2: bootstrapping role permissions (idempotent)..."
npm run bootstrap:role-permissions

echo "[railway-start] Step 2b: bootstrapping inspection types (idempotent)..."
npm run bootstrap:inspection-types

echo "[railway-start] Step 2b2: bootstrapping issue catalog (idempotent)..."
npm run bootstrap:issue-catalog

echo "[railway-start] Step 2b3: bootstrapping observation catalog (idempotent)..."
npm run bootstrap:observation-catalog

echo "[railway-start] Step 2c: bootstrapping admin user..."
npm run bootstrap:admin

echo "[railway-start] Step 2d: bootstrapping test media pool + test subcontractor (idempotent)..."
npm run bootstrap:test-media

# Re-apply bi_reader grants so new tables added by migrations stay visible to
# the BI analyst. Skips cleanly if the role does not exist; logs warnings
# rather than failing the deploy if individual grants can't be re-issued.
echo "[railway-start] Step 2e: re-applying BI reader grants (idempotent)..."
npm run bootstrap:bi-reader-grants

echo "[railway-start] Step 2e2: bootstrapping app announcements (idempotent)..."
npm run bootstrap:app-announcements

if [ "${RUN_INSPECTION_REPORTING_BACKFILL:-0}" = "1" ]; then
  echo "[railway-start] Step 2f: inspection reporting backfill already ran pre-migrate (Step 0d)"
else
  echo "[railway-start] Step 2f: inspection reporting backfill skipped (set RUN_INSPECTION_REPORTING_BACKFILL=1 for one-time pre-migrate run on dev)"
fi

echo "[railway-start] Step 3: starting Next.js..."

exec npm run start
