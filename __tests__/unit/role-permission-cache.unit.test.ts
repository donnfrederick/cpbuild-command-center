import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  clearRolePermissionCacheForTests,
  getCachedRolePermissions,
  isRolePermissionCacheLoaded,
  setRolePermissionCacheForTests,
} from "@/lib/role-permission-cache";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";

describe("role-permission-cache", () => {
  afterEach(() => {
    clearRolePermissionCacheForTests();
  });

  it("returns undefined before cache is loaded", () => {
    expect(getCachedRolePermissions("MEMBER")).toBeUndefined();
    expect(isRolePermissionCacheLoaded()).toBe(false);
  });

  it("returns cached permissions for a role", () => {
    setRolePermissionCacheForTests({
      MEMBER: [PERMISSIONS.VIEW_TEAM],
    });
    expect(getCachedRolePermissions("MEMBER")).toEqual([PERMISSIONS.VIEW_TEAM]);
    expect(isRolePermissionCacheLoaded()).toBe(true);
  });

  it("returns empty array when role has no permissions in cache", () => {
    setRolePermissionCacheForTests({
      CUSTOM_ROLE: [],
    });
    expect(getCachedRolePermissions("CUSTOM_ROLE")).toEqual([]);
  });

  it("hasPermission uses cache when loaded instead of code defaults", () => {
    setRolePermissionCacheForTests({
      MEMBER: [PERMISSIONS.MANAGE_ROLES],
    });
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_ROLES)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_TEAM)).toBe(false);
  });

  it("falls back to ROLE_PERMISSIONS when cache is not loaded", () => {
    clearRolePermissionCacheForTests();
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_TEAM)).toBe(true);
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_ROLES)).toBe(false);
  });

  it("clearRolePermissionCacheForTests resets state", () => {
    setRolePermissionCacheForTests({ ADMIN: [PERMISSIONS.MANAGE_ROLES] });
    clearRolePermissionCacheForTests();
    expect(isRolePermissionCacheLoaded()).toBe(false);
  });
});
