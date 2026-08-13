/**
 * Integration tests for the special-permissions API routes:
 *   GET    /api/users/[id]/special-permissions
 *   POST   /api/users/[id]/special-permissions
 *   DELETE /api/users/[id]/special-permissions/[permissionId]
 *
 * Auth and DB are fully mocked — validates handler logic without I/O.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted — must precede imports that touch these modules) ───────────

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    userSpecialPermission: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("@/lib/user-special-permissions", () => ({
  fetchUserSpecialPermissions: vi.fn().mockResolvedValue([]),
}));

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET, POST } from "@/app/api/users/[id]/special-permissions/route";
import { DELETE } from "@/app/api/users/[id]/special-permissions/[permissionId]/route";

const mockAuth = vi.mocked(auth);
const mockUserFind = vi.mocked(db.user.findUnique);
const mockFindMany = vi.mocked(db.userSpecialPermission.findMany);
const mockUpsert = vi.mocked(db.userSpecialPermission.upsert);
const mockFindFirst = vi.mocked(db.userSpecialPermission.findFirst);
const mockDelete = vi.mocked(db.userSpecialPermission.delete);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminSession = { user: { id: "admin-1", role: "ADMIN" } };
const memberSession = { user: { id: "member-1", role: "MEMBER" } };

const existingUser = { id: "target-user" };

const sampleGrant = {
  id: "grant-1",
  permission: "manage:roles",
  note: "Temporary escalation",
  grantedAt: new Date("2026-03-01T00:00:00Z"),
  grantedBy: { id: "admin-1", name: "Admin", email: "admin@test.com" },
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const paramsWithPermission = (id: string, permissionId: string) => ({
  params: Promise.resolve({ id, permissionId }),
});

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost/api/users/target-user/special-permissions`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/users/[id]/special-permissions ───────────────────────────────────

describe("GET /api/users/[id]/special-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(adminSession as never);
    mockUserFind.mockResolvedValue(existingUser as never);
    mockFindMany.mockResolvedValue([sampleGrant] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await GET(makeRequest("GET"), params("target-user"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    mockAuth.mockResolvedValue(memberSession as never);
    const res = await GET(makeRequest("GET"), params("target-user"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 404 when target user does not exist", async () => {
    mockUserFind.mockResolvedValue(null);
    const res = await GET(makeRequest("GET"), params("nonexistent"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  it("returns 200 with grants array on happy path", async () => {
    const res = await GET(makeRequest("GET"), params("target-user"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].permission).toBe("manage:roles");
    expect(body.data[0].note).toBe("Temporary escalation");
  });

  it("returns empty array when user has no grants", async () => {
    mockFindMany.mockResolvedValue([]);
    const res = await GET(makeRequest("GET"), params("target-user"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ── POST /api/users/[id]/special-permissions ──────────────────────────────────

describe("POST /api/users/[id]/special-permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(adminSession as never);
    mockUserFind.mockResolvedValue(existingUser as never);
    mockUpsert.mockResolvedValue(sampleGrant as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles" }),
      params("target-user"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    mockAuth.mockResolvedValue(memberSession as never);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles" }),
      params("target-user"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when caller tries to grant to themselves", async () => {
    // Admin granting to their own id
    const selfSession = { user: { id: "target-user", role: "ADMIN" } };
    mockAuth.mockResolvedValue(selfSession as never);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles" }),
      params("target-user"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/yourself/i);
  });

  it("returns 404 when target user does not exist", async () => {
    mockUserFind.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles" }),
      params("nonexistent"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 422 when permission code is missing", async () => {
    const res = await POST(makeRequest("POST", {}), params("target-user"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 422 when permission code is empty string", async () => {
    const res = await POST(
      makeRequest("POST", { permission: "" }),
      params("target-user"),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when attempting to grant masquerade:user (non-grantable)", async () => {
    const res = await POST(
      makeRequest("POST", { permission: "masquerade:user" }),
      params("target-user"),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be granted/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 201 with the created grant on happy path", async () => {
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles", note: "Temporary escalation" }),
      params("target-user"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.permission).toBe("manage:roles");
    expect(body.data.note).toBe("Temporary escalation");
  });

  it("returns 201 when granting without a note", async () => {
    const grantWithoutNote = { ...sampleGrant, note: null };
    mockUpsert.mockResolvedValue(grantWithoutNote as never);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles" }),
      params("target-user"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.note).toBeNull();
  });

  it("upserts — re-granting an existing permission does not error", async () => {
    // Simulates granting a permission that already exists (upsert handles it)
    mockUpsert.mockResolvedValue({ ...sampleGrant, note: "Updated note" } as never);
    const res = await POST(
      makeRequest("POST", { permission: "manage:roles", note: "Updated note" }),
      params("target-user"),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.note).toBe("Updated note");
  });
});

// ── DELETE /api/users/[id]/special-permissions/[permissionId] ─────────────────

describe("DELETE /api/users/[id]/special-permissions/[permissionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue(adminSession as never);
    mockFindFirst.mockResolvedValue(sampleGrant as never);
    mockDelete.mockResolvedValue(sampleGrant as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null as never);
    const res = await DELETE(
      makeRequest("DELETE"),
      paramsWithPermission("target-user", "grant-1"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    mockAuth.mockResolvedValue(memberSession as never);
    const res = await DELETE(
      makeRequest("DELETE"),
      paramsWithPermission("target-user", "grant-1"),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when the grant does not exist", async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("DELETE"),
      paramsWithPermission("target-user", "nonexistent-grant"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Permission grant not found");
  });

  it("returns 404 when grant belongs to a different user", async () => {
    // findFirst is scoped to both id AND userId, so mocking null simulates mismatch
    mockFindFirst.mockResolvedValue(null);
    const res = await DELETE(
      makeRequest("DELETE"),
      paramsWithPermission("other-user", "grant-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 204 and deletes the grant on happy path", async () => {
    const res = await DELETE(
      makeRequest("DELETE"),
      paramsWithPermission("target-user", "grant-1"),
    );
    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "grant-1" } });
  });
});
