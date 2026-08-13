import { describe, it, expect } from "vitest";
import { PERMISSION_METADATA_BY_CODE } from "@/lib/permission-metadata";
import {
  canManageForms,
  canManageIssueReportConfig,
  hasPermission,
  formatRole,
  getProjectNavAccess,
  getGlobalNavAccess,
  isFieldLeadershipRole,
  OPERATIONAL_LEADERSHIP_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "@/lib/permissions";

describe("PERMISSION_METADATA", () => {
  it("labels MANAGE_ISSUE_REPORT_CONFIG as Report Issue in the forms category", () => {
    const meta = PERMISSION_METADATA_BY_CODE[PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG];
    expect(meta.label).toBe("Report Issue");
    expect(meta.category).toBe("forms");
    expect(meta.roleGrantable).toBe(true);
  });

  it("labels VIEW_LOCATION_TRACKING in the locationTracking category", () => {
    const meta = PERMISSION_METADATA_BY_CODE[PERMISSIONS.VIEW_LOCATION_TRACKING];
    expect(meta.label).toBe("Location Tracking");
    expect(meta.category).toBe("locationTracking");
    expect(meta.roleGrantable).toBe(true);
  });
});

describe("PERMISSIONS catalog", () => {
  it("exports all required permission keys", () => {
    expect(PERMISSIONS.INVITE_MEMBER).toBe("invite:member");
    expect(PERMISSIONS.VIEW_TEAM).toBe("view:team");
    expect(PERMISSIONS.MANAGE_ROLES).toBe("manage:roles");
    expect(PERMISSIONS.REMOVE_MEMBER).toBe("remove:member");
    expect(PERMISSIONS.MANAGE_PROJECTS).toBe("projects:manage");
    expect(PERMISSIONS.VIEW_PROJECTS).toBe("projects:view");
    expect(PERMISSIONS.EDIT_DESIGN_SYSTEM).toBe("design:edit");
    expect(PERMISSIONS.VIEW_UPM).toBe("upm:view");
    expect(PERMISSIONS.EDIT_UPM).toBe("upm:edit");
    expect(PERMISSIONS.VIEW_DASHBOARD).toBe("dashboard:view");
    expect(PERMISSIONS.CREATE_PROJECT).toBe("project:create");
    expect(PERMISSIONS.ACCESS_DEVTOOLS).toBe("access:devtools");
    expect(PERMISSIONS.VIEW_MORNING_BRIEFING).toBe("briefing:view");
    expect(PERMISSIONS.MASQUERADE_USER).toBe("masquerade:user");
    expect(PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX).toBe("feedback:inbox");
    expect(PERMISSIONS.MANAGE_FORMS).toBe("forms:manage");
    expect(PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG).toBe("issues:report-config");
    expect(PERMISSIONS.VIEW_LOCATION_TRACKING).toBe("location:view");
  });
});

describe("ROLE_PERMISSIONS map", () => {
  it("grants ADMIN all permissions (ADMIN is the top-level role)", () => {
    const adminPerms = ROLE_PERMISSIONS.ADMIN;
    const allPermissions = Object.values(PERMISSIONS);
    expect(adminPerms).toEqual(expect.arrayContaining(allPermissions));
    expect(adminPerms).toHaveLength(allPermissions.length);
  });

  it("grants ADMIN masquerade and morning briefing permissions", () => {
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.MASQUERADE_USER);
    expect(ROLE_PERMISSIONS.ADMIN).toContain(PERMISSIONS.VIEW_MORNING_BRIEFING);
  });

  it("grants TEAM_LEAD MANAGE_PROJECTS and VIEW_PROJECTS", () => {
    const leadPerms = ROLE_PERMISSIONS.TEAM_LEAD;
    expect(leadPerms).toContain(PERMISSIONS.MANAGE_PROJECTS);
    expect(leadPerms).toContain(PERMISSIONS.VIEW_PROJECTS);
    expect(leadPerms).toContain(PERMISSIONS.INVITE_MEMBER);
  });

  it("grants DESIGNER VIEW_PROJECTS but not MANAGE_PROJECTS", () => {
    const designerPerms = ROLE_PERMISSIONS.DESIGNER;
    expect(designerPerms).toContain(PERMISSIONS.VIEW_PROJECTS);
    expect(designerPerms).not.toContain(PERMISSIONS.MANAGE_PROJECTS);
    expect(designerPerms).toContain(PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX);
  });

  it("grants MEMBER VIEW_TEAM and VIEW_PROJECTS", () => {
    const memberPerms = ROLE_PERMISSIONS.MEMBER;
    expect(memberPerms).toContain(PERMISSIONS.VIEW_TEAM);
    expect(memberPerms).toContain(PERMISSIONS.VIEW_PROJECTS);
    expect(memberPerms).not.toContain(PERMISSIONS.INVITE_MEMBER);
    expect(memberPerms).not.toContain(PERMISSIONS.MANAGE_ROLES);
    expect(memberPerms).not.toContain(PERMISSIONS.REMOVE_MEMBER);
    expect(memberPerms).not.toContain(PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX);
  });
});

describe("hasPermission()", () => {
  it("treats legacy SUPER_ADMIN JWT role as ADMIN (transitional alias)", () => {
    // Pre-migration JWTs may still carry role="SUPER_ADMIN". hasPermission()
    // must treat them identically to ADMIN until tokens expire/refresh.
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.INVITE_MEMBER)).toBe(true);
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.MASQUERADE_USER)).toBe(true);
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.VIEW_MORNING_BRIEFING)).toBe(true);
    expect(hasPermission("SUPER_ADMIN", PERMISSIONS.MANAGE_ROLES)).toBe(true);
  });

  it("returns true when ADMIN checks INVITE_MEMBER", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.INVITE_MEMBER)).toBe(true);
  });

  it("returns true when MEMBER checks VIEW_TEAM", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_TEAM)).toBe(true);
  });

  it("returns true when TEAM_LEAD checks MANAGE_PROJECTS", () => {
    expect(hasPermission("TEAM_LEAD", PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
  });

  it("returns false when MEMBER checks INVITE_MEMBER", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.INVITE_MEMBER)).toBe(false);
  });

  it("returns false when MEMBER checks MANAGE_ROLES", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_ROLES)).toBe(false);
  });

  it("returns false when MEMBER checks REMOVE_MEMBER", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.REMOVE_MEMBER)).toBe(false);
  });

  it("returns false when MEMBER checks VIEW_LOCATION_TRACKING by default", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.VIEW_LOCATION_TRACKING)).toBe(false);
  });

  it("returns true when MEMBER has VIEW_LOCATION_TRACKING via special permission", () => {
    expect(
      hasPermission("MEMBER", PERMISSIONS.VIEW_LOCATION_TRACKING, [PERMISSIONS.VIEW_LOCATION_TRACKING]),
    ).toBe(true);
  });

  it("returns true when ADMIN checks VIEW_LOCATION_TRACKING", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.VIEW_LOCATION_TRACKING)).toBe(true);
  });

  it("returns false for unknown role", () => {
    expect(hasPermission("UNKNOWN" as never, PERMISSIONS.VIEW_TEAM)).toBe(false);
  });
});

describe("DEVELOPER permissions", () => {
  it("has ACCESS_DEVTOOLS permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(true);
  });

  it("has VIEW_TEAM permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.VIEW_TEAM)).toBe(true);
  });

  it("has VIEW_PROJECTS permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.VIEW_PROJECTS)).toBe(true);
  });

  it("has VIEW_DASHBOARD permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.VIEW_DASHBOARD)).toBe(true);
  });

  it("does NOT have INVITE_MEMBER permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.INVITE_MEMBER)).toBe(false);
  });

  it("does NOT have MANAGE_ROLES permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.MANAGE_ROLES)).toBe(false);
  });

  it("does NOT have REMOVE_MEMBER permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.REMOVE_MEMBER)).toBe(false);
  });

  it("does NOT have MANAGE_PROJECTS permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.MANAGE_PROJECTS)).toBe(false);
  });

  it("has SPECIAL_ACCESS_FEEDBACK_INBOX permission", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX)).toBe(true);
  });
});

describe("ACCESS_DEVTOOLS permission", () => {
  it("ADMIN has ACCESS_DEVTOOLS", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(true);
  });

  it("MEMBER does NOT have ACCESS_DEVTOOLS", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(false);
  });

  it("INSTALL_MANAGER does NOT have ACCESS_DEVTOOLS", () => {
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(false);
  });

  it("CONTROLS_MANAGER does NOT have ACCESS_DEVTOOLS", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(false);
  });

  it("DESIGNER has ACCESS_DEVTOOLS", () => {
    expect(hasPermission("DESIGNER", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(true);
  });
});

describe("CONTROLS_MANAGER permissions", () => {
  it("has VIEW_UPM permission", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.VIEW_UPM)).toBe(true);
  });

  it("has EDIT_UPM permission (can edit field tracker row values)", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.EDIT_UPM)).toBe(true);
  });

  it("does NOT have MANAGE_PROJECTS permission", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.MANAGE_PROJECTS)).toBe(false);
  });

  it("has VIEW_TEAM and VIEW_PROJECTS permissions", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.VIEW_TEAM)).toBe(true);
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.VIEW_PROJECTS)).toBe(true);
  });

  it("does NOT have INVITE_MEMBER or MANAGE_ROLES", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.INVITE_MEMBER)).toBe(false);
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.MANAGE_ROLES)).toBe(false);
  });

  it("does NOT have VIEW_DASHBOARD", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.VIEW_DASHBOARD)).toBe(false);
  });

  it("has CREATE_PROJECT permission", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.CREATE_PROJECT)).toBe(true);
  });

  it("does NOT have MANAGE_PROJECTS (cannot delete/edit projects, just UPM rows)", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.MANAGE_PROJECTS)).toBe(false);
  });
});

describe("EDIT_UPM permission", () => {
  it("ADMIN has EDIT_UPM", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.EDIT_UPM)).toBe(true);
  });

  it("MEMBER does NOT have EDIT_UPM", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.EDIT_UPM)).toBe(false);
  });

  it("INSTALL_MANAGER does NOT have EDIT_UPM (has MANAGE_UNIT_STATUS instead for stage/status)", () => {
    // EDIT_UPM is specifically for CONTROLS_MANAGER (Field Tracker matrix data).
    // INSTALL_MANAGER controls stage/status via MANAGE_UNIT_STATUS, not EDIT_UPM.
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.EDIT_UPM)).toBe(false);
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
  });

  it("PROJECT_MANAGER has read-only VIEW_UPM but does NOT have EDIT_UPM", () => {
    expect(hasPermission("PROJECT_MANAGER", PERMISSIONS.VIEW_UPM)).toBe(true);
    expect(hasPermission("PROJECT_MANAGER", PERMISSIONS.EDIT_UPM)).toBe(false);
  });

  it("INSTALL_MANAGER does NOT have CREATE_PROJECT — adding projects is reserved for CONTROLS_MANAGER and above", () => {
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });
});

describe("CREATE_PROJECT permission — only ADMIN, CONTROLS_MANAGER, DESIGNER, DEVELOPER", () => {
  it("ADMIN has CREATE_PROJECT", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.CREATE_PROJECT)).toBe(true);
  });

  it("CONTROLS_MANAGER has CREATE_PROJECT", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.CREATE_PROJECT)).toBe(true);
  });

  it("DESIGNER has CREATE_PROJECT", () => {
    expect(hasPermission("DESIGNER", PERMISSIONS.CREATE_PROJECT)).toBe(true);
  });

  it("DEVELOPER has CREATE_PROJECT", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.CREATE_PROJECT)).toBe(true);
  });

  it("TEAM_LEAD does NOT have CREATE_PROJECT", () => {
    expect(hasPermission("TEAM_LEAD", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });

  it("INSTALL_DIRECTOR does NOT have CREATE_PROJECT (operational, not project creation)", () => {
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });

  it("PROJECT_MANAGER does NOT have CREATE_PROJECT", () => {
    expect(hasPermission("PROJECT_MANAGER", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });

  it("INSTALL_MANAGER does NOT have CREATE_PROJECT", () => {
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });

  it("MEMBER does NOT have CREATE_PROJECT", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.CREATE_PROJECT)).toBe(false);
  });
});

describe("MANAGE_UNIT_STATUS permission", () => {
  it("ADMIN has MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("ADMIN", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("INSTALL_MANAGER has MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("DESIGNER has MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("DESIGNER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("DEVELOPER has MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("CONTROLS_MANAGER does NOT have MANAGE_UNIT_STATUS (owns Field Tracker data, not stage/status)", () => {
    expect(hasPermission("CONTROLS_MANAGER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(false);
  });

  it("PROJECT_MANAGER has MANAGE_UNIT_STATUS to match Install Manager location edit access", () => {
    expect(hasPermission("PROJECT_MANAGER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("MEMBER does NOT have MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(false);
  });
});

describe("getProjectNavAccess()", () => {
  it("CONTROLS_MANAGER: canViewUPM=true and full nav (can see Units/Documents but not edit stage/status)", () => {
    const nav = getProjectNavAccess("CONTROLS_MANAGER");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("ADMIN: canViewUPM=true and full nav", () => {
    const nav = getProjectNavAccess("ADMIN");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("INSTALL_MANAGER: canViewUPM=true — has VIEW_UPM (granted in IM Location Builder access change)", () => {
    // INSTALL_MANAGER now has VIEW_UPM to access the Location Builder page.
    // They can add/edit/delete rows but NOT overwrite (overwrite requires EDIT_UPM).
    const nav = getProjectNavAccess("INSTALL_MANAGER");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("MEMBER: canViewUPM=false and full nav (no UPM restriction)", () => {
    const nav = getProjectNavAccess("MEMBER");
    expect(nav.canViewUPM).toBe(false);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("DESIGNER: canViewUPM=true and full nav (read-only access)", () => {
    const nav = getProjectNavAccess("DESIGNER");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("DEVELOPER: canViewUPM=true and full nav (read-only access)", () => {
    const nav = getProjectNavAccess("DEVELOPER");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });

  it("PROJECT_MANAGER: canViewUPM=true — read-only Location Builder access", () => {
    const nav = getProjectNavAccess("PROJECT_MANAGER");
    expect(nav.canViewUPM).toBe(true);
    expect(nav.canViewUnits).toBe(true);
    expect(nav.canViewDocuments).toBe(true);
  });
});

describe("getGlobalNavAccess()", () => {
  it("CONTROLS_MANAGER: canViewDashboard=false, canViewUsers=false", () => {
    const nav = getGlobalNavAccess("CONTROLS_MANAGER");
    expect(nav.canViewDashboard).toBe(false);
    expect(nav.canViewUsers).toBe(false);
  });

  it("CONTROLS_MANAGER with INVITE_MEMBER special permission: canViewUsers=true", () => {
    const nav = getGlobalNavAccess("CONTROLS_MANAGER", [PERMISSIONS.INVITE_MEMBER]);
    expect(nav.canViewDashboard).toBe(false);
    expect(nav.canViewUsers).toBe(true);
  });

  it("CONTROLS_MANAGER with MANAGE_ROLES special permission: canViewUsers=true", () => {
    const nav = getGlobalNavAccess("CONTROLS_MANAGER", [PERMISSIONS.MANAGE_ROLES]);
    expect(nav.canViewDashboard).toBe(false);
    expect(nav.canViewUsers).toBe(true);
  });

  it("ignores unrelated special permissions for canViewUsers", () => {
    const nav = getGlobalNavAccess("CONTROLS_MANAGER", [PERMISSIONS.VIEW_UPM]);
    expect(nav.canViewDashboard).toBe(false);
    expect(nav.canViewUsers).toBe(false);
  });

  it("ADMIN: canViewDashboard=true, canViewUsers=true", () => {
    const nav = getGlobalNavAccess("ADMIN");
    expect(nav.canViewDashboard).toBe(true);
    expect(nav.canViewUsers).toBe(true);
  });

  it("MEMBER: canViewDashboard=true, canViewUsers=true", () => {
    const nav = getGlobalNavAccess("MEMBER");
    expect(nav.canViewDashboard).toBe(true);
    expect(nav.canViewUsers).toBe(true);
  });

  it("INSTALL_MANAGER: canViewDashboard=true, canViewUsers=true", () => {
    const nav = getGlobalNavAccess("INSTALL_MANAGER");
    expect(nav.canViewDashboard).toBe(true);
    expect(nav.canViewUsers).toBe(true);
  });

  it("PROJECT_MANAGER: canViewDashboard=true, canViewUsers=true", () => {
    const nav = getGlobalNavAccess("PROJECT_MANAGER");
    expect(nav.canViewDashboard).toBe(true);
    expect(nav.canViewUsers).toBe(true);
  });
});

describe("MANAGE_FORMS permission", () => {
  it("ADMIN has MANAGE_FORMS via role defaults", () => {
    // ADMIN receives a catch-all that includes every permission
    expect(hasPermission("ADMIN", PERMISSIONS.MANAGE_FORMS)).toBe(true);
  });

  it("MEMBER does NOT have MANAGE_FORMS by default", () => {
    expect(hasPermission("MEMBER", PERMISSIONS.MANAGE_FORMS)).toBe(false);
  });

  it("INSTALL_DIRECTOR has MANAGE_FORMS via role defaults", () => {
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_FORMS)).toBe(true);
  });

  it("INSTALL_DIRECTOR has MANAGE_UNIT_STATUS", () => {
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_UNIT_STATUS)).toBe(true);
  });

  it("INSTALL_MANAGER does NOT have MANAGE_FORMS by default", () => {
    expect(hasPermission("INSTALL_MANAGER", PERMISSIONS.MANAGE_FORMS)).toBe(false);
  });

  it("DESIGNER does NOT have MANAGE_FORMS by default", () => {
    expect(hasPermission("DESIGNER", PERMISSIONS.MANAGE_FORMS)).toBe(false);
  });

  it("DEVELOPER does NOT have MANAGE_FORMS by default", () => {
    expect(hasPermission("DEVELOPER", PERMISSIONS.MANAGE_FORMS)).toBe(false);
  });

  it("any role with MANAGE_FORMS as a special permission is granted access", () => {
    expect(
      hasPermission("MEMBER", PERMISSIONS.MANAGE_FORMS, [PERMISSIONS.MANAGE_FORMS]),
    ).toBe(true);
    expect(
      hasPermission("INSTALL_MANAGER", PERMISSIONS.MANAGE_FORMS, [PERMISSIONS.MANAGE_FORMS]),
    ).toBe(true);
  });

  it("unrelated special permissions do NOT grant MANAGE_FORMS", () => {
    expect(
      hasPermission("MEMBER", PERMISSIONS.MANAGE_FORMS, [PERMISSIONS.INVITE_MEMBER]),
    ).toBe(false);
  });
});

describe("canManageForms()", () => {
  it("returns true for ADMIN and for special-permission grants", () => {
    expect(canManageForms("ADMIN")).toBe(true);
    expect(canManageForms("MEMBER", [PERMISSIONS.MANAGE_FORMS])).toBe(true);
    expect(canManageForms("MEMBER")).toBe(false);
  });

  it("returns true for INSTALL_DIRECTOR via role defaults", () => {
    expect(canManageForms("INSTALL_DIRECTOR")).toBe(true);
  });
});

describe("canManageIssueReportConfig()", () => {
  it("returns true for ADMIN and INSTALL_DIRECTOR", () => {
    expect(canManageIssueReportConfig("ADMIN")).toBe(true);
    expect(canManageIssueReportConfig("INSTALL_DIRECTOR")).toBe(true);
  });

  it("returns true when granted via special permission", () => {
    expect(
      canManageIssueReportConfig("MEMBER", [PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG]),
    ).toBe(true);
  });

  it("returns false for MEMBER without special permission", () => {
    expect(canManageIssueReportConfig("MEMBER")).toBe(false);
  });
});

describe("INSTALL_DIRECTOR operational leadership bundle", () => {
  it("uses OPERATIONAL_LEADERSHIP_PERMISSIONS in ROLE_PERMISSIONS", () => {
    expect(ROLE_PERMISSIONS.INSTALL_DIRECTOR).toEqual(OPERATIONAL_LEADERSHIP_PERMISSIONS);
  });

  it("has MANAGE_FORMS, MANAGE_ISSUE_REPORT_CONFIG, MANAGE_PROJECTS, and CALIBRATE_INSPECTION", () => {
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_FORMS)).toBe(true);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG)).toBe(true);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.CALIBRATE_INSPECTION)).toBe(true);
  });

  it("does NOT have platform-admin permissions", () => {
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MANAGE_ROLES)).toBe(false);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.MASQUERADE_USER)).toBe(false);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.ACCESS_DEVTOOLS)).toBe(false);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.VIEW_MORNING_BRIEFING)).toBe(false);
    expect(hasPermission("INSTALL_DIRECTOR", PERMISSIONS.VIEW_UPM)).toBe(false);
  });
});

describe("isFieldLeadershipRole()", () => {
  it("returns true for ADMIN and INSTALL_DIRECTOR", () => {
    expect(isFieldLeadershipRole("ADMIN")).toBe(true);
    expect(isFieldLeadershipRole("INSTALL_DIRECTOR")).toBe(true);
  });

  it("treats SUPER_ADMIN as ADMIN", () => {
    expect(isFieldLeadershipRole("SUPER_ADMIN")).toBe(true);
  });

  it("returns false for INSTALL_MANAGER and MEMBER", () => {
    expect(isFieldLeadershipRole("INSTALL_MANAGER")).toBe(false);
    expect(isFieldLeadershipRole("MEMBER")).toBe(false);
  });
});

describe("formatRole()", () => {
  it("formats TEAM_LEAD as Team Lead", () => {
    expect(formatRole("TEAM_LEAD")).toBe("Team Lead");
  });

  it("formats single word", () => {
    expect(formatRole("ADMIN")).toBe("Admin");
  });

  it("formats MEMBER", () => {
    expect(formatRole("MEMBER")).toBe("Member");
  });

  it("formats BI_ANALYST as 'BI Analyst' (not 'Bi Analyst')", () => {
    expect(formatRole("BI_ANALYST")).toBe("BI Analyst");
  });
});
