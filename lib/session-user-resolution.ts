import { db } from "@/lib/db";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";

/** Normalize legacy JWT / DB role codes. */
export function normalizeSessionRoleCode(roleCode: string): string {
  return roleCode === "SUPER_ADMIN" ? "ADMIN" : roleCode;
}

/**
 * Resolve the authoritative user id + role from the database on every request.
 *
 * JWT role is minted at sign-in only (see lib/auth.ts). Special permissions
 * were already refreshed per request; role must follow the same pattern so
 * role changes (e.g. promoting someone to ADMIN) take effect after refresh
 * without forcing a sign-out.
 */
export async function resolveAuthoritativeUserSession(jwtUser: {
  id: string;
  email: string;
  role: string;
}): Promise<{ id: string; role: string; specialPermissions: string[] }> {
  let resolvedId = jwtUser.id;
  let resolvedRole = normalizeSessionRoleCode(jwtUser.role);

  try {
    let dbUser = await db.user.findUnique({
      where: { id: resolvedId },
      select: { id: true, role: { select: { code: true } } },
    });

    if (!dbUser && jwtUser.email) {
      dbUser = await db.user.findFirst({
        where: { email: { equals: jwtUser.email.trim(), mode: "insensitive" } },
        select: { id: true, role: { select: { code: true } } },
      });
    }

    if (dbUser) {
      resolvedId = dbUser.id;
      resolvedRole = normalizeSessionRoleCode(dbUser.role.code);
    }
  } catch {
    // DB unavailable — fall back to JWT fields below
  }

  const specialPermissions = await fetchUserSpecialPermissions(resolvedId);

  return { id: resolvedId, role: resolvedRole, specialPermissions };
}
