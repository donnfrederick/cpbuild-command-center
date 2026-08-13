import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS, NON_GRANTABLE_SPECIAL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import type { ApiError } from "@/types";

type Params = { params: Promise<{ id: string }> };

/** GET /api/users/[id]/special-permissions — list all grants for a user */
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  const callerSpecialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, callerSpecialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  const grants = await db.userSpecialPermission.findMany({
    where: { userId },
    select: {
      id: true,
      permission: true,
      note: true,
      grantedAt: true,
      grantedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { grantedAt: "asc" },
  });

  return NextResponse.json({ data: grants });
}

const grantSchema = z.object({
  permission: z.string().min(1, "Permission code required"),
  note: z.string().max(500).optional(),
});

/** POST /api/users/[id]/special-permissions — grant a permission to a user */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  const callerSpecialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, callerSpecialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  if (userId === session.user.id) {
    return NextResponse.json<ApiError>(
      { error: "You cannot grant special permissions to yourself" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  const body: unknown = await req.json();
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 422 }
    );
  }

  if (NON_GRANTABLE_SPECIAL_PERMISSIONS.includes(parsed.data.permission as Permission)) {
    return NextResponse.json<ApiError>(
      { error: "This permission cannot be granted via special permissions" },
      { status: 422 },
    );
  }

  // upsert — safe to re-grant (just updates the note/granter)
  const grant = await db.userSpecialPermission.upsert({
    where: { userId_permission: { userId, permission: parsed.data.permission } },
    create: {
      userId,
      permission: parsed.data.permission,
      note: parsed.data.note ?? null,
      grantedById: session.user.id,
    },
    update: {
      note: parsed.data.note ?? null,
      grantedById: session.user.id,
      grantedAt: new Date(),
    },
    select: {
      id: true,
      permission: true,
      note: true,
      grantedAt: true,
      grantedBy: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ data: grant }, { status: 201 });
}
