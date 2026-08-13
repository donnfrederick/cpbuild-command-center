import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import type { ApiError } from "@/types";

type Params = { params: Promise<{ id: string }> };

// DELETE /api/invites/[id] — Delete a pending invite.
// Allowed by: the user who sent the invite, or any user with INVITE_MEMBER permission (admins).
export async function DELETE(_req: Request, { params }: Params) {
  const effective = await getEffectiveSession();

  if (!effective?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(effective.user.role, PERMISSIONS.INVITE_MEMBER, effective.user.specialPermissions)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const invite = await db.invite.findUnique({
    where: { id },
    select: { id: true, email: true, acceptedAt: true, sentById: true },
  });

  if (!invite) {
    return NextResponse.json<ApiError>({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.acceptedAt) {
    return NextResponse.json<ApiError>(
      { error: "This invite has already been accepted and cannot be deleted" },
      { status: 409 }
    );
  }

  await db.invite.delete({ where: { id } });

  return NextResponse.json({ data: { deleted: true, email: invite.email } });
}
