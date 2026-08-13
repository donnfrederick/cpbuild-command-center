/**
 * Integration tests for /api/admin/api-keys (GET + POST) and /api/admin/api-keys/[id] (DELETE)
 *
 * Auth and DB are fully mocked. Tests validate:
 * - Auth guard (ADMIN only)
 * - Key creation: happy path, validation errors, cache-control header
 * - Key listing with status enrichment
 * - Key revocation
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
// vi.mock is hoisted — all vi.fn() calls must be inside the factory.

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

// ── Imports under test (after vi.mock declarations) ───────────────────────────

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { GET, POST } from "@/app/api/admin/api-keys/route";
import { DELETE } from "@/app/api/admin/api-keys/[id]/route";

const mockGetSession = vi.mocked(getSession);
const mockApiKey = vi.mocked(db.apiKey);

// ── Shared fixtures ────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { id: "admin-1", name: "Phil", email: "phil@example.com", role: "ADMIN" as const, specialPermissions: [] as string[] },
};

const BASE_KEY = {
  id: "key-1",
  name: "Tosh BI",
  keyPrefix: "cc_bi_abcdef12",
  keyHash: "a".repeat(64),
  scopes: ["bi:projects"],
  allowedProjectIds: [] as string[],
  party: "INTERNAL" as const,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: "admin-1",
  assignedToId: null,
  createdBy: { id: "admin-1", name: "Phil", email: "phil@cp.com" },
  assignedTo: null,
};

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(id: string) {
  return new Request(`http://localhost/api/admin/api-keys/${id}`, { method: "DELETE" });
}

// ── GET /api/admin/api-keys ────────────────────────────────────────────────────

describe("GET /api/admin/api-keys", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockApiKey.findMany.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is authenticated but lacks MANAGE_ROLES (MEMBER role)", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u1", role: "MEMBER", name: "Bob", email: "bob@example.com", specialPermissions: [] as string[] },
    });
    const res = await GET();
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Forbidden");
  });

  it("returns 200 with enriched key list for ADMIN", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.findMany.mockResolvedValue([{ ...BASE_KEY, revokedAt: null, expiresAt: null }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ status: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].status).toBe("active");
  });

  it("marks expired keys with status=expired", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const past = new Date(Date.now() - 1000); // Date object, not string — route uses < new Date()
    mockApiKey.findMany.mockResolvedValue([{ ...BASE_KEY, expiresAt: past }]);
    const res = await GET();
    const data = await res.json() as Array<{ status: string }>;
    expect(data[0].status).toBe("expired");
  });

  it("marks revoked keys with status=revoked", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.findMany.mockResolvedValue([{ ...BASE_KEY, revokedAt: new Date() }]);
    const res = await GET();
    const data = await res.json() as Array<{ status: string }>;
    expect(data[0].status).toBe("revoked");
  });
});

// ── POST /api/admin/api-keys ───────────────────────────────────────────────────

describe("POST /api/admin/api-keys", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockApiKey.create.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makePostRequest({ name: "X", scopes: ["bi:projects"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing name", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makePostRequest({ scopes: ["bi:projects"] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty scopes array", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makePostRequest({ name: "Test", scopes: [] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid scope value", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const res = await POST(makePostRequest({ name: "Test", scopes: ["bi:invalid"] }));
    expect(res.status).toBe(400);
  });

  it("returns 201 with rawKey on valid creation", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.create.mockResolvedValue({ ...BASE_KEY });
    const res = await POST(makePostRequest({ name: "Tosh BI", scopes: ["bi:projects"] }));
    expect(res.status).toBe(201);
    const data = await res.json() as { rawKey: string; warning: string };
    expect(data.rawKey).toMatch(/^cc_bi_/);
    expect(data.warning).toContain("only time");
  });

  it("sets Cache-Control: no-store on 201 response to prevent key caching", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.create.mockResolvedValue({ ...BASE_KEY });
    const res = await POST(makePostRequest({ name: "Tosh BI", scopes: ["bi:projects"] }));
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts null assignedToId (machine-only key)", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.create.mockResolvedValue({ ...BASE_KEY });
    const res = await POST(makePostRequest({
      name: "Tosh BI",
      scopes: ["bi:projects", "bi:units"],
      assignedToId: null,
    }));
    expect(res.status).toBe(201);
  });

  it("stores allowedProjectIds restriction when provided", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.create.mockResolvedValue({ ...BASE_KEY, allowedProjectIds: ["proj-1"] });
    const res = await POST(makePostRequest({
      name: "Scoped key",
      scopes: ["bi:projects"],
      allowedProjectIds: ["proj-1"],
    }));
    expect(res.status).toBe(201);
    expect(mockApiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ allowedProjectIds: ["proj-1"] }),
      })
    );
  });

  it("accepts all 11 BI scopes in one key", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.create.mockResolvedValue({ ...BASE_KEY });
    const allScopes = [
      "bi:projects", "bi:units", "bi:issues", "bi:observations",
      "bi:comments", "bi:inspections", "bi:subscopes", "bi:media",
      "bi:feedback", "bi:team", "bi:activity",
    ];
    const res = await POST(makePostRequest({ name: "Full access key", scopes: allScopes }));
    expect(res.status).toBe(201);
  });
});

// ── DELETE /api/admin/api-keys/[id] ──────────────────────────────────────────

describe("DELETE /api/admin/api-keys/[id]", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockApiKey.findUnique.mockReset();
    mockApiKey.update.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest("key-1"), { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when key does not exist", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.findUnique.mockResolvedValue(null);
    const res = await DELETE(makeDeleteRequest("missing"), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 and sets revokedAt on valid revocation", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    mockApiKey.findUnique.mockResolvedValue({ ...BASE_KEY, revokedAt: null });
    mockApiKey.update.mockResolvedValue({ ...BASE_KEY, revokedAt: new Date() });
    const res = await DELETE(makeDeleteRequest("key-1"), { params: Promise.resolve({ id: "key-1" }) });
    expect(res.status).toBe(200);
    expect(mockApiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedAt: expect.any(Date) }) })
    );
  });
});
