import type { PortfolioProjectListItem } from "@/lib/reports/portfolio-progress-types";

/** Sentinel for projects with no install manager assigned. */
export const PORTFOLIO_IM_UNASSIGNED = "";

export function normalizeInstallManagerName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : PORTFOLIO_IM_UNASSIGNED;
}

export function normalizeProjectManagerName(name: string | null | undefined): string {
  return name?.trim() ?? "";
}

export function uniqueInstallManagers(projects: readonly PortfolioProjectListItem[]): string[] {
  return Array.from(
    new Set(projects.map((p) => normalizeInstallManagerName(p.installManagerName))),
  ).sort((a, b) => {
    if (a === PORTFOLIO_IM_UNASSIGNED) return 1;
    if (b === PORTFOLIO_IM_UNASSIGNED) return -1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

export function uniqueProjectManagers(projects: readonly PortfolioProjectListItem[]): string[] {
  return Array.from(
    new Set(
      projects
        .map((p) => normalizeProjectManagerName(p.projectManagerName))
        .filter((name) => name.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function projectMatchesPeopleFilters(
  project: PortfolioProjectListItem,
  pmFilter: readonly string[],
  imFilter: readonly string[],
): boolean {
  const matchesPM =
    pmFilter.length === 0 ||
    pmFilter.includes(normalizeProjectManagerName(project.projectManagerName));
  const matchesIM =
    imFilter.length === 0 ||
    imFilter.includes(normalizeInstallManagerName(project.installManagerName));
  return matchesPM && matchesIM;
}

export function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
}
