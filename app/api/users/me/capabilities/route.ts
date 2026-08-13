import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { getEffectiveSession } from "@/lib/masquerade";
import { canManageForms, PERMISSIONS, hasPermissionWithOverrides } from "@/lib/permissions";
import { resolveAuthoritativeUserSession } from "@/lib/session-user-resolution";

export const dynamic = "force-dynamic";

/** GET /api/users/me/capabilities — session permission diagnostics for support. */
export async function GET() {
  const realSession = await getSession();
  if (!realSession?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let effective: Awaited<ReturnType<typeof getEffectiveSession>> = null;
  let resolved: Awaited<ReturnType<typeof resolveAuthoritativeUserSession>> | null = null;
  let dbUser: {
    id: string;
    email: string;
    status: string;
    role: { code: string; name: string };
  } | null = null;
  let dbLookupError: string | null = null;

  try {
    effective = await getEffectiveSession();
    resolved = await resolveAuthoritativeUserSession({
      id: realSession.user.id,
      email: realSession.user.email,
      role: realSession.user.role,
    });
    dbUser = await db.user.findUnique({
      where: { id: resolved.id },
      select: {
        id: true,
        email: true,
        status: true,
        role: { select: { code: true, name: true } },
      },
    });
  } catch (err) {
    console.error("[GET /api/users/me/capabilities] DB lookup failed:", err);
    dbLookupError = "Database lookup failed";
  }

  let canManageFormsDb: boolean | null = null;
  let dbPermissionCheckError: string | null = null;
  if (resolved) {
    try {
      canManageFormsDb = await hasPermissionWithOverrides(
        resolved.role,
        resolved.id,
        PERMISSIONS.MANAGE_FORMS,
        db
      );
    } catch (err) {
      console.error("[GET /api/users/me/capabilities] Permission check failed:", err);
      dbPermissionCheckError = "Permission check failed";
    }
  }

  return NextResponse.json({
    jwtRole: realSession.user.role,
    dbRole: dbUser?.role.code ?? resolved?.role ?? null,
    dbRoleName: dbUser?.role.name ?? null,
    effectiveRole: effective?.user.role ?? null,
    rolePreview: effective?.rolePreview ?? null,
    masquerade: effective?.masquerade
      ? {
          targetUserId: effective.masquerade.targetUserId,
          targetUserRole: effective.masquerade.targetUserRole,
        }
      : null,
    specialPermissions: resolved?.specialPermissions ?? [],
    canManageForms: {
      fromEffectiveSession: effective
        ? canManageForms(effective.user.role, effective.user.specialPermissions)
        : false,
      fromDbAuthoritative: canManageFormsDb,
    },
    ...(dbLookupError ? { dbLookupError } : {}),
    ...(dbPermissionCheckError ? { dbPermissionCheckError } : {}),
    userId: resolved?.id ?? realSession.user.id,
    email: realSession.user.email,
    status: dbUser?.status ?? null,
  });
}
