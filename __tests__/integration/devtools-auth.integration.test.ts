import { describe, it, expect, vi, beforeEach } from "vitest";

// Top-level mocks prevent static imports in devtools-auth.ts from pulling in
// the real next-auth, which fails under vitest's node environment.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { user: { findFirst: vi.fn() } },
}));

describe("requireDevToolsAdmin()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DEV_BYPASS_AUTH = "false";
    process.env.NODE_ENV = "test";
  });

  describe("with DEV_BYPASS_AUTH=true (non-production bypass)", () => {
    beforeEach(() => {
      process.env.DEV_BYPASS_AUTH = "true";
    });

    it("returns null (allowed) when bypass finds an ADMIN user in the DB", async () => {
      const { db } = await import("@/lib/db");
      vi.mocked(db.user.findFirst).mockResolvedValueOnce(
        { id: "u1", name: "Admin", email: "admin@example.com" } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      const result = await requireDevToolsAdmin();
      expect(result).toBeNull();
    });

    it("returns 401 when bypass finds no admin user and session is null", async () => {
      const { db } = await import("@/lib/db");
      const { auth } = await import("@/lib/auth");
      vi.mocked(db.user.findFirst).mockResolvedValueOnce(null as never);
      vi.mocked(auth).mockResolvedValueOnce(null as never);

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      const result = await requireDevToolsAdmin();
      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
      const body = await result!.json();
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("with DEV_BYPASS_AUTH disabled", () => {
    it("returns 401 when unauthenticated", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as never);

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      const result = await requireDevToolsAdmin();
      expect(result!.status).toBe(401);
      const body = await result!.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("returns 403 when authenticated as MEMBER", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(
        { user: { id: "u2", name: "Member", email: "m@example.com", role: "MEMBER" } } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      const result = await requireDevToolsAdmin();
      expect(result!.status).toBe(403);
      const body = await result!.json();
      expect(body.error).toBe("Forbidden");
    });

    it("returns null (allowed) for ADMIN role", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(
        { user: { id: "u3", name: "Admin", email: "a@example.com", role: "ADMIN" } } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      expect(await requireDevToolsAdmin()).toBeNull();
    });

    it("returns null (allowed) for ADMIN role", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(
        { user: { id: "u4", name: "SuperAdmin", email: "sa@example.com", role: "ADMIN" } } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      expect(await requireDevToolsAdmin()).toBeNull();
    });

    it("returns 403 for INSTALL_MANAGER role", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(
        { user: { id: "u5", name: "IM", email: "im@example.com", role: "INSTALL_MANAGER" } } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      const result = await requireDevToolsAdmin();
      expect(result!.status).toBe(403);
    });

    it("returns null (allowed) for DEVELOPER role", async () => {
      const { auth } = await import("@/lib/auth");
      vi.mocked(auth).mockResolvedValueOnce(
        { user: { id: "u6", name: "Dev", email: "dev@example.com", role: "DEVELOPER" } } as never
      );

      const { requireDevToolsAdmin } = await import("@/lib/devtools-auth");
      expect(await requireDevToolsAdmin()).toBeNull();
    });

  });
});
