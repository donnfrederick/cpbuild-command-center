import { describe, expect, it } from "vitest";
import { resolveFieldDailyUnitDetailPermissions } from "@/hooks/useFieldDailyDetailModals";

describe("resolveFieldDailyUnitDetailPermissions()", () => {
  it("grants status management for install manager roles", () => {
    const perms = resolveFieldDailyUnitDetailPermissions("INSTALL_MANAGER");
    expect(perms.canManageStatus).toBe(true);
  });

  it("denies status management when role is missing", () => {
    expect(resolveFieldDailyUnitDetailPermissions(undefined).canManageStatus).toBe(false);
  });

  it("denies status management for read-only roles", () => {
    expect(resolveFieldDailyUnitDetailPermissions("MEMBER").canManageStatus).toBe(false);
  });
});
