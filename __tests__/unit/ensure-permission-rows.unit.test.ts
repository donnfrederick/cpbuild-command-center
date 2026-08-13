import { describe, it, expect, vi, beforeEach } from "vitest";
import { ensurePermissionRows } from "@/lib/ensure-permission-rows";
import { filterRoleGrantablePermissions } from "@/lib/permission-metadata";
import { PERMISSIONS } from "@/lib/permissions";

describe("filterRoleGrantablePermissions", () => {
  it("excludes masquerade:user from editable set", () => {
    const result = filterRoleGrantablePermissions([
      PERMISSIONS.VIEW_TEAM,
      PERMISSIONS.MASQUERADE_USER,
    ]);
    expect(result).toEqual([PERMISSIONS.VIEW_TEAM]);
    expect(result).not.toContain(PERMISSIONS.MASQUERADE_USER);
  });
});

describe("ensurePermissionRows", () => {
  const mockUpsert = vi.fn().mockResolvedValue({});
  const mockFindMany = vi.fn();

  const mockDb = {
    permission: {
      upsert: mockUpsert,
      findMany: mockFindMany,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([
      { id: "p1", code: PERMISSIONS.VIEW_DASHBOARD },
      { id: "p2", code: PERMISSIONS.CREATE_PROJECT },
    ]);
  });

  it("upserts each requested catalog code then returns DB rows", async () => {
    const codes = [PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.CREATE_PROJECT] as const;
    const rows = await ensurePermissionRows(
      mockDb as unknown as import("@prisma/client").PrismaClient,
      codes,
    );

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: PERMISSIONS.VIEW_DASHBOARD } }),
    );
    expect(rows).toHaveLength(2);
  });

  it("deduplicates permission codes before upserting", async () => {
    await ensurePermissionRows(
      mockDb as unknown as import("@prisma/client").PrismaClient,
      [PERMISSIONS.VIEW_TEAM, PERMISSIONS.VIEW_TEAM],
    );
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });
});
