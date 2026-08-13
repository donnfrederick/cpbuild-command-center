import { db } from "@/lib/db";

/**
 * Fetch a user's active special permissions from the database.
 *
 * Used by API routes that call `hasPermission()` with a permission that may
 * have been granted via `UserSpecialPermission` (e.g. INVITE_MEMBER granted to
 * a CONTROLS_MANAGER). Returns an empty array on DB errors so callers fail
 * safely to role-only checks.
 */
export async function fetchUserSpecialPermissions(userId: string): Promise<string[]> {
  try {
    const grants = await db.userSpecialPermission.findMany({
      where: { userId },
      select: { permission: true },
    });
    return grants.map((g) => g.permission);
  } catch {
    return [];
  }
}
