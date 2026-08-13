import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db", () => ({
  db: {
    invite: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn().mockResolvedValue("hashed-password") },
}));

const validPayload = {
  token: "valid-token-123",
  name: "Alice Smith",
  password: "Secure123",
  confirmPassword: "Secure123",
};

describe("POST /api/invites/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 422 when validation fails", async () => {
    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "x", name: "A", password: "weak" }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when passwords do not match", async () => {
    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validPayload,
          confirmPassword: "Different123",
        }),
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when invite not found", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toContain("Invalid invite token");
  });

  it("returns 410 when invite already accepted", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "new@test.com",
      roleId: "r1",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(410);
    expect(data.error).toContain("already been used");
  });

  it("returns 410 when invite expired", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "new@test.com",
      roleId: "r1",
      expiresAt: new Date(Date.now() - 86400000),
      acceptedAt: null,
    } as never);

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(410);
    expect(data.error).toContain("expired");
  });

  it("returns 409 when user already exists", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "existing@test.com",
      roleId: "r1",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({
      id: "u1",
      email: "existing@test.com",
    } as never);

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...validPayload,
          token: "valid-token",
        }),
      })
    );
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain("already exists");
  });

  it("returns 201 when account created successfully", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "new@test.com",
      roleId: "r1",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);
    // Route now uses array-form $transaction — receives an array of promises,
    // not a callback. Mock resolves with both operation results.
    vi.mocked(db.user.create).mockResolvedValueOnce({ id: "u1" } as never);
    vi.mocked(db.invite.update).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.$transaction).mockImplementation(
      async (ops: unknown) => Promise.all(ops as Promise<unknown>[])
    );

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.message).toContain("Account created");
  });

  it("returns 409 when transaction fails with P2002 unique constraint (race condition)", async () => {
    const { db } = await import("@/lib/db");
    vi.mocked(db.invite.findUnique).mockResolvedValueOnce({
      id: "i1",
      email: "race@test.com",
      roleId: "r1",
      expiresAt: new Date(Date.now() + 86400000),
      acceptedAt: null,
    } as never);
    vi.mocked(db.user.findUnique).mockResolvedValueOnce(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "0.0.0", meta: {} }
    );
    vi.mocked(db.$transaction).mockRejectedValueOnce(p2002);

    const { POST } = await import("@/app/api/invites/accept/route");
    const res = await POST(
      new Request("http://localhost/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validPayload, token: "race-token" }),
      })
    );
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toContain("already exists");
  });
});
