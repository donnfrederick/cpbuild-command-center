/**
 * Integration tests for DELETE /api/invites/[id]
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE } from "@/app/api/invites/[id]/route";

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    invite: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  PERMISSIONS: { INVITE_MEMBER: "invite:member" },
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const { db } = await import("@/lib/db");
const { getEffectiveSession } = await import("@/lib/masquerade");
const { hasPermission } = await import("@/lib/permissions");

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

const adminSession = {
  user: { id: "user-1", name: "Admin", email: "admin@cp.build", role: "ADMIN" },
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("DELETE /api/invites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(null);

    const res = await DELETE(new Request("http://x"), makeParams("inv-1"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks INVITE_MEMBER permission", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: { id: "u", name: "Member", email: "m@cp.build", role: "MEMBER" },
    } as Parameters<typeof getEffectiveSession>[0] extends never ? never : Awaited<ReturnType<typeof getEffectiveSession>>);
    vi.mocked(hasPermission).mockReturnValue(false);

    const res = await DELETE(new Request("http://x"), makeParams("inv-1"));
    expect(res.status).toBe(403);
  });

  it("returns 404 when invite does not exist", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(adminSession as Awaited<ReturnType<typeof getEffectiveSession>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.invite.findUnique).mockResolvedValue(null);

    const res = await DELETE(new Request("http://x"), makeParams("inv-missing"));
    expect(res.status).toBe(404);
  });

  it("returns 409 when invite is already accepted", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(adminSession as Awaited<ReturnType<typeof getEffectiveSession>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.invite.findUnique).mockResolvedValue({
      id: "inv-1",
      email: "dev@cp.build",
      acceptedAt: new Date(),
      sentById: "user-1",
    });

    const res = await DELETE(new Request("http://x"), makeParams("inv-1"));
    expect(res.status).toBe(409);
  });

  it("deletes a pending invite and returns 200 for an admin", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue(adminSession as Awaited<ReturnType<typeof getEffectiveSession>>);
    vi.mocked(hasPermission).mockReturnValue(true);
    vi.mocked(db.invite.findUnique).mockResolvedValue({
      id: "inv-1",
      email: "dev@cp.build",
      acceptedAt: null,
      sentById: "user-1",
    });
    vi.mocked(db.invite.delete).mockResolvedValue({ id: "inv-1" } as never);

    const res = await DELETE(new Request("http://x"), makeParams("inv-1"));
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { deleted: boolean; email: string } };
    expect(body.data.deleted).toBe(true);
    expect(body.data.email).toBe("dev@cp.build");
    expect(vi.mocked(db.invite.delete)).toHaveBeenCalledWith({ where: { id: "inv-1" } });
  });
});
