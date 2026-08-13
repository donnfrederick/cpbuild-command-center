import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { hashToken } from "@/lib/password-reset";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;
  const tokenHash = hashToken(token);

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

  // Use a generic error message to avoid leaking whether a token ever existed
  const INVALID = NextResponse.json(
    { error: "This reset link is invalid or has expired. Please request a new one." },
    { status: 400 }
  );

  if (!record) return INVALID;
  if (record.usedAt) return INVALID; // Already used — replay attempt
  if (record.expiresAt < new Date()) return INVALID; // Expired

  const passwordHash = await bcrypt.hash(password, 12);

  // Transactional: mark token used + update password atomically
  await db.$transaction([
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        // Clear lockout state on successful password reset
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
  ]);

  return NextResponse.json({ message: "Password reset successfully. You can now sign in." });
}
