import { hasPermission, PERMISSIONS } from "@/lib/permissions";

const FIELD_DAILY_REPORT_ROLES = new Set([
  "ADMIN",
  "INSTALL_DIRECTOR",
  "INSTALL_MANAGER",
  "PROJECT_MANAGER",
]);

/** Roles that may generate and view their own field daily reports. */
export function canUseFieldDailyReport(roleCode: string): boolean {
  if (!hasPermission(roleCode, PERMISSIONS.VIEW_DASHBOARD)) return false;
  return FIELD_DAILY_REPORT_ROLES.has(roleCode);
}

/**
 * Who may generate a field daily report (global portfolio or project hub).
 * Project managers may view reports but not trigger generation.
 */
export function canGenerateFieldDailyReport(roleCode: string): boolean {
  if (!canUseFieldDailyReport(roleCode)) return false;
  return roleCode !== "PROJECT_MANAGER";
}

/** User id that owns the daily report header row for a project on a given day. */
export function resolveFieldDailyReportOwnerId(
  projectInstallManagerId: string | null | undefined,
  generatingUserId: string,
): string {
  return projectInstallManagerId ?? generatingUserId;
}

/**
 * Owner ids to check when locating a saved project slice.
 * Global portfolio reports are stored under the generating user's id; hub/history
 * slices use the assigned IM when present — try both so saves work from either surface.
 */
export function resolveFieldDailyReportOwnerUserIds(
  projectInstallManagerId: string | null | undefined,
  sessionUserId: string,
): string[] {
  const canonical = resolveFieldDailyReportOwnerId(projectInstallManagerId, sessionUserId);
  return canonical === sessionUserId ? [canonical] : [canonical, sessionUserId];
}

/**
 * Who may generate a project daily report from the hub.
 * - Assigned install manager (or any IM when the project has no IM yet)
 * - Admin / Install Director (on behalf of the assigned IM)
 */
export function canGenerateProjectFieldDailyReport(
  roleCode: string,
  userId: string,
  projectInstallManagerId: string | null | undefined,
): boolean {
  if (!canUseFieldDailyReport(roleCode)) return false;
  if (roleCode === "ADMIN" || roleCode === "INSTALL_DIRECTOR") return true;
  if (roleCode === "INSTALL_MANAGER") {
    return !projectInstallManagerId || projectInstallManagerId === userId;
  }
  return false;
}
