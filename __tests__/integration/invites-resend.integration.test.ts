import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resetEmailOutboundRateLimitForTests,
  inviteActorScopeKey,
  inviteRecipientScopeKey,
  tryRecordEmailOutbound,
  INVITE_EMAIL_ACTOR_MAX,
  INVITE_EMAIL_ACTOR_WINDOW_MS,
  INVITE_EMAIL_RECIPIENT_MAX,
  INVITE_EMAIL_RECIPIENT_WINDOW_MS,
} from "@/lib/email-outbound-rate-limit";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    invite: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn() }));

describe("POST /api/invites/[id]/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailOutboundRateLimitForTests();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks INVITE_MEMBER", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "User", email: "u@test.com", role: "MEMBER" },
    } as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 404 when invite not found", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe("Invite not found");
  });

  it("returns 410 when invite already accepted", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(410);
    expect(data.error).toBe("This invite has already been accepted");
  });

  it("resends invite email successfully", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { sendInviteEmail } = await import("@/lib/email");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);
    vi.mocked(sendInviteEmail).mockResolvedValueOnce(undefined);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.id).toBe("inv-123");
    expect(data.data.email).toBe("invited@test.com");
    expect(data.data.emailSent).toBe(true);
    expect(data.data.inviteLink).toContain("/en/invite/tok-abc");
    expect(sendInviteEmail).toHaveBeenCalledWith({
      to: "invited@test.com",
      inviterName: "Admin",
      token: "tok-abc",
    });
  });

  it("returns 410 when invite has expired", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: null,
      expiresAt: new Date(Date.now() - 86400000), // expired yesterday
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(410);
    expect(data.error).toBe("This invite has expired");
  });

  it("returns 200 with emailSent:false when sendInviteEmail throws (email is best-effort)", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { sendInviteEmail } = await import("@/lib/email");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);
    vi.mocked(sendInviteEmail).mockRejectedValueOnce(new Error("SMTP error"));

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    // Email failure is non-fatal — invite link is still returned so admin can share it manually
    expect(res.status).toBe(200);
    expect(data.data.emailSent).toBe(false);
    expect(data.data.inviteLink).toContain("/en/invite/tok-abc");
  });

  it("returns 429 when inviter exceeds hourly invite email cap", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const lim = { windowMs: INVITE_EMAIL_ACTOR_WINDOW_MS, max: INVITE_EMAIL_ACTOR_MAX };
    for (let i = 0; i < INVITE_EMAIL_ACTOR_MAX; i++) {
      tryRecordEmailOutbound(inviteActorScopeKey("u1"), lim);
    }

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error).toBe("INVITE_EMAIL_RATE_LIMITED");
  });

  it("returns 429 when the invitee address exceeds the rolling-day invite cap", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    const { sendInviteEmail } = await import("@/lib/email");
    const rlim = { windowMs: INVITE_EMAIL_RECIPIENT_WINDOW_MS, max: INVITE_EMAIL_RECIPIENT_MAX };
    for (let i = 0; i < INVITE_EMAIL_RECIPIENT_MAX; i++) {
      tryRecordEmailOutbound(inviteRecipientScopeKey("invited@test.com"), rlim);
    }

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "inv-123",
      email: "invited@test.com",
      token: "tok-abc",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
      sentBy: { name: "Admin", email: "a@test.com" },
    } as never);

    const { POST } = await import("@/app/api/invites/[id]/resend/route");
    const res = await POST(
      new Request("http://localhost/api/invites/inv-123/resend", { method: "POST" }),
      { params: Promise.resolve({ id: "inv-123" }) }
    );
    const data = await res.json();
    expect(res.status).toBe(429);
    expect(data.error).toBe("INVITE_RECIPIENT_EMAIL_RATE_LIMITED");
    expect(sendInviteEmail).not.toHaveBeenCalled();
  });
});
