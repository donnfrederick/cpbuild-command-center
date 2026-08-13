/** Locale-prefixed href for a project's Locations (units) page. */
export function buildProjectLocationsHref(locale: string, projectId: string): string {
  const safeLocale = locale.trim() || "en";
  return `/${safeLocale}/projects/${encodeURIComponent(projectId)}/units`;
}

/** Map Unifier PID → Command Center project id from GET /api/projects. */
export function projectIdByUnifierPidFromList(
  projects: readonly { id: string; unifierPid?: string | null }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const project of projects) {
    if (project.unifierPid) {
      map.set(project.unifierPid, project.id);
    }
  }
  return map;
}
