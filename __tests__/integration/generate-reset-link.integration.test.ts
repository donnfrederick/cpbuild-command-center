/**
 * Integration tests for POST /api/users/[id]/generate-reset-link
 *
 * Auth and DB are fully mocked — validates handler logic without I/O.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted — must precede imports that touch these modules) ───────────

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    passwordResetToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock("@/lib/password-reset", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/password-reset")>();
  return {
    ...actual,
    generateResetToken: vi.fn(() => "a".repeat(64)),
    hashToken: vi.fn(() => "hashed-token-hex"),
  };
});
// fetchUserSpecialPermissions is called by the route after auth to load
// caller special perms. Mock it to return [] (no special perms) by default
// so the ADMIN role check succeeds via role alone, and the special-perms
// path can be tested explicitly in individual tests if needed.
vi.mock("@/lib/user-special-permissions", () => ({
  fetchUserSpecialPermissions: vi.fn().mockResolvedValue([]),
}));

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { POST } from "@/app/api/users/[id]/generate-reset-link/route";

const mockAuth = vi.mocked(auth);
const mockUserFind = vi.mocked(db.user.findUnique);
const mockDeleteMany = vi.mocked(db.passwordResetToken.deleteMany);
const mockCreate = vi.mocked(db.passwordResetToken.create);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminSession = { user: { id: "admin-1", role: "ADMIN" } };
const memberSession = { user: { id: "member-1", role: "MEMBER" } };

const targetUser = { id: "target-user", name: "Alice Smith", email: "alice@example.com" };

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/users/target-user/generate-reset-link", {
    method: "POST",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/users/[id]/generate-reset-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(adminSession as never);
    mockUserFind.mockResolvedValue(targetUser as never);
    mockDeleteMany.mockResolvedValue({ count: 0 } as never);
    mockCreate.mockResolvedValue({} as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(makeRequest(), params("target-user"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    mockAuth.mockResolvedValue(memberSession as never);
    const res = await POST(makeRequest(), params("target-user"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when admin tries to generate a link for themselves", async () => {
    const selfSession = { user: { id: "target-user", role: "ADMIN" } };
    mockAuth.mockResolvedValue(selfSession as never);
    const res = await POST(makeRequest(), params("target-user"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/yourself/i);
  });

  it("returns 404 when target user does not exist", async () => {
    mockUserFind.mockResolvedValue(null);
    const res = await POST(makeRequest(), params("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  it("invalidates prior unused tokens before creating a new one", async () => {
    await POST(makeRequest(), params("target-user"));
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "target-user", usedAt: null },
    });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // deleteMany must be called before create
    const deleteManyOrder = mockDeleteMany.mock.invocationCallOrder[0];
    const createOrder = mockCreate.mock.invocationCallOrder[0];
    expect(deleteManyOrder).toBeLessThan(createOrder!);
  });

  it("stores the hashed token, not the plaintext", async () => {
    await POST(makeRequest(), params("target-user"));
    const createCall = mockCreate.mock.calls[0]?.[0];
    expect(createCall?.data.tokenHash).toBe("hashed-token-hex");
    expect(createCall?.data.tokenHash).not.toBe("a".repeat(64));
  });

  it("creates a token with a 72-hour expiry", async () => {
    const before = Date.now();
    await POST(makeRequest(), params("target-user"));
    const after = Date.now();

    const createCall = mockCreate.mock.calls[0]?.[0];
    const expiresAt = createCall?.data.expiresAt as Date;
    const expiryMs = expiresAt.getTime();

    expect(expiryMs).toBeGreaterThanOrEqual(before + 72 * 60 * 60 * 1000);
    expect(expiryMs).toBeLessThanOrEqual(after + 72 * 60 * 60 * 1000);
  });

  it("returns 200 with the plaintext token and user info on success", async () => {
    const res = await POST(makeRequest(), params("target-user"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("a".repeat(64));
    expect(body.name).toBe("Alice Smith");
    expect(body.email).toBe("alice@example.com");
  });

  it("returns null name when user has no display name", async () => {
    mockUserFind.mockResolvedValue({ ...targetUser, name: null } as never);
    const res = await POST(makeRequest(), params("target-user"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBeNull();
  });
});
