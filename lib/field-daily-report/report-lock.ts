import type { Prisma } from "@prisma/client";

/** Stable advisory-lock input for one IM + calendar day report header. */
export function fieldDailyReportLockInput(
  installManagerUserId: string,
  reportDate: string,
): string {
  // Must not contain NUL — PostgreSQL hashtext() rejects UTF-8 0x00 (error 22021).
  return `field-daily:${installManagerUserId}:${reportDate}`;
}

/**
 * Serialize global and per-project generate for the same (IM, date) pair.
 * Lock is transaction-scoped — released on commit/rollback.
 */
export async function acquireFieldDailyReportLock(
  tx: Prisma.TransactionClient,
  installManagerUserId: string,
  reportDate: string,
): Promise<void> {
  const lockKey = fieldDailyReportLockInput(installManagerUserId, reportDate);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}
