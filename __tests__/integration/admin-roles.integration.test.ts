/**
 * Integration tests for admin role management API routes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dev-session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/user-special-permissions", () => ({
  fetchUserSpecialPermissions: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/role-permission-cache", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/role-permission-cache")>();
  return {
    ...actual,
    invalidateRolePermissionCache: vi.fn(),
    refreshRolePermissionCache: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/ensure-permission-rows", () => ({
  ensurePermissionRows: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    role: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: { findMany: vi.fn() },
    rolePermission: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { getSession } from "@/lib/dev-session";
import { db } from "@/lib/db";
import { GET, POST } from "@/app/api/admin/roles/route";
import { PATCH, DELETE } from "@/app/api/admin/roles/[id]/route";
import { PUT } from "@/app/api/admin/roles/[id]/permissions/route";
import { ensurePermissionRows } from "@/lib/ensure-permission-rows";

const mockGetSession = vi.mocked(getSession);
const mockEnsurePermissionRows = vi.mocked(ensurePermissionRows);
const mockFindMany = vi.mocked(db.role.findMany);
const mockFindUnique = vi.mocked(db.role.findUnique);
const mockCreate = vi.mocked(db.role.create);
const mockUpdate = vi.mocked(db.role.update);
const mockDelete = vi.mocked(db.role.delete);
const mockTransaction = vi.mocked(db.$transaction);

const adminSession = { user: { id: "admin-1", role: "ADMIN" } };
const memberSession = { user: { id: "member-1", role: "MEMBER" } };

const sampleRole = {
  id: "role-1",
  code: "FIELD_SUP",
  name: "Field Supervisor",
  description: "Supervises field work",
  permissions: [{ permission: { code: "view:team" } }],
  _count: { users: 0 },
};

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/admin/roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession as never);
    mockFindMany.mockResolvedValue([sampleRole] as never);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    mockGetSession.mockResolvedValue(memberSession as never);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns roles with permissions on happy path", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].code).toBe("FIELD_SUP");
    expect(body.data[0].permissions).toEqual(["view:team"]);
    expect(body.data[0].isBuiltin).toBe(false);
  });
});

describe("POST /api/admin/roles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession as never);
    mockFindUnique.mockResolvedValue(null);
    mockEnsurePermissionRows.mockResolvedValue([]);
    mockCreate.mockResolvedValue(sampleRole as never);
  });

  it("returns 409 when creating a built-in role code", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ADMIN", name: "Duplicate Admin" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("creates a custom role", async () => {
    const res = await POST(
      new Request("http://localhost/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "FIELD_SUP",
          name: "Field Supervisor",
          description: "Supervises field work",
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/roles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession as never);
  });

  it("returns 403 when deleting a built-in role", async () => {
    mockFindUnique.mockResolvedValue({
      id: "role-admin",
      code: "ADMIN",
      _count: { users: 0 },
    } as never);
    const res = await DELETE(new Request("http://localhost"), idParams("role-admin"));
    expect(res.status).toBe(403);
  });

  it("deletes a custom role with no users", async () => {
    mockFindUnique.mockResolvedValue({
      id: "role-1",
      code: "FIELD_SUP",
      _count: { users: 0 },
    } as never);
    mockDelete.mockResolvedValue(sampleRole as never);
    const res = await DELETE(new Request("http://localhost"), idParams("role-1"));
    expect(res.status).toBe(204);
  });
});

describe("PUT /api/admin/roles/[id]/permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession as never);
    mockFindUnique.mockResolvedValue({
      id: "role-1",
      code: "MEMBER",
      permissions: [],
    } as never);
    mockEnsurePermissionRows.mockResolvedValue([
      { id: "p1", code: "view:team" },
    ]);
    mockTransaction.mockResolvedValue([]);
    vi.mocked(db.role.findUniqueOrThrow).mockResolvedValue(sampleRole as never);
  });

  it("preserves non-grantable permissions such as masquerade:user on save", async () => {
    mockFindUnique.mockResolvedValue({
      id: "role-admin",
      code: "ADMIN",
      permissions: [{ permission: { code: "masquerade:user" } }],
    } as never);
    mockEnsurePermissionRows.mockImplementation(async (_db, codes: string[]) =>
      codes.map((code, i) => ({ id: `p-${i}`, code })),
    );
    mockTransaction.mockResolvedValue([]);
    vi.mocked(db.role.findUniqueOrThrow).mockResolvedValue({
      ...sampleRole,
      code: "ADMIN",
      permissions: [
        { permission: { code: "view:team" } },
        { permission: { code: "masquerade:user" } },
      ],
    } as never);

    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: ["view:team", "masquerade:user"],
        }),
      }),
      idParams("role-admin"),
    );

    expect(res.status).toBe(200);
    expect(mockEnsurePermissionRows).toHaveBeenCalledWith(db, ["view:team", "masquerade:user"]);
  });

  it("replaces permissions on happy path", async () => {
    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: ["view:team"] }),
      }),
      idParams("role-1"),
    );
    expect(res.status).toBe(200);
    expect(mockEnsurePermissionRows).toHaveBeenCalledWith(db, ["view:team"]);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("upserts catalog permissions missing from the permissions table", async () => {
    const newPerms = [
      { id: "p-dash", code: "dashboard:view" },
      { id: "p-create", code: "project:create" },
      { id: "p-status", code: "unit:status-manage" },
    ];
    mockEnsurePermissionRows.mockResolvedValue(newPerms);

    const res = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permissions: ["dashboard:view", "project:create", "unit:status-manage"],
        }),
      }),
      idParams("role-1"),
    );

    expect(res.status).toBe(200);
    expect(mockEnsurePermissionRows).toHaveBeenCalledWith(db, [
      "dashboard:view",
      "project:create",
      "unit:status-manage",
    ]);
  });
});

describe("PATCH /api/admin/roles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(adminSession as never);
    mockFindUnique.mockResolvedValue({ id: "role-1" } as never);
    mockUpdate.mockResolvedValue({ ...sampleRole, name: "Updated" } as never);
  });

  it("updates role name", async () => {
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      }),
      idParams("role-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated");
  });

  it("updates role description", async () => {
    mockUpdate.mockResolvedValue({
      ...sampleRole,
      description: "Updated description",
    } as never);

    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Updated description" }),
      }),
      idParams("role-1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.description).toBe("Updated description");
  });

  it("returns 400 when name is empty", async () => {
    const res = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
      idParams("role-1"),
    );
    expect(res.status).toBe(400);
  });
});
