import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    canonicalScopeType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    scopeType: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: {
    MANAGE_ROLES: "manage:roles",
  },
}));

import { GET, POST } from "@/app/api/canonical-scopes/route";
import { PATCH } from "@/app/api/scope-types/[id]/link/route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/dev-session";
import { hasPermission } from "@/lib/permissions";

const mockGetSession = vi.mocked(getSession);
const mockHasPermission = vi.mocked(hasPermission);
const mockDb = vi.mocked(db);

const ADMIN_SESSION = { user: { id: "user-1", role: "ADMIN" } };
const MEMBER_SESSION = { user: { id: "user-2", role: "MEMBER" } };

const CANONICAL_FIXTURES = [
  { id: "cst-cab", code: "CAB", displayName: "Cabinets", sortOrder: 2 },
  { id: "cst-til", code: "TIL", displayName: "Tile", sortOrder: 18 },
];

describe("GET /api/canonical-scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.findMany as any).mockResolvedValue(CANONICAL_FIXTURES);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns all canonical scopes ordered by sort_order", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { canonicalScopes: typeof CANONICAL_FIXTURES };
    expect(body.canonicalScopes).toHaveLength(2);
    expect(body.canonicalScopes[0].code).toBe("CAB");
    expect(body.canonicalScopes[1].code).toBe("TIL");
  });

  it("is accessible to MEMBER role (read-only reference data)", async () => {
    mockGetSession.mockResolvedValue(MEMBER_SESSION as never);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("POST /api/canonical-scopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
    mockHasPermission.mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.findUnique as any).mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.aggregate as any).mockResolvedValue({ _max: { sortOrder: 22 } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.create as any).mockResolvedValue({
      id: "cst-new",
      code: "GLS",
      displayName: "Glass Partitions",
      sortOrder: 23,
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "GLS", displayName: "Glass Partitions" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_ROLES permission", async () => {
    mockGetSession.mockResolvedValue(MEMBER_SESSION as never);
    mockHasPermission.mockReturnValue(false);
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "GLS", displayName: "Glass Partitions" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("creates a new canonical scope type", async () => {
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "GLS", displayName: "Glass Partitions" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json() as { canonicalScope: { code: string } };
    expect(body.canonicalScope.code).toBe("GLS");
  });

  it("returns 400 for invalid code (lowercase)", async () => {
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "gls", displayName: "Glass Partitions" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing displayName", async () => {
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "GLS" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 when code already exists", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.findUnique as any).mockResolvedValue({ id: "cst-existing", code: "GLS" });
    const req = new Request("http://localhost/api/canonical-scopes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "GLS", displayName: "Glass Partitions" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/scope-types/[id]/link", () => {
  const SCOPE_TYPE = { id: "st-1", code: "Cabinetry", name: "Cabinetry" };
  const CANONICAL = { id: "cst-cab", code: "CAB", displayName: "Cabinets" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION as never);
    mockHasPermission.mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.scopeType.findUnique as any).mockResolvedValue(SCOPE_TYPE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.findUnique as any).mockResolvedValue(CANONICAL);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.scopeType.update as any).mockResolvedValue({
      ...SCOPE_TYPE,
      canonicalScopeType: CANONICAL,
    });
  });

  it("unlinks scope type when canonicalScopeTypeId is null", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.scopeType.update as any).mockResolvedValueOnce({
      ...SCOPE_TYPE,
      canonicalScopeType: null,
    });
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: null }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { scopeType: { canonicalScopeType: null } };
    expect(body.scopeType.canonicalScopeType).toBeNull();
    // Must NOT attempt a canonical lookup when unlinking
    expect(mockDb.canonicalScopeType.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: "cst-cab" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks MANAGE_ROLES permission", async () => {
    mockGetSession.mockResolvedValue(MEMBER_SESSION as never);
    mockHasPermission.mockReturnValue(false);
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: "cst-cab" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 404 when scope type not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.scopeType.findUnique as any).mockResolvedValue(null);
    const req = new Request("http://localhost/api/scope-types/missing/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: "cst-cab" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 404 when canonical scope type not found", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mockDb.canonicalScopeType.findUnique as any).mockResolvedValue(null);
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: "cst-nonexistent" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(404);
  });

  it("links a scope type to a canonical scope type", async () => {
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonicalScopeTypeId: "cst-cab" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json() as { scopeType: { canonicalScopeType: { code: string } } };
    expect(body.scopeType.canonicalScopeType?.code).toBe("CAB");
  });

  it("returns 400 when canonicalScopeTypeId key is absent entirely (undefined ≠ null)", async () => {
    // Sending {} (key absent) is still invalid — null must be sent explicitly to unlink.
    const req = new Request("http://localhost/api/scope-types/st-1/link", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "st-1" }) });
    expect(res.status).toBe(400);
  });
});
