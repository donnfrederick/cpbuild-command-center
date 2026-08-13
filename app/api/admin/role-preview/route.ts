import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getSession } from "@/lib/dev-session";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  signRolePreviewCookie,
  buildRolePreviewCookieHeader,
  clearRolePreviewCookieHeader,
  type RolePreviewPayload,
} from "@/lib/role-preview";

const startPreviewSchema = z.object({
  previewRole: z.string().min(1).max(40),
});

/**
 * POST /api/admin/role-preview
 * Start a role preview session — overlays the given role on the current user's
 * effective session for UI rendering purposes only.
 * Requires PREVIEW_ROLE permission (ADMIN, DESIGNER, DEVELOPER).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.PREVIEW_ROLE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const result = startPreviewSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const { previewRole } = result.data;

  const roleRow = await db.role.findUnique({ where: { code: previewRole }, select: { id: true } });
  if (!roleRow) {
    return NextResponse.json({ error: "Unknown role code" }, { status: 400 });
  }

  // Selecting own role clears the preview rather than setting it
  if (previewRole === session.user.role) {
    const clearResponse = NextResponse.json({ cleared: true }, { status: 200 });
    clearResponse.headers.set("Set-Cookie", clearRolePreviewCookieHeader());
    return clearResponse;
  }

  const payload: RolePreviewPayload = {
    actorId: session.user.id,
    previewRole,
    iat: Math.floor(Date.now() / 1000),
  };

  const signedCookie = await signRolePreviewCookie(payload);

  const response = NextResponse.json(
    { previewRole, realRole: session.user.role },
    { status: 201 }
  );

  response.headers.set("Set-Cookie", buildRolePreviewCookieHeader(signedCookie));
  return response;
}

/**
 * DELETE /api/admin/role-preview
 * End the active role preview session and return to the real role.
 * Requires PREVIEW_ROLE permission.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.PREVIEW_ROLE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  response.headers.set("Set-Cookie", clearRolePreviewCookieHeader());
  return response;
}
