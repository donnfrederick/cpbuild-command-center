import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Normalize for lookup and new invite storage — lowercase, trimmed. */
export function normalizeUserEmail(email: string): string {
  return email.trim().toLowerCase();
}

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

/**
 * Login and forgot-password lookup: exact match first, then case-insensitive.
 * Supports legacy rows created before invite emails were normalized.
 */
export async function findUserByEmailForAuth(email: string): Promise<UserWithRole | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const exact = await db.user.findUnique({
    where: { email: trimmed },
    include: { role: true },
  });
  if (exact) return exact;

  return db.user.findFirst({
    where: { email: { equals: trimmed, mode: "insensitive" } },
    include: { role: true },
  });
}
