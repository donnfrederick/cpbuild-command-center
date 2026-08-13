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
    user: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    invite: { create: vi.fn() },
    role: { findMany: vi.fn(), findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/email", () => ({ sendInviteEmail: vi.fn() }));

describe("POST /api/invites", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resetEmailOutboundRateLimitForTests();
    process.env.DEV_BYPASS_AUTH = "false";
    const { db } = await import("@/lib/db");
    vi.mocked(db.user.findFirst).mockResolvedValue(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", roleId: "role-123" }),
      })
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

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", roleId: "role-123" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 422 when validation fails", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "invalid-email", roleId: "role-123" }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 409 when user already exists", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({
      id: "existing",
      email: "new@test.com",
    } as never);

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", roleId: "role-123" }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain("already exists");
  });

  it("returns 201 when invite created", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([] as never);
    vi.mocked(db.invite.create).mockResolvedValueOnce({
      id: "inv-1",
      email: "new@test.com",
      token: "tok-123",
    } as never);
    vi.mocked(db.role.findUnique).mockResolvedValueOnce({ name: "Member" } as never);

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", roleId: "role-123" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.email).toBe("new@test.com");
    expect(body.data.id).toBe("inv-1");
  });

  it("returns 429 when inviter exceeds hourly invite email cap", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.$queryRaw).mockResolvedValue([] as never);
    const lim = { windowMs: INVITE_EMAIL_ACTOR_WINDOW_MS, max: INVITE_EMAIL_ACTOR_MAX };
    for (let i = 0; i < INVITE_EMAIL_ACTOR_MAX; i++) {
      tryRecordEmailOutbound(inviteActorScopeKey("u1"), lim);
    }

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "fresh@example.com", roleId: "role-123" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe("INVITE_EMAIL_RATE_LIMITED");
    const sec = warn.mock.calls.find((c) => c[0] === "[email_security]");
    expect(JSON.parse(String(sec?.[1])).event).toBe("invite_actor_email_throttled");
    warn.mockRestore();
  });

  it("returns 429 when the invitee address exceeds the rolling-day invite cap", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", name: "Admin", email: "a@test.com", role: "ADMIN" },
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.$queryRaw).mockResolvedValue([] as never);
    const rlim = { windowMs: INVITE_EMAIL_RECIPIENT_WINDOW_MS, max: INVITE_EMAIL_RECIPIENT_MAX };
    for (let i = 0; i < INVITE_EMAIL_RECIPIENT_MAX; i++) {
      tryRecordEmailOutbound(inviteRecipientScopeKey("victim@example.com"), rlim);
    }

    const { POST } = await import("@/app/api/invites/route");
    const res = await POST(
      new Request("http://localhost/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Victim@example.com", roleId: "role-123" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(429);
    expect(body.error).toBe("INVITE_RECIPIENT_EMAIL_RATE_LIMITED");
    expect(db.invite.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/invites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailOutboundRateLimitForTests();
    process.env.DEV_BYPASS_AUTH = "false";
  });

  it("returns 401 when unauthenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce(null as never);

    const { GET } = await import("@/app/api/invites/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when user lacks INVITE_MEMBER", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "MEMBER" },
    } as never);

    const { GET } = await import("@/app/api/invites/route");
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Forbidden");
  });

  it("returns 200 with invites when authorized", async () => {
    const { auth } = await import("@/lib/auth");
    const { db } = await import("@/lib/db");

    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "u1", role: "ADMIN" },
    } as never);
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([
      {
        id: "i1",
        email: "invited@test.com",
        roleId: "r1",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        acceptedAt: null,
        sentById: "u1",
      },
    ]);
    vi.mocked(db.role.findMany).mockResolvedValueOnce([
      { id: "r1", code: "MEMBER", name: "Member" },
    ] as never);
    vi.mocked(db.user.findMany).mockResolvedValueOnce([
      { id: "u1", name: "Admin", email: "a@test.com" },
    ] as never);

    const { GET } = await import("@/app/api/invites/route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("invited@test.com");
    expect(body.data[0].role).toEqual({ code: "MEMBER", name: "Member" });
  });
});
