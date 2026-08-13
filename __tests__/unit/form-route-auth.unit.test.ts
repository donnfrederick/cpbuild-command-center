import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/masquerade", () => ({
  getEffectiveSession: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  hasPermission: vi.fn(),
  hasPermissionWithOverrides: vi.fn(),
  PERMISSIONS: { MANAGE_FORMS: "forms:manage" },
}));

import { getEffectiveSession } from "@/lib/masquerade";
import { hasPermission, hasPermissionWithOverrides } from "@/lib/permissions";
import { authorizeFormMutation } from "@/lib/forms/form-route-auth";

describe("authorizeFormMutation", () => {
  beforeEach(() => {
    vi.mocked(getEffectiveSession).mockReset();
    vi.mocked(hasPermission).mockReset();
    vi.mocked(hasPermissionWithOverrides).mockReset();
  });

  it("allows ADMIN saving while role preview shows a lower role", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "justin@cp.build",
        name: "Justin",
        role: "INSTALL_MANAGER",
        specialPermissions: [],
      },
      masquerade: null,
      rolePreview: { realRole: "ADMIN", previewRole: "INSTALL_MANAGER" },
    });
    vi.mocked(hasPermissionWithOverrides).mockResolvedValue(true);

    const result = await authorizeFormMutation();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("user-1");
    expect(hasPermissionWithOverrides).toHaveBeenCalledWith(
      "ADMIN",
      "user-1",
      "forms:manage",
      expect.anything()
    );
  });

  it("allows INSTALL_DIRECTOR to mutate forms using DB-authoritative role from effective session", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: {
        id: "director-1",
        email: "justin@cp.build",
        name: "Justin",
        role: "INSTALL_DIRECTOR",
        specialPermissions: [],
      },
      masquerade: null,
      rolePreview: null,
    });
    vi.mocked(hasPermissionWithOverrides).mockResolvedValue(true);

    const result = await authorizeFormMutation();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.userId).toBe("director-1");
    expect(hasPermissionWithOverrides).toHaveBeenCalledWith(
      "INSTALL_DIRECTOR",
      "director-1",
      "forms:manage",
      expect.anything()
    );
  });

  it("returns 503 when DB permission check throws", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: {
        id: "user-1",
        email: "justin@cp.build",
        name: "Justin",
        role: "INSTALL_DIRECTOR",
        specialPermissions: [],
      },
      masquerade: null,
      rolePreview: null,
    });
    vi.mocked(hasPermissionWithOverrides).mockRejectedValue(new Error("DB down"));

    const result = await authorizeFormMutation();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("denies when masquerading as a user without MANAGE_FORMS", async () => {
    vi.mocked(getEffectiveSession).mockResolvedValue({
      user: {
        id: "target-1",
        email: "member@cp.build",
        name: "Member",
        role: "MEMBER",
        specialPermissions: [],
      },
      masquerade: {
        actorId: "admin-1",
        actorEmail: "admin@cp.build",
        actorName: "Admin",
        actorRole: "ADMIN",
        targetUserId: "target-1",
        targetUserName: "Member",
        targetUserEmail: "member@cp.build",
        targetUserRole: "MEMBER",
        logId: "log-1",
      },
      rolePreview: null,
    });
    vi.mocked(hasPermission).mockReturnValue(false);

    const result = await authorizeFormMutation();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });
});
