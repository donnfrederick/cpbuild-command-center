import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import {
  signMasqueradeCookie,
  parseMasqueradeCookie,
  buildMasqueradeCookieHeader,
  clearMasqueradeCookieHeader,
  MASQUERADE_COOKIE,
  type MasqueradePayload,
} from "@/lib/masquerade";
import { cookies } from "next/headers";

const startSchema = z.object({
  targetUserId: z.string().min(1),
});

/**
 * POST /api/admin/masquerade
 * Start a masquerade session as the target user.
 * Requires MASQUERADE_USER permission (ADMIN only).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPermission(session.user.role, PERMISSIONS.MASQUERADE_USER)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Reject if already masquerading — must exit first
  const jar = await cookies();
  const existingCookie = jar.get(MASQUERADE_COOKIE)?.value;
  if (existingCookie) {
    const existing = await parseMasqueradeCookie(existingCookie);
    if (existing && existing.actorId === session.user.id) {
      return NextResponse.json(
        { error: "Already masquerading. Exit the current session first." },
        { status: 409 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const result = startSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 });
  }

  const { targetUserId } = result.data;

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: "Cannot masquerade as yourself" }, { status: 400 });
  }

  const targetUser = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, name: true, role: { select: { code: true } } },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Create audit log entry — skipped in dev-bypass mode because the fake
  // "dev-user" ID has no corresponding row in the users table (FK constraint).
  const isDevBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  let logId: string;
  if (isDevBypass) {
    logId = crypto.randomUUID();
  } else {
    const log = await db.masqueradeLog.create({
      data: { actorId: session.user.id, targetUserId },
    });
    logId = log.id;
  }

  const payload: MasqueradePayload = {
    actorId: session.user.id,
    targetUserId,
    logId,
    iat: Math.floor(Date.now() / 1000),
  };

  const signedCookie = await signMasqueradeCookie(payload);

  const response = NextResponse.json(
    {
      logId,
      targetUser: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role.code,
      },
    },
    { status: 201 }
  );

  response.headers.set("Set-Cookie", buildMasqueradeCookieHeader(signedCookie));
  return response;
}

/**
 * DELETE /api/admin/masquerade
 * End the active masquerade session.
 */
export async function DELETE() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const cookieValue = jar.get(MASQUERADE_COOKIE)?.value;

  if (cookieValue) {
    const payload = await parseMasqueradeCookie(cookieValue);
    if (payload && payload.actorId === session.user.id) {
      // Update audit log with end time
      await db.masqueradeLog
        .update({
          where: { id: payload.logId },
          data: { endedAt: new Date() },
        })
        .catch(() => {
          // If the log row was deleted (e.g. user deleted) just ignore
        });
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  response.headers.set("Set-Cookie", clearMasqueradeCookieHeader());
  return response;
}
