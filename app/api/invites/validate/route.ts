import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ApiError } from "@/types";

// GET /api/invites/validate?token=... — Validate an invite token (public)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json<ApiError>({ error: "Token is required" }, { status: 400 });
  }

  const invite = await db.invite.findUnique({
    where: { token },
    select: {
      id: true,
      email: true,
      roleId: true,
      role: { select: { code: true, name: true } },
      expiresAt: true,
      acceptedAt: true,
    },
  });

  if (!invite) {
    return NextResponse.json<ApiError>({ error: "Invalid invite token" }, { status: 404 });
  }

  if (invite.acceptedAt) {
    return NextResponse.json<ApiError>({ error: "This invite has already been used" }, { status: 410 });
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json<ApiError>({ error: "This invite has expired" }, { status: 410 });
  }

  return NextResponse.json({
    data: {
      email: invite.email,
      role: invite.role.code,
      roleName: invite.role.name,
    },
  });
}
