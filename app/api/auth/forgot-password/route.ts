import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { findUserByEmailForAuth } from "@/lib/user-email";
import {
  generateResetToken,
  hashToken,
  RESET_TOKEN_EXPIRY_MS,
  MAX_RESETS_PER_HOUR,
} from "@/lib/password-reset";
import {
  forgotPasswordIpScopeKey,
  tryRecordEmailOutbound,
  FORGOT_PASSWORD_IP_WINDOW_MS,
  FORGOT_PASSWORD_IP_MAX,
  hashForEmailSecurityLog,
  logEmailSecurityEvent,
} from "@/lib/email-outbound-rate-limit";
import { getClientIpFromHeaders } from "@/lib/request-client-ip";

// Always return the same message regardless of whether the email exists.
// This prevents user enumeration (attacker cannot learn which emails are registered).
// Returns a new Response instance each time — Response bodies are single-read streams.
function alwaysOk() {
  return NextResponse.json(
    { message: "If that email is registered, a reset link has been sent." },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { email } = parsed.data;

  const ipRl = tryRecordEmailOutbound(forgotPasswordIpScopeKey(request.headers), {
    windowMs: FORGOT_PASSWORD_IP_WINDOW_MS,
    max: FORGOT_PASSWORD_IP_MAX,
  });
  if (!ipRl.ok) {
    logEmailSecurityEvent({
      event: "forgot_password_ip_throttled",
      clientIpHash: hashForEmailSecurityLog(getClientIpFromHeaders(request.headers)),
      count: ipRl.count,
      limit: ipRl.limit,
    });
    return alwaysOk();
  }

  const user = await findUserByEmailForAuth(email);
  // Return identical response even when user doesn't exist
  if (!user || !user.passwordHash) return alwaysOk();

  // Rate limit: max MAX_RESETS_PER_HOUR reset requests per email per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await db.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= MAX_RESETS_PER_HOUR) {
    logEmailSecurityEvent({
      event: "forgot_password_target_email_throttled",
      emailParamHash: hashForEmailSecurityLog(email.trim().toLowerCase()),
      userIdHash: hashForEmailSecurityLog(user.id),
      recentCount,
      limit: MAX_RESETS_PER_HOUR,
    });
    return alwaysOk();
  }

  // Invalidate all prior unused tokens for this user to enforce single active token
  await db.passwordResetToken.deleteMany({
    where: { userId: user.id, usedAt: null },
  });

  // Generate token, store hash
  const plaintext = generateResetToken();
  const tokenHash = hashToken(plaintext);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  // Fire-and-forget email — never let a send failure expose the user's existence
  sendPasswordResetEmail({ to: user.email, token: plaintext }).catch((err) =>
    console.error("[forgot-password] Email send failed:", err)
  );

  return alwaysOk();
}
