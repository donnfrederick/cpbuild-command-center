/**
 * Permission codes and role-permission mapping.
 * Roles are stored in DB; ROLE_PERMISSIONS defines bootstrap defaults.
 * Runtime checks prefer role_permissions rows when the server cache is warm
 * (see lib/role-permission-cache.ts — never imported from client components).
 */

declare global {
  // Populated on the server by lib/role-permission-cache.ts after warm/refresh.
  var __ccRolePermissionCache: Map<string, ReadonlySet<string>> | undefined;
}

export const PERMISSIONS = {
  INVITE_MEMBER: "invite:member",
  VIEW_TEAM: "view:team",
  MANAGE_ROLES: "manage:roles",
  REMOVE_MEMBER: "remove:member",
  EDIT_DESIGN_SYSTEM: "design:edit",
  MANAGE_PROJECTS: "projects:manage",
  VIEW_PROJECTS: "projects:view",
  /** Grants read access to the Unit Plan Matrix (Field Tracker) inside a project.
   * Explicitly granted to ADMIN, DESIGNER, DEVELOPER, CONTROLS_MANAGER, PROJECT_MANAGER,
   * BI_ANALYST, and INSTALL_MANAGER.
   * CONTROLS_MANAGER gets a restricted project nav (Overview + UPM only) because they
   * have EDIT_UPM but lack MANAGE_PROJECTS — see getProjectNavAccess().
   * INSTALL_MANAGER has VIEW_UPM + MANAGE_PROJECTS, giving them full write access to
   * Location Builder rows (add/edit/delete/upload) but NOT the overwrite mode — overwrite
   * is gated separately on EDIT_UPM at both the UI and API layers.
   * All other roles with this permission get the full project nav. */
  VIEW_UPM: "upm:view",
  /** Grants access to the main Dashboard home and the global Users nav item.
   * CONTROLS_MANAGER does not have this — their entry point is Projects only. */
  VIEW_DASHBOARD: "dashboard:view",
  /** Grants the ability to create new projects via the Add Project modal.
   * Granted to: ADMIN, CONTROLS_MANAGER, DESIGNER, DEVELOPER.
   * Operational roles (INSTALL_MANAGER, INSTALL_DIRECTOR, PROJECT_MANAGER, TEAM_LEAD)
   * manage work within existing projects but do not create new ones. */
  CREATE_PROJECT: "project:create",
  /** Grants the ability to edit UPM (field tracker) row values in a project.
   * Granted to ADMIN and CONTROLS_MANAGER only.
   * DESIGNER and DEVELOPER have VIEW_UPM (read-only) but not EDIT_UPM.
   * MANAGE_PROJECTS does NOT imply edit access to UPM — write gates on units
   * API routes check EDIT_UPM explicitly. */
  EDIT_UPM: "upm:edit",
  /** Grants the ability to update scopeStage, scopeStatus, and inspectionStatus on unit
   * rows (the stage/status columns on the Units/locations page). Separate from EDIT_UPM so that
   * INSTALL_MANAGER, PROJECT_MANAGER, DESIGNER, and DEVELOPER can advance unit stages without having
   * Field Tracker (UPM matrix) edit rights, and so CONTROLS_MANAGER can edit UPM
   * fields without being able to change stage/status values they don't own.
   * Granted to: ADMIN, DESIGNER, DEVELOPER, INSTALL_MANAGER, PROJECT_MANAGER.
   *
   * IMPORTANT — INSTALL_MANAGER issue access: Install Managers also have full operational
   * control over project issues (create, edit, resolve, reopen any issue — not just their
   * own). This is enforced in the issue API routes directly (not via a separate permission)
   * because the restriction is about field-work ownership, not a grantable permission code.
   * This ensures Install Managers can always view all issue content including attached photos,
   * resolve issues, and manage field work end-to-end. See:
   *   app/api/projects/[id]/issues/[issueId]/route.ts (PATCH)
   *   app/api/projects/[id]/issues/[issueId]/resolve/route.ts
   *   app/api/projects/[id]/issues/[issueId]/reopen/route.ts
   *   components/projects/IssueDetailModal.tsx */
  MANAGE_UNIT_STATUS: "unit:status-manage",
  /** Grants access to the Morning Briefing page — Phil's daily AI sprint document.
   * Restricted to ADMIN only. */
  VIEW_MORNING_BRIEFING: "briefing:view",
  /** Allows impersonating any user (except yourself) for debugging and support.
   * Restricted to ADMIN only. Never grant via UserSpecialPermission. */
  MASQUERADE_USER: "masquerade:user",
  /** Grants access to the DevTools panel (logs, diagnostics, tests, Unifier explorer, release tools).
   * Granted to ADMIN, DEVELOPER, and DESIGNER by default. Should not be granted to MEMBER or
   * operational roles — individual overrides are still possible via UserSpecialPermission. */
  ACCESS_DEVTOOLS: "access:devtools",
  /** Allows temporarily previewing the dashboard as any role to verify role-specific
   * UI gating, nav items, and permission-controlled features. Preview affects server-rendered
   * UI only — write operations always use the real session role. Granted to ADMIN, DESIGNER,
   * and DEVELOPER only. */
  PREVIEW_ROLE: "role:preview",
  /** Full access to the Feedback inbox (list all reports, triage, notes, delete, tour authoring).
   * Granted to ADMIN, DESIGNER, and DEVELOPER — not general membership roles. */
  SPECIAL_ACCESS_FEEDBACK_INBOX: "feedback:inbox",
  /** Grants access to the read-only BI/reporting API (/api/bi/v1/*) via API key.
   * Intended for the BI_ANALYST role and future external parties (subcontractors, GCs).
   * Does NOT grant web-app write access — BI API is read-only by design. */
  ACCESS_BI_API: "access:bi-api",
  /** Grants ability to create, edit, publish, and delete inspection forms in the Form Builder.
   * Role defaults: ADMIN, INSTALL_DIRECTOR. Others may receive it via UserSpecialPermission. */
  MANAGE_FORMS: "forms:manage",
  /** Grants ability to perform calibration inspections on scopes that have already been
   * inspected. Calibration inspections use the same form as the original inspection but are
   * stored separately (categorySnapshot: CALIBRATION_INSPECTION) and never affect scope
   * inspectionStatus. Granted to ADMIN, INSTALL_DIRECTOR, and PROJECT_MANAGER by default.
   * Can be granted per-user via UserSpecialPermission for supervisors on specific projects. */
  CALIBRATE_INSPECTION: "inspection:calibrate",
  /** Manage issue type and responsible party catalogs (Project Settings → Issue config).
   * Does not gate field users from logging issues — only catalog CRUD.
   * Role defaults: ADMIN (full access), INSTALL_DIRECTOR. Label in Role Manager: "Report Issue". */
  MANAGE_ISSUE_REPORT_CONFIG: "issues:report-config",
  /** View field GPS tracking: activity log location blocks, GPS outcome filters, and activity heat map.
   * Off by default for field roles — enable per role in Role Manager. ADMIN has all permissions. */
  VIEW_LOCATION_TRACKING: "location:view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Permissions that must never be granted via the Users special-permissions UI. */
export const NON_GRANTABLE_SPECIAL_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.MASQUERADE_USER,
];

export function canManageForms(roleCode: string, specialPerms?: string[]): boolean {
  return hasPermission(roleCode, PERMISSIONS.MANAGE_FORMS, specialPerms);
}

export function canManageIssueReportConfig(roleCode: string, specialPerms?: string[]): boolean {
  return hasPermission(roleCode, PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG, specialPerms);
}

export function canViewLocationTracking(roleCode: string, specialPerms?: string[]): boolean {
  return hasPermission(roleCode, PERMISSIONS.VIEW_LOCATION_TRACKING, specialPerms);
}

/** Role codes (match Role.code in DB). */
export type RoleCode =
  | "ADMIN"
  | "TEAM_LEAD"
  | "DESIGNER"
  | "MEMBER"
  | "PRODUCT"
  | "DEVELOPER"
  | "EXECUTIVE"
  | "CONTROLS_MANAGER"
  | "INSTALL_MANAGER"
  | "INSTALL_DIRECTOR"
  | "PROJECT_MANAGER"
  | "PROJECT_COORDINATOR"
  | "BI_ANALYST";

const FULL_ACCESS_PERMISSIONS = Object.values(PERMISSIONS) as Permission[];

/** Field-leadership operational parity with Admin — not platform admin. */
export const OPERATIONAL_LEADERSHIP_PERMISSIONS: Permission[] = [
  PERMISSIONS.VIEW_TEAM,
  PERMISSIONS.VIEW_PROJECTS,
  PERMISSIONS.MANAGE_PROJECTS,
  PERMISSIONS.VIEW_DASHBOARD,
  PERMISSIONS.MANAGE_UNIT_STATUS,
  PERMISSIONS.INVITE_MEMBER,
  PERMISSIONS.CALIBRATE_INSPECTION,
  PERMISSIONS.MANAGE_FORMS,
  PERMISSIONS.MANAGE_ISSUE_REPORT_CONFIG,
];

/** ADMIN and INSTALL_DIRECTOR — destructive field-leadership operations (inspection reset, etc.). */
export function isFieldLeadershipRole(roleCode: string): boolean {
  const code = roleCode === "SUPER_ADMIN" ? "ADMIN" : roleCode;
  return code === "ADMIN" || code === "INSTALL_DIRECTOR";
}

export const ROLE_PERMISSIONS: Record<RoleCode, Permission[]> = {
  ADMIN: FULL_ACCESS_PERMISSIONS,
  // CREATE_PROJECT is intentionally absent: project creation is restricted to
  // CONTROLS_MANAGER, DESIGNER, DEVELOPER, and ADMIN.
  TEAM_LEAD: [
    PERMISSIONS.INVITE_MEMBER,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.EDIT_DESIGN_SYSTEM,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_DASHBOARD,
  ],
  DESIGNER: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.EDIT_DESIGN_SYSTEM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.CREATE_PROJECT,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.ACCESS_DEVTOOLS,
    PERMISSIONS.PREVIEW_ROLE,
    PERMISSIONS.VIEW_UPM,
    PERMISSIONS.MANAGE_UNIT_STATUS,
    PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX,
    PERMISSIONS.CALIBRATE_INSPECTION,
  ],
  MEMBER: [PERMISSIONS.VIEW_TEAM, PERMISSIONS.VIEW_PROJECTS, PERMISSIONS.VIEW_DASHBOARD],
  PRODUCT: [PERMISSIONS.VIEW_TEAM, PERMISSIONS.VIEW_PROJECTS, PERMISSIONS.VIEW_DASHBOARD],
  DEVELOPER: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.CREATE_PROJECT,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.ACCESS_DEVTOOLS,
    PERMISSIONS.PREVIEW_ROLE,
    PERMISSIONS.VIEW_UPM,
    PERMISSIONS.MANAGE_UNIT_STATUS,
    PERMISSIONS.SPECIAL_ACCESS_FEEDBACK_INBOX,
    PERMISSIONS.CALIBRATE_INSPECTION,
  ],
  EXECUTIVE: [PERMISSIONS.VIEW_TEAM, PERMISSIONS.VIEW_PROJECTS, PERMISSIONS.VIEW_DASHBOARD],
  // CONTROLS_MANAGER intentionally omits VIEW_DASHBOARD — entry point is Projects only.
  // CREATE_PROJECT lets them add projects without full management rights.
  // EDIT_UPM gives full CRUD over Field Tracker (UPM) rows — their primary domain.
  // MANAGE_UNIT_STATUS is intentionally absent: stage/status is owned by Install Managers.
  CONTROLS_MANAGER: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_UPM,
    PERMISSIONS.CREATE_PROJECT,
    PERMISSIONS.EDIT_UPM,
  ],
  // CREATE_PROJECT is intentionally absent: adding projects is reserved for
  // CONTROLS_MANAGER and above. Install Managers manage work within existing
  // projects but do not create new ones.
  // EDIT_UPM is intentionally absent: IMs can add/edit/delete rows and upload
  // in add/merge mode, but the "overwrite existing rows" action (destructive
  // full-replace) is restricted to EDIT_UPM holders (ADMIN, CONTROLS_MANAGER).
  INSTALL_MANAGER: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_UNIT_STATUS,
    PERMISSIONS.CALIBRATE_INSPECTION,
    PERMISSIONS.VIEW_UPM,
  ],
  // INSTALL_DIRECTOR — field leadership with operational parity to ADMIN for
  // forms, subcontractors, inspections, progress, issues/observations — not platform admin.
  INSTALL_DIRECTOR: OPERATIONAL_LEADERSHIP_PERMISSIONS,
  // CREATE_PROJECT is intentionally absent: project creation is restricted to
  // CONTROLS_MANAGER, DESIGNER, DEVELOPER, and ADMIN.
  PROJECT_MANAGER: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_UPM,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_UNIT_STATUS,
    PERMISSIONS.CALIBRATE_INSPECTION,
  ],
  PROJECT_COORDINATOR: [PERMISSIONS.VIEW_TEAM, PERMISSIONS.VIEW_PROJECTS, PERMISSIONS.VIEW_DASHBOARD],
  // BI_ANALYST is a read-only role for internal BI consumers (e.g. Power BI reporting).
  // VIEW_UPM is included so Tosh can browse the Field Tracker in the web app (read-only).
  // Intentionally omits SPECIAL_ACCESS_FEEDBACK_INBOX — Feedback is an internal team tool.
  // Intentionally omits all write permissions — BI consumers never modify data.
  BI_ANALYST: [
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_PROJECTS,
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_UPM,
    PERMISSIONS.ACCESS_BI_API,
  ],
};

/** Built-in role codes seeded from ROLE_PERMISSIONS — cannot be deleted via Role Manager. */
export const BUILTIN_ROLE_CODES = Object.keys(ROLE_PERMISSIONS) as RoleCode[];

export function isBuiltinRoleCode(code: string): boolean {
  return (BUILTIN_ROLE_CODES as string[]).includes(code);
}

function readServerRolePermissionCache(roleCode: string): readonly string[] | undefined {
  const map = globalThis.__ccRolePermissionCache;
  if (!map) return undefined;
  const entry = map.get(roleCode);
  if (entry === undefined) return undefined;
  return [...entry];
}

function resolveRoleDefaultPermissions(roleCode: string): Permission[] {
  const cached = readServerRolePermissionCache(roleCode);
  if (cached !== undefined) {
    return cached as Permission[];
  }
  const codeDefaults = ROLE_PERMISSIONS[roleCode as RoleCode];
  return codeDefaults ?? [];
}

/**
 * Synchronous permission check. Uses warmed DB cache when available.
 *
 * Checks role defaults first. If the role doesn't have the permission,
 * checks the optional `specialPermissions` array (codes loaded from
 * session or a prior DB query).
 *
 * @param roleCode       - e.g. "ADMIN", "INSTALL_MANAGER"
 * @param permission     - e.g. PERMISSIONS.INVITE_MEMBER
 * @param specialPerms   - optional array of permission codes granted to this user specifically
 */
export function hasPermission(
  roleCode: string,
  permission: Permission,
  specialPerms?: string[]
): boolean {
  // Transitional alias: JWT sessions minted before the SUPER_ADMIN→ADMIN role
  // merge will carry role="SUPER_ADMIN" until they expire/refresh. Treat them
  // as ADMIN so existing sessions keep working without a forced sign-out.
  const normalizedCode = roleCode === "SUPER_ADMIN" ? "ADMIN" : roleCode;
  const rolePerms = resolveRoleDefaultPermissions(normalizedCode);
  if (rolePerms.includes(permission)) return true;
  if (specialPerms && specialPerms.includes(permission)) return true;
  return false;
}

/**
 * Full permission check: role defaults + any special permissions granted to this user.
 * Use on server routes where you have both session.user.role AND session.user.id.
 *
 * @example
 * const ok = await hasPermissionWithOverrides(session.user.role, session.user.id, PERMISSIONS.INVITE_MEMBER, db);
 */
export async function hasPermissionWithOverrides(
  roleCode: string,
  userId: string,
  permission: Permission,
  db: import("@prisma/client").PrismaClient
): Promise<boolean> {
  // Fast path: role already grants this permission
  if (hasPermission(roleCode, permission)) return true;

  // Check for a user-level special permission grant
  const special = await db.userSpecialPermission.findUnique({
    where: { userId_permission: { userId, permission } },
    select: { id: true },
  });
  return special !== null;
}

/**
 * Computes which project workspace nav sections a role can access.
 *
 * Field Tracker (UPM) access is governed exclusively by VIEW_UPM.
 * Roles with VIEW_UPM: ADMIN, DESIGNER, DEVELOPER, CONTROLS_MANAGER, PROJECT_MANAGER,
 * BI_ANALYST, and INSTALL_MANAGER.
 * MANAGE_PROJECTS does NOT grant UPM access by itself — INSTALL_MANAGER holds both
 * VIEW_UPM and MANAGE_PROJECTS, giving them add/edit/delete access but not overwrite
 * (overwrite is separately gated on EDIT_UPM).
 *
 * Units and Documents are available to all roles that can participate in project work.
 * CONTROLS_MANAGER sees Units (read-only for stage/status — they lack MANAGE_UNIT_STATUS)
 * alongside their primary Field Tracker access.
 */
export function getProjectNavAccess(roleCode: string): {
  canViewUPM: boolean;
  canViewUnits: boolean;
  canViewDocuments: boolean;
} {
  return {
    canViewUPM: hasPermission(roleCode, PERMISSIONS.VIEW_UPM),
    canViewUnits: true,
    canViewDocuments: true,
  };
}

/**
 * Computes which global (dashboard-level) nav items a role can access.
 *
 * CONTROLS_MANAGER lacks VIEW_DASHBOARD so their default global nav is Projects
 * only. However, if they have been granted INVITE_MEMBER or MANAGE_ROLES as a
 * special permission they should also see the Users nav: INVITE_MEMBER to use
 * the invite flow, MANAGE_ROLES to manage user permissions/roles.
 *
 * @param roleCode    - e.g. "CONTROLS_MANAGER"
 * @param specialPerms - optional special permission codes for this user (loaded
 *                       fresh from DB by getEffectiveSession — never stale JWT data)
 */
export function getGlobalNavAccess(roleCode: string, specialPerms?: string[]): {
  canViewDashboard: boolean;
  canViewUsers: boolean;
} {
  const canViewDashboard = hasPermission(roleCode, PERMISSIONS.VIEW_DASHBOARD, specialPerms);
  const canInvite = hasPermission(roleCode, PERMISSIONS.INVITE_MEMBER, specialPerms);
  const canManageRoles = hasPermission(roleCode, PERMISSIONS.MANAGE_ROLES, specialPerms);
  return {
    canViewDashboard,
    // Show Users nav for anyone who can view the dashboard, invite members, or
    // manage roles. This lets roles like CONTROLS_MANAGER access the Users page
    // after being granted the appropriate special permission.
    canViewUsers: canViewDashboard || canInvite || canManageRoles,
  };
}

/** Human-readable role label from code (e.g. INSTALL_MANAGER -> Install Manager). */
const ROLE_DISPLAY_NAMES: Partial<Record<RoleCode, string>> = {
  BI_ANALYST: "BI Analyst",
};

export function formatRole(roleCode: string): string {
  if (roleCode in ROLE_DISPLAY_NAMES) return ROLE_DISPLAY_NAMES[roleCode as RoleCode]!;
  return roleCode
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
