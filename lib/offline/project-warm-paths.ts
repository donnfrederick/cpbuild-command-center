/**
 * Project sub-page paths warmed into pages-v1 during explicit pre-download.
 * Excludes /reports/* — portfolio reports stay online-only.
 */

export const PROJECT_WARM_SUB_PAGES = [
  "", // overview
  "/units",
  "/documents",
  "/upm",
  "/log",
  "/log/inspections",
  "/log/issues",
  "/log/observations",
  "/log/activity",
  "/issues-log", // legacy deep links
] as const;

/** Minimal HTML set for auto-warm on project entry (English only — halves SSR load). */
export const AUTO_WARM_HTML_SUB_PAGES = [
  "",
  "/units",
  "/log",
  "/log/inspections",
  "/log/issues",
  "/log/observations",
  "/log/activity",
] as const;

export type WarmHtmlMode = false | true | "minimal";

/** Per-project API endpoints warmed on every triggerResync (snapshot + SW cache). Background resync warms all unit albums once per session, then only session-touched units; full pre-download (`warmHtml: true`) always warms every unit. */
export function projectWarmApiUrls(projectId: string): string[] {
  return [
    `/api/projects/${projectId}/units`,
    `/api/projects/${projectId}/observations`,
    `/api/projects/${projectId}/issues`,
    `/api/projects/${projectId}/observations?projectLevel=true&limit=1`,
    `/api/projects/${projectId}/issues?projectLevel=true&limit=1`,
    `/api/projects/${projectId}/activity`,
    `/api/projects/${projectId}/inspections-report`,
    `/api/projects/${projectId}/sub-scopes`,
    `/api/projects/${projectId}/custom-site-locations`,
    `/api/inspection-submissions?projectId=${encodeURIComponent(projectId)}`,
  ];
}

export interface SnapshotUnitRow {
  projectId?: string;
  building?: string | null;
  level?: string | null;
  unit?: string | null;
}

/** Composite unitRef strings from snapshot unit rows (building|level|unit). */
export function unitRefsFromSnapshotUnits(units: unknown[], projectId?: string): string[] {
  const refs = new Set<string>();
  for (const raw of units) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as SnapshotUnitRow;
    if (projectId && row.projectId !== projectId) continue;
    if (!row.unit) continue;
    refs.add(`${row.building ?? ""}|${row.level ?? ""}|${row.unit}`);
  }
  return [...refs];
}

export function albumWarmApiUrls(projectId: string, unitRefs: string[]): string[] {
  return unitRefs.map(
    (unitRef) =>
      `/api/projects/${projectId}/album?unitRef=${encodeURIComponent(unitRef)}`,
  );
}

export function resolveWarmHtmlSubPages(mode: WarmHtmlMode): readonly string[] {
  if (mode === "minimal") return AUTO_WARM_HTML_SUB_PAGES;
  if (mode === true) return PROJECT_WARM_SUB_PAGES;
  return [];
}

export function warmHtmlLocales(mode: WarmHtmlMode): readonly string[] {
  return mode === "minimal" ? ["en"] : ["en", "es"];
}
