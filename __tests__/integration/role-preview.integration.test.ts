import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/lib/dev-session", () => ({ getSession: () => mockGetSession() }));

vi.mock("@/lib/db", () => ({
  db: {
    role: { findUnique: vi.fn() },
  },
}));

import { db } from "@/lib/db";
const mockRoleFindUnique = vi.mocked(db.role.findUnique);

// Mock the cookie signing to return a predictable value
vi.mock("@/lib/role-preview", async () => {
  const actual = await vi.importActual<typeof import("@/lib/role-preview")>("@/lib/role-preview");
  return {
    ...actual,
    signRolePreviewCookie: vi.fn().mockResolvedValue("signed-cookie-value"),
    buildRolePreviewCookieHeader: vi.fn().mockReturnValue("cc-role-preview=signed-cookie-value; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800"),
    clearRolePreviewCookieHeader: vi.fn().mockReturnValue("cc-role-preview=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),
  };
});

// ── Import handlers after mocks ────────────────────────────────────────────────

const { POST, DELETE } = await import("@/app/api/admin/role-preview/route");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/role-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function adminSession() {
  return { user: { id: "user-admin", role: "ADMIN" } };
}

function designerSession() {
  return { user: { id: "user-designer", role: "DESIGNER" } };
}

function developerSession() {
  return { user: { id: "user-developer", role: "DEVELOPER" } };
}

function memberSession() {
  return { user: { id: "user-member", role: "MEMBER" } };
}

// ── POST tests ─────────────────────────────────────────────────────────────────

describe("POST /api/admin/role-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoleFindUnique.mockImplementation(async ({ where }: { where: { code: string } }) => {
      const known = new Set([
        "ADMIN", "TEAM_LEAD", "DESIGNER", "MEMBER", "PRODUCT",
        "DEVELOPER", "EXECUTIVE", "CONTROLS_MANAGER", "INSTALL_MANAGER", "INSTALL_DIRECTOR",
        "PROJECT_MANAGER", "PROJECT_COORDINATOR", "BI_ANALYST",
      ]);
      return known.has(where.code) ? { id: `id-${where.code}` } : null;
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeRequest({ previewRole: "MEMBER" }) as never);
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role (no PREVIEW_ROLE permission)", async () => {
    mockGetSession.mockResolvedValue(memberSession());
    const res = await POST(makeRequest({ previewRole: "ADMIN" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 403 for PROJECT_MANAGER role", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "PROJECT_MANAGER" } });
    const res = await POST(makeRequest({ previewRole: "MEMBER" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 403 for CONTROLS_MANAGER role", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1", role: "CONTROLS_MANAGER" } });
    const res = await POST(makeRequest({ previewRole: "MEMBER" }) as never);
    expect(res.status).toBe(403);
  });

  it("returns 201 and sets cookie for ADMIN role", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    const res = await POST(makeRequest({ previewRole: "MEMBER" }) as never);
    expect(res.status).toBe(201);
    const body = await res.json() as { previewRole: string; realRole: string };
    expect(body.previewRole).toBe("MEMBER");
    expect(body.realRole).toBe("ADMIN");
    expect(res.headers.get("Set-Cookie")).toContain("cc-role-preview=");
  });

  it("returns 201 and sets cookie for DESIGNER role", async () => {
    mockGetSession.mockResolvedValue(designerSession());
    const res = await POST(makeRequest({ previewRole: "MEMBER" }) as never);
    expect(res.status).toBe(201);
  });

  it("returns 201 and sets cookie for DEVELOPER role", async () => {
    mockGetSession.mockResolvedValue(developerSession());
    const res = await POST(makeRequest({ previewRole: "PROJECT_MANAGER" }) as never);
    expect(res.status).toBe(201);
    const body = await res.json() as { previewRole: string };
    expect(body.previewRole).toBe("PROJECT_MANAGER");
  });

  it("returns 400 for unknown role code not in database", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    const res = await POST(makeRequest({ previewRole: "SUPER_HACKER" }) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing previewRole field", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    const req = new Request("http://localhost/api/admin/role-preview", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("clears preview (200) when real role is selected", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    // ADMIN selecting ADMIN = selecting own role = clear
    const res = await POST(makeRequest({ previewRole: "ADMIN" }) as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { cleared: boolean };
    expect(body.cleared).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("accepts custom role codes when present in database", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    mockRoleFindUnique.mockResolvedValueOnce({ id: "custom-1" } as never);
    const res = await POST(makeRequest({ previewRole: "FIELD_SUPERVISOR" }) as never);
    expect(res.status).toBe(201);
  });

  it("accepts all valid role codes without 400", async () => {
    const validRoles = [
      "ADMIN", "TEAM_LEAD", "DESIGNER", "MEMBER", "PRODUCT",
      "DEVELOPER", "EXECUTIVE", "CONTROLS_MANAGER", "INSTALL_MANAGER", "INSTALL_DIRECTOR",
      "PROJECT_MANAGER", "PROJECT_COORDINATOR",
    ];
    mockGetSession.mockResolvedValue(adminSession());
    for (const role of validRoles) {
      // ADMIN selecting ADMIN returns 200 (clear), all others return 201
      const res = await POST(makeRequest({ previewRole: role }) as never);
      expect([200, 201]).toContain(res.status);
    }
  });
});

// ── DELETE tests ───────────────────────────────────────────────────────────────

describe("DELETE /api/admin/role-preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 403 for MEMBER role", async () => {
    mockGetSession.mockResolvedValue(memberSession());
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("returns 200 and clears cookie for ADMIN role", async () => {
    mockGetSession.mockResolvedValue(adminSession());
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(res.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("returns 200 and clears cookie for DESIGNER role", async () => {
    mockGetSession.mockResolvedValue(designerSession());
    const res = await DELETE();
    expect(res.status).toBe(200);
  });

  it("returns 200 and clears cookie for DEVELOPER role", async () => {
    mockGetSession.mockResolvedValue(developerSession());
    const res = await DELETE();
    expect(res.status).toBe(200);
  });
});
