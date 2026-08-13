/**
 * Bootstrap BI Reader Grants
 *
 * Idempotent script that re-applies the read-only grants for the `bi_reader`
 * role on every container start. Ensures new tables added via future
 * migrations remain visible to the BI analyst even when the deploy role
 * differs from whoever runs subsequent migrations (in which case
 * ALTER DEFAULT PRIVILEGES will not cover those new tables).
 *
 * PREREQUISITE — one-time setup:
 *   The `bi_reader` role itself must already exist. CREATE ROLE requires
 *   superuser privileges that the Railway app role does not have, so it is
 *   created manually once per environment via Supabase SQL Editor using
 *   `scripts/create-bi-reader.sql`. This bootstrap only re-applies the
 *   schema/table grants that the table-owning role can re-issue safely.
 *
 * WHY THIS EXISTS:
 *   Without this script, a new table added by a migration is owned by whichever
 *   role ran `prisma migrate deploy` and is invisible to `bi_reader` until
 *   grants are manually re-run. Running this on every deploy makes deploying
 *   the sync mechanism — no manual SQL after new tables ship.
 *
 * SAFETY:
 *   - Exits 0 even if individual grants fail (e.g. role doesn't exist, or the
 *     app role doesn't own the table). Failures are logged as warnings so
 *     they surface in deploy logs without blocking the container from booting.
 *   - Revokes on sensitive tables (`Session`, `Account`,
 *     `VerificationToken`, `password_reset_tokens`) are re-applied every run.
 *   - `"User"` gets column-level SELECT (all columns except `passwordHash`).
 *
 * Usage:
 *   npm run bootstrap:bi-reader-grants
 */

import "dotenv/config";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Tables that must never be readable by `bi_reader`. These hold credentials,
 * session tokens, and auth artefacts that have no BI value. Keep in sync
 * with `scripts/create-bi-reader.sql`.
 *
 * Note: `"User"` is NOT in this list — bi_reader gets column-level SELECT
 * on all User columns except passwordHash (see USER_SELECT_COLUMNS).
 */
export const SENSITIVE_TABLES = [
  '"Session"',
  '"Account"',
  '"VerificationToken"',
  "password_reset_tokens",
] as const;

/**
 * Columns on `"User"` exposed to bi_reader. passwordHash is excluded.
 * Keep in sync with `scripts/create-bi-reader.sql`.
 */
export const USER_SELECT_COLUMNS = [
  "id",
  "email",
  '"emailVerified"',
  "name",
  "image",
  '"roleId"',
  "status",
  '"failedLoginAttempts"',
  '"lockedUntil"',
  '"lastLoginAt"',
  '"createdAt"',
  '"updatedAt"',
  '"unifierUserId"',
  '"unifierUsername"',
  '"agentName"',
  '"agentCallsign"',
  '"agentMission"',
] as const;

/**
 * Minimal Prisma surface needed by `applyBiReaderGrants`. Keeps the function
 * testable without requiring a full PrismaClient in unit tests.
 */
export interface SqlRunner {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
}

type ExecResult = { ok: boolean; error?: string };

function formatExecError(err: unknown): string {
  if (!(err instanceof Error)) {
    return JSON.stringify(err);
  }
  const parts: string[] = [err.message];
  const withCode = err as Error & { code?: string; meta?: unknown };
  if (withCode.code) parts.push(`code=${withCode.code}`);
  if (withCode.meta !== undefined) {
    parts.push(`meta=${JSON.stringify(withCode.meta)}`);
  }
  try {
    const serialized = JSON.stringify(err, Object.getOwnPropertyNames(err));
    if (serialized && serialized !== "{}") parts.push(serialized);
  } catch {
    // ignore circular refs
  }
  return parts.filter(Boolean).join(" | ");
}

async function tryExec(prisma: SqlRunner, sql: string, label: string): Promise<ExecResult> {
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log(`[bootstrap:bi-reader-grants] ✓ ${label}`);
    return { ok: true };
  } catch (err) {
    const msg = formatExecError(err);
    console.warn(`[bootstrap:bi-reader-grants] ⚠ ${label} failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

export interface GrantsResult {
  skipped: boolean;
  failures: number;
}

/**
 * Core logic — exported so unit tests can invoke it with a mocked Prisma.
 * Returns the number of failed steps so callers can report meaningfully.
 */
export async function applyBiReaderGrants(prisma: SqlRunner): Promise<GrantsResult> {
  const roleRows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_reader') AS exists`
  );
  const roleExists = Boolean(roleRows[0]?.exists);

  if (!roleExists) {
    console.log(
      "[bootstrap:bi-reader-grants] bi_reader role does not exist in this database — skipping. " +
        "Create it once via Supabase SQL Editor using scripts/create-bi-reader.sql before re-running."
    );
    return { skipped: true, failures: 0 };
  }

  console.log("[bootstrap:bi-reader-grants] bi_reader role found — re-aplying grants...");

  let failures = 0;

  const steps: Array<{ sql: string; label: string }> = [
    { sql: `GRANT USAGE ON SCHEMA public TO bi_reader`, label: "GRANT USAGE ON SCHEMA public" },
    {
      sql: `GRANT SELECT ON ALL TABLES IN SCHEMA public TO bi_reader`,
      label: "GRANT SELECT ON ALL TABLES",
    },
    {
      sql: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO bi_reader`,
      label: "ALTER DEFAULT PRIVILEGES (future tables)",
    },
  ];

  for (const step of steps) {
    const result = await tryExec(prisma, step.sql, step.label);
    if (!result.ok) failures += 1;
  }

  for (const table of SENSITIVE_TABLES) {
    const result = await tryExec(
      prisma,
      `REVOKE SELECT ON ${table} FROM bi_reader`,
      `REVOKE SELECT ON ${table}`
    );
    // Table-may-not-exist errors are OK — they mean nothing to revoke yet.
    if (!result.ok && !/does not exist/i.test(result.error ?? "")) failures += 1;
  }

  // Column-level access on "User" — full table revoke then grant safe columns only.
  const userRevoke = await tryExec(
    prisma,
    `REVOKE SELECT ON "User" FROM bi_reader`,
    'REVOKE SELECT ON "User" (table-level)'
  );
  if (!userRevoke.ok && !/does not exist/i.test(userRevoke.error ?? "")) failures += 1;

  const columnList = USER_SELECT_COLUMNS.join(", ");
  const userGrant = await tryExec(
    prisma,
    `GRANT SELECT (${columnList}) ON "User" TO bi_reader`,
    'GRANT SELECT (columns) ON "User"'
  );
  if (!userGrant.ok) failures += 1;

  // Drop legacy view if it exists from older bootstrap runs.
  const dropView = await tryExec(
    prisma,
    `DROP VIEW IF EXISTS user_public_info`,
    "DROP VIEW IF EXISTS user_public_info"
  );
  if (!dropView.ok) failures += 1;

  if (failures === 0) {
    console.log("[bootstrap:bi-reader-grants] Done — all grants applied cleanly.");
  } else {
    console.warn(
      `[bootstrap:bi-reader-grants] Done — ${failures} step(s) reported warnings. ` +
        `Deploy will continue, but verify bi_reader visibility once container is up.`
    );
  }

  return { skipped: false, failures };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[bootstrap:bi-reader-grants] DATABASE_URL is not set — skipping.");
    process.exit(0);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await applyBiReaderGrants(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run main() when executed directly as a CLI — not when imported by tests.
if (typeof process !== "undefined" && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(
      "[bootstrap:bi-reader-grants] Unexpected error (non-fatal):",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(0);
  });
}
