import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import type { ApiError } from "@/types";

const updateTeamMemberSchema = z
  .object({
    roleId: z.string().min(1, "Role is required").optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((d) => d.roleId !== undefined || d.status !== undefined, {
    message: "Provide at least one of roleId or status",
  });

// PATCH /api/team/[id] — Update a member's role or status (MANAGE_ROLES required)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const callerSpecialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, callerSpecialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json<ApiError>(
      { error: "You cannot change your own role or status" },
      { status: 400 }
    );
  }

  const body: unknown = await request.json();
  const parsed = updateTeamMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 422 }
    );
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  const updateData: { roleId?: string; status?: "ACTIVE" | "INACTIVE" | "SUSPENDED" } = {};
  if (parsed.data.roleId !== undefined) updateData.roleId = parsed.data.roleId;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

  const updated = await db.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      status: true,
      role: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role.code,
      roleName: updated.role.name,
      status: updated.status,
    },
  });
}

// DELETE /api/team/[id] — Remove a team member (ADMIN only)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.REMOVE_MEMBER)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json<ApiError>(
      { error: "You cannot remove yourself" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  await db.user.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
