import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/user-special-permissions", () => ({
  fetchUserSpecialPermissions: vi.fn(),
}));

import { db } from "@/lib/db";
import { fetchUserSpecialPermissions } from "@/lib/user-special-permissions";
import {
  normalizeSessionRoleCode,
  resolveAuthoritativeUserSession,
} from "@/lib/session-user-resolution";

describe("normalizeSessionRoleCode", () => {
  it("maps SUPER_ADMIN to ADMIN", () => {
    expect(normalizeSessionRoleCode("SUPER_ADMIN")).toBe("ADMIN");
  });

  it("passes through known role codes", () => {
    expect(normalizeSessionRoleCode("INSTALL_MANAGER")).toBe("INSTALL_MANAGER");
  });
});

describe("resolveAuthoritativeUserSession", () => {
  beforeEach(() => {
    vi.mocked(db.user.findUnique).mockReset();
    vi.mocked(db.user.findFirst).mockReset();
    vi.mocked(fetchUserSpecialPermissions).mockReset();
  });

  it("uses DB role when JWT role is stale after promotion", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: "user-justin",
      role: { code: "ADMIN" },
    } as never);
    vi.mocked(fetchUserSpecialPermissions).mockResolvedValue([]);

    const resolved = await resolveAuthoritativeUserSession({
      id: "user-justin",
      email: "justin@cp.build",
      role: "PROJECT_MANAGER",
    });

    expect(resolved).toEqual({
      id: "user-justin",
      role: "ADMIN",
      specialPermissions: [],
    });
  });

  it("heals user id via email when JWT id is stale", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    vi.mocked(db.user.findFirst).mockResolvedValue({
      id: "new-id",
      role: { code: "ADMIN" },
    } as never);
    vi.mocked(fetchUserSpecialPermissions).mockResolvedValue(["forms:manage"]);

    const resolved = await resolveAuthoritativeUserSession({
      id: "old-id",
      email: "justin@cp.build",
      role: "MEMBER",
    });

    expect(resolved.id).toBe("new-id");
    expect(resolved.role).toBe("ADMIN");
    expect(resolved.specialPermissions).toEqual(["forms:manage"]);
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "justin@cp.build", mode: "insensitive" } },
      })
    );
  });

  it("falls back to JWT fields when DB lookup fails", async () => {
    vi.mocked(db.user.findUnique).mockRejectedValue(new Error("db down"));
    vi.mocked(fetchUserSpecialPermissions).mockResolvedValue(["forms:manage"]);

    const resolved = await resolveAuthoritativeUserSession({
      id: "jwt-id",
      email: "justin@cp.build",
      role: "SUPER_ADMIN",
    });

    expect(resolved).toEqual({
      id: "jwt-id",
      role: "ADMIN",
      specialPermissions: ["forms:manage"],
    });
  });
});
