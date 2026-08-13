/**
 * Integration tests for PATCH /api/team/[id] — status field
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PATCH } from "@/app/api/team/[id]/route";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: { MANAGE_ROLES: "manage:roles", REMOVE_MEMBER: "remove:member" },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { db } = await import("@/lib/db");
const { auth } = await import("@/lib/auth");
const { hasPermission } = await import("@/lib/permissions");

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(body: Record<string, unknown>) {
  return new Request("http://localhost/api/team/target-user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const adminSession = {
  user: { id: "admin-1", name: "Admin", email: "admin@cp.build", role: "ADMIN" },
};

const targetUser = { id: "target-1" };

const updatedUser = {
  id: "target-1",
  email: "target@cp.build",
  name: "Target User",
  status: "INACTIVE",
  role: { code: "MEMBER", name: "Member" },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PATCH /api/team/[id] — status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(adminSession);
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(targetUser);
    (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(updatedUser);
  });

  it("returns 401 when not authenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(makeReq({ status: "INACTIVE" }), makeParams("target-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks MANAGE_ROLES", async () => {
    (hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const res = await PATCH(makeReq({ status: "INACTIVE" }), makeParams("target-1"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when trying to change own status", async () => {
    const res = await PATCH(makeReq({ status: "INACTIVE" }), makeParams("admin-1"));
    expect(res.status).toBe(400);
  });

  it("returns 422 when status value is invalid", async () => {
    const res = await PATCH(makeReq({ status: "BANNED" }), makeParams("target-1"));
    expect(res.status).toBe(422);
  });

  it("returns 422 when body has neither roleId nor status", async () => {
    const res = await PATCH(makeReq({}), makeParams("target-1"));
    expect(res.status).toBe(422);
  });

  it("returns 404 when user does not exist", async () => {
    (db.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await PATCH(makeReq({ status: "INACTIVE" }), makeParams("target-1"));
    expect(res.status).toBe(404);
  });

  it("updates status to INACTIVE successfully", async () => {
    const res = await PATCH(makeReq({ status: "INACTIVE" }), makeParams("target-1"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe("INACTIVE");
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "INACTIVE" } })
    );
  });

  it("updates status to SUSPENDED successfully", async () => {
    const suspended = { ...updatedUser, status: "SUSPENDED" };
    (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(suspended);
    const res = await PATCH(makeReq({ status: "SUSPENDED" }), makeParams("target-1"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe("SUSPENDED");
  });

  it("restores status to ACTIVE successfully", async () => {
    const active = { ...updatedUser, status: "ACTIVE" };
    (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(active);
    const res = await PATCH(makeReq({ status: "ACTIVE" }), makeParams("target-1"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string } };
    expect(body.data.status).toBe("ACTIVE");
  });

  it("can update both status and roleId in one request", async () => {
    const bothUpdated = { ...updatedUser, status: "INACTIVE", role: { code: "MEMBER", name: "Member" } };
    (db.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(bothUpdated);
    const res = await PATCH(makeReq({ status: "INACTIVE", roleId: "role-id-2" }), makeParams("target-1"));
    expect(res.status).toBe(200);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "INACTIVE", roleId: "role-id-2" } })
    );
  });
});
