import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import { generateResetToken, hashToken, ADMIN_RESET_EXPIRY_MS } from "@/lib/password-reset";
import type { ApiError } from "@/types";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/users/[id]/generate-reset-link
 *
 * Admin-only: invalidates all prior unused tokens for the target user, then
 * creates a new PasswordResetToken with 72-hour expiry (same as self-service email).
 * Returns the plaintext token so the client can build the full reset URL without a separate email step.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }
  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.MANAGE_ROLES, specialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  if (userId === session.user.id) {
    return NextResponse.json<ApiError>(
      { error: "You cannot generate a reset link for yourself" },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "User not found" }, { status: 404 });
  }

  // Invalidate all prior unused tokens (mirrors the self-service forgot-password flow).
  await db.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });

  const plaintext = generateResetToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + ADMIN_RESET_EXPIRY_MS);

  await db.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } });

  return NextResponse.json(
    { token: plaintext, name: user.name, email: user.email },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
