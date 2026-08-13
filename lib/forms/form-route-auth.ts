import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, hasPermissionWithOverrides, PERMISSIONS } from "@/lib/permissions";

/**
 * Authorize form create/update/publish/delete mutations.
 *
 * Role preview overlays the effective session for UI, but must NOT gate writes —
 * see lib/role-preview.ts ("API routes using getSession() always see the real role").
 * Masquerade still uses the target user's permissions (intentional).
 *
 * getEffectiveSession() already resolves id/role/specialPermissions from DB when no
 * overlay is active, and sets rolePreview.realRole when preview is active — no second
 * user-table lookup is needed here.
 */
export async function authorizeFormMutation(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const effective = await getEffectiveSession();
  if (!effective?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (effective.masquerade) {
    const canManageForms = hasPermission(
      effective.user.role,
      PERMISSIONS.MANAGE_FORMS,
      effective.user.specialPermissions
    );
    if (!canManageForms) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      };
    }
    return { ok: true, userId: effective.user.id };
  }

  const authRole = effective.rolePreview?.realRole ?? effective.user.role;
  const userId = effective.user.id;

  let canManageForms: boolean;
  try {
    canManageForms = await hasPermissionWithOverrides(
      authRole,
      userId,
      PERMISSIONS.MANAGE_FORMS,
      db
    );
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Permission check temporarily unavailable" },
        { status: 503 }
      ),
    };
  }

  if (!canManageForms) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, userId };
}
