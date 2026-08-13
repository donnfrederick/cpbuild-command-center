import {
  normalizeInstallManagerName,
  normalizeProjectManagerName,
  PORTFOLIO_IM_UNASSIGNED,
} from "@/lib/reports/portfolio-progress-filters";
import type { ProjectActivityRow } from "@/lib/reports/project-activity-types";

export type { ActivityCountSort } from "@/lib/reports/activity-count-shared";
export { maxActivityCount, sortActivityCountRows } from "@/lib/reports/activity-count-shared";

function matchesPeopleFilters(
  row: ProjectActivityRow,
  pmFilter: readonly string[],
  imFilter: readonly string[],
): boolean {
  const matchesPM =
    pmFilter.length === 0 ||
    pmFilter.includes(normalizeProjectManagerName(row.projectManagerName));
  const matchesIM =
    imFilter.length === 0 ||
    imFilter.includes(normalizeInstallManagerName(row.installManagerName));
  return matchesPM && matchesIM;
}

export function filterProjectActivityRows(
  rows: ProjectActivityRow[],
  options: {
    search: string;
    pmFilter: string[];
    imFilter: string[];
  },
): ProjectActivityRow[] {
  let result = rows;

  if (options.pmFilter.length > 0 || options.imFilter.length > 0) {
    result = result.filter((row) =>
      matchesPeopleFilters(row, options.pmFilter, options.imFilter),
    );
  }

  const q = options.search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.projectManagerName.toLowerCase().includes(q) ||
        normalizeInstallManagerName(row.installManagerName).toLowerCase().includes(q),
    );
  }

  return result;
}

export function uniqueProjectActivityPMs(rows: ProjectActivityRow[]): string[] {
  return Array.from(
    new Set(rows.map((row) => normalizeProjectManagerName(row.projectManagerName)).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function uniqueProjectActivityIMs(rows: ProjectActivityRow[]): string[] {
  return Array.from(
    new Set(rows.map((row) => normalizeInstallManagerName(row.installManagerName))),
  ).sort((a, b) => {
    if (a === PORTFOLIO_IM_UNASSIGNED) return 1;
    if (b === PORTFOLIO_IM_UNASSIGNED) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

export function projectActivitySubtitle(row: ProjectActivityRow): string {
  const pm = normalizeProjectManagerName(row.projectManagerName);
  const im = normalizeInstallManagerName(row.installManagerName);
  if (pm && im && im !== "") {
    return `${pm} · ${im}`;
  }
  if (pm) return pm;
  if (im && im !== "") return im;
  return "";
}
