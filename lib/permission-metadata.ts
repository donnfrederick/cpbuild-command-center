import { PERMISSIONS, type Permission } from "@/lib/permissions";

export type PermissionCategory =
  | "team"
  | "projects"
  | "fieldTracker"
  | "admin"
  | "forms"
  | "bi"
  | "locationTracking";

export interface PermissionMeta {
  code: Permission;
  label: string;
  description: string;
  category: PermissionCategory;
  roleGrantable: boolean;
}

function humanizeKey(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

type MetaInput = Omit<PermissionMeta, "code">;

const META_BY_KEY: Record<keyof typeof PERMISSIONS, MetaInput> = {
  INVITE_MEMBER: {
    label: humanizeKey("INVITE_MEMBER"),
    description: "Invite new team members and manage pending invites.",
    category: "team",
    roleGrantable: true,
  },
  VIEW_TEAM: {
    label: humanizeKey("VIEW_TEAM"),
    description: "View the team directory and member list.",
    category: "team",
    roleGrantable: true,
  },
  MANAGE_ROLES: {
    label: humanizeKey("MANAGE_ROLES"),
    description: "Manage user roles, special permissions, and role definitions.",
    category: "admin",
    roleGrantable: true,
  },
  REMOVE_MEMBER: {
    label: humanizeKey("REMOVE_MEMBER"),
    description: "Remove members from the workspace.",
    category: "team",
    roleGrantable: true,
  },
  EDIT_DESIGN_SYSTEM: {
    label: humanizeKey("EDIT_DESIGN_SYSTEM"),
    description: "Edit design system tokens and UI reference surfaces.",
    category: "admin",
    roleGrantable: true,
  },
  MANAGE_PROJECTS: {
    label: humanizeKey("MANAGE_PROJECTS"),
    description: "Edit project settings and metadata within assigned projects.",
    category: "projects",
    roleGrantable: true,
  },
  VIEW_PROJECTS: {
    label: humanizeKey("VIEW_PROJECTS"),
    description: "View the projects list and open project workspaces.",
    category: "projects",
    roleGrantable: true,
  },
  VIEW_UPM: {
    label: "View Field Tracker",
    description: "Read-only access to the Unit Plan Matrix (Field Tracker).",
    category: "fieldTracker",
    roleGrantable: true,
  },
  VIEW_DASHBOARD: {
    label: humanizeKey("VIEW_DASHBOARD"),
    description: "Access the main dashboard home page.",
    category: "projects",
    roleGrantable: true,
  },
  CREATE_PROJECT: {
    label: humanizeKey("CREATE_PROJECT"),
    description: "Create new projects via the Add Project flow.",
    category: "projects",
    roleGrantable: true,
  },
  EDIT_UPM: {
    label: "Edit Field Tracker",
    description: "Edit Field Tracker (UPM) row values in a project.",
    category: "fieldTracker",
    roleGrantable: true,
  },
  MANAGE_UNIT_STATUS: {
    label: "Manage Unit Status",
    description: "Update scope stage, scope status, and inspection status on unit rows.",
    category: "projects",
    roleGrantable: true,
  },
  VIEW_MORNING_BRIEFING: {
    label: "Morning Briefing",
    description: "Access the Morning Briefing admin page.",
    category: "admin",
    roleGrantable: true,
  },
  MASQUERADE_USER: {
    label: "Masquerade User",
    description: "Impersonate another user for support and debugging.",
    category: "admin",
    roleGrantable: false,
  },
  ACCESS_DEVTOOLS: {
    label: "Access DevTools",
    description: "Open the DevTools panel (logs, diagnostics, release tools).",
    category: "admin",
    roleGrantable: true,
  },
  PREVIEW_ROLE: {
    label: "Preview Role",
    description: "Temporarily preview the UI as another role.",
    category: "admin",
    roleGrantable: true,
  },
  SPECIAL_ACCESS_FEEDBACK_INBOX: {
    label: "Feedback Inbox",
    description: "Triage and manage the full feedback inbox.",
    category: "admin",
    roleGrantable: true,
  },
  ACCESS_BI_API: {
    label: "BI API Access",
    description: "Use read-only BI API keys for reporting integrations.",
    category: "bi",
    roleGrantable: true,
  },
  MANAGE_FORMS: {
    label: "Manage Forms",
    description: "Create, edit, publish, and delete inspection forms.",
    category: "forms",
    roleGrantable: true,
  },
  CALIBRATE_INSPECTION: {
    label: "Calibrate Inspection",
    description: "Perform calibration inspections on already-inspected scopes.",
    category: "forms",
    roleGrantable: true,
  },
  MANAGE_ISSUE_REPORT_CONFIG: {
    label: "Report Issue",
    description:
      "Manage issue types and responsible parties used when field users report issues (Project Settings → Issue config).",
    category: "forms",
    roleGrantable: true,
  },
  VIEW_LOCATION_TRACKING: {
    label: "Location Tracking",
    description:
      "View field GPS on activity logs (location blocks, GPS filters) and the activity heat map.",
    category: "locationTracking",
    roleGrantable: true,
  },
};

export const PERMISSION_METADATA: PermissionMeta[] = (
  Object.entries(PERMISSIONS) as [keyof typeof PERMISSIONS, Permission][]
).map(([key, code]) => ({
  code,
  ...META_BY_KEY[key],
}));

export const PERMISSION_METADATA_BY_CODE: Record<Permission, PermissionMeta> = Object.fromEntries(
  PERMISSION_METADATA.map((m) => [m.code, m]),
) as Record<Permission, PermissionMeta>;

export const ROLE_GRANTABLE_PERMISSIONS: PermissionMeta[] = PERMISSION_METADATA.filter(
  (m) => m.roleGrantable,
);

const GRANTABLE_CODE_SET = new Set(ROLE_GRANTABLE_PERMISSIONS.map((m) => m.code));

export function isRoleGrantablePermission(code: string): boolean {
  return GRANTABLE_CODE_SET.has(code as Permission);
}

/** Permissions the Role Manager checklist may edit (excludes masquerade:user, etc.). */
export function filterRoleGrantablePermissions(codes: readonly string[]): Permission[] {
  return codes.filter(isRoleGrantablePermission) as Permission[];
}

/** Human-readable label for a permission code (used in Users special-permissions UI). */
export function permissionLabel(code: string): string {
  return PERMISSION_METADATA_BY_CODE[code as Permission]?.label ?? code;
}
