import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import { sendInviteEmail } from "@/lib/email";
import { isDevToolsAllowed } from "@/lib/devtools-env";
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

// POST /api/invites/[id]/resend — Resend invite email (requires INVITE_MEMBER permission)
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Unauthorized" }, { status: 401 });
  }

  const specialPerms = await fetchUserSpecialPermissions(session.user.id);
  if (!hasPermission(session.user.role, PERMISSIONS.INVITE_MEMBER, specialPerms)) {
    return NextResponse.json<ApiError>({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const invite = await db.invite.findUnique({
    where: { id },
    include: {
      sentBy: { select: { name: true, email: true } },
      role: { select: { name: true } },
    },
  });

  if (!invite) {
    return NextResponse.json<ApiError>({ error: "Invite not found" }, { status: 404 });
  }

  if (invite.acceptedAt) {
    return NextResponse.json<ApiError>(
      { error: "This invite has already been accepted" },
      { status: 410 }
    );
  }

  if (invite.expiresAt < new Date()) {
    return NextResponse.json<ApiError>(
      { error: "This invite has expired" },
      { status: 410 }
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
      context: "resend",
      inviteId: id,
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

  const recipientRl = tryRecordEmailOutbound(inviteRecipientScopeKey(invite.email), {
    windowMs: INVITE_EMAIL_RECIPIENT_WINDOW_MS,
    max: INVITE_EMAIL_RECIPIENT_MAX,
  });
  if (!recipientRl.ok) {
    logEmailSecurityEvent({
      event: "invite_recipient_email_throttled",
      context: "resend",
      inviteId: id,
      recipientEmailHash: hashForEmailSecurityLog(normalizedInviteEmail(invite.email)),
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

  const inviterName = invite.sentBy?.name ?? invite.sentBy?.email ?? session.user.name ?? session.user.email ?? "CP Build";

  const baseUrl = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/?$/, "");
  const inviteLink = `${baseUrl}/en/invite/${invite.token}`;

  // Email is best-effort — link is always returned so admin can share it manually
  let emailSent = false;
  try {
    await sendInviteEmail({
      to: invite.email,
      inviterName,
      roleName: invite.role?.name ?? undefined,
      token: invite.token,
    });
    emailSent = true;
  } catch (emailError) {
    const message = emailError instanceof Error ? emailError.message : String(emailError);
    console.error("[invites] Failed to resend invite email (link still usable):", emailError);
    if (isDevToolsAllowed()) console.error("[invites] detail:", message);
  }

  return NextResponse.json({ data: { id: invite.id, email: invite.email, inviteLink, emailSent } }, { status: 200 });
}
