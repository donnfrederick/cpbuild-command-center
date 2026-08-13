import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import { sendInviteEmail } from "@/lib/email";
import { findUserByEmailForAuth } from "@/lib/user-email";
import { createInviteSchema } from "@/lib/validations/invite";
import type { ApiError } from "@/types";
import {
  inviteActorScopeKey,
  inviteRecipientScopeKey,
  tryRecordEmailOutbound,
  INVITE_EMAIL_ACTOR_WINDOW_MS,
  INVITE_EMAIL_ACTOR_MAX,
  INVITE_EMAIL_RECIPIENT_WINDOW_MS,
  INVITE_EMAIL_RECIPIENT_MAX,
  normalizedInviteEmail,
  hashForEmailSecurityLog,
  logEmailSecurityEvent,
} from "@/lib/email-outbound-rate-limit";

async function getSession() {
  const isBypass =
    process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";
  if (isBypass) {
    const admin = await db.user.findFirst({
      where: { role: { code: "ADMIN" } },
      select: { id: true, name: true, email: true },
    });
    if (admin) return { user: { id: admin.id, name: admin.name, email: admin.email, role: "ADMIN" } };
  }
  return auth();
}

// POST /api/invites — Create and send an invite (ADMIN only)
export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER, specialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json();
  const parsed = createInviteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors as Record<string, string[]> },
      { status: 422 }
    );
  }

  const { email, roleId, inviteeName } = parsed.data;
  const storedEmail = normalizedInviteEmail(email);

  // Prevent inviting an existing member
  const existingUser = await findUserByEmailForAuth(storedEmail);
  if (existingUser) {
    return NextResponse.json<ApiError>(
      { error: "A user with this email already exists" },
      { status: 409 }
    );
  }

  // Prevent duplicate pending invites (raw SQL to avoid Prisma column resolution issue)
  const existing = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Invite"
    WHERE "email" = ${storedEmail} AND "acceptedAt" IS NULL AND "expiresAt" > NOW()
    LIMIT 1
  `;
  if (existing.length > 0) {
    return NextResponse.json<ApiError>(
      { error: "An active invite for this email already exists" },
      { status: 409 }
    );
  }

  // Check actor cap first — a throttled inviter must not burn the recipient's rolling-day budget.
  const inviteRl = tryRecordEmailOutbound(inviteActorScopeKey(session.user.id), {
    windowMs: INVITE_EMAIL_ACTOR_WINDOW_MS,
    max: INVITE_EMAIL_ACTOR_MAX,
  });
  if (!inviteRl.ok) {
    logEmailSecurityEvent({
      event: "invite_actor_email_throttled",
      context: "create",
      actorUserIdHash: hashForEmailSecurityLog(session.user.id),
      count: inviteRl.count,
      limit: inviteRl.limit,
    });
    return NextResponse.json<ApiError>(
      {
        error: "INVITE_EMAIL_RATE_LIMITED",
        detail: "Too many invite emails from your account. Try again later.",
      },
      { status: 429 }
    );
  }

  const recipientRl = tryRecordEmailOutbound(inviteRecipientScopeKey(storedEmail), {
    windowMs: INVITE_EMAIL_RECIPIENT_WINDOW_MS,
    max: INVITE_EMAIL_RECIPIENT_MAX,
  });
  if (!recipientRl.ok) {
    logEmailSecurityEvent({
      event: "invite_recipient_email_throttled",
      context: "create",
      recipientEmailHash: hashForEmailSecurityLog(storedEmail),
      count: recipientRl.count,
      limit: recipientRl.limit,
    });
    return NextResponse.json<ApiError>(
      {
        error: "INVITE_RECIPIENT_EMAIL_RATE_LIMITED",
        detail:
          "Too many invitation emails were sent to this address recently. Try again later or share an invite link manually.",
      },
      { status: 429 }
    );
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

  const [invite, role] = await Promise.all([
    db.invite.create({
      data: {
        email: storedEmail,
        roleId,
        expiresAt,
        sentById: session.user.id,
      },
    }),
    db.role.findUnique({ where: { id: roleId }, select: { name: true } }),
  ]);

  const baseUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/?$/, "");
  const inviteLink = `${baseUrl}/en/invite/${invite.token}`;

  // Email is best-effort — link is always returned so admin can share it manually
  let emailSent = false;
  try {
    await sendInviteEmail({
      to: storedEmail,
      inviterName: session.user.name ?? session.user.email ?? "CP Build",
      inviteeName: inviteeName?.trim() || undefined,
      roleName: role?.name ?? undefined,
      token: invite.token,
    });
    emailSent = true;
  } catch (emailError) {
    console.error("[invites] Failed to send invite email (link still usable):", emailError);
  }

  return NextResponse.json(
    { data: { id: invite.id, email: invite.email, inviteLink, emailSent } },
    { status: 201 }
  );
}

// GET /api/invites — List all invites (ADMIN only)
export async function GET() {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER, specialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await db.$queryRaw<
    Array<{
      id: string;
      email: string;
      roleId: string;
      createdAt: Date;
      expiresAt: Date;
      acceptedAt: Date | null;
      sentById: string;
    }>
  >`
    SELECT "id", "email", "roleId", "createdAt", "expiresAt", "acceptedAt", "sentById"
    FROM "Invite"
    ORDER BY "createdAt" DESC
  `;

  const roleIds = [...new Set(invites.map((i) => i.roleId))];
  const sentByIds = [...new Set(invites.map((i) => i.sentById))];
  const [roles, senders] = await Promise.all([
    roleIds.length > 0
      ? db.role.findMany({
          where: { id: { in: roleIds } },
          select: { id: true, code: true, name: true },
        })
      : [],
    sentByIds.length > 0
      ? db.user.findMany({
          where: { id: { in: sentByIds } },
          select: { id: true, name: true, email: true },
        })
      : [],
  ]);
  const roleMap = Object.fromEntries(roles.map((r) => [r.id, r]));
  const senderMap = Object.fromEntries(senders.map((s) => [s.id, s]));

  const data = invites.map((i) => ({
    id: i.id,
    email: i.email,
    roleId: i.roleId,
    role: roleMap[i.roleId]
      ? { code: roleMap[i.roleId].code, name: roleMap[i.roleId].name }
      : null,
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
    acceptedAt: i.acceptedAt?.toISOString() ?? null,
    sentBy: senderMap[i.sentById]
      ? { name: senderMap[i.sentById].name, email: senderMap[i.sentById].email }
      : null,
  }));

  return NextResponse.json({ data });
}
