export const PROJECTS_LIST_FILTERS_SESSION_KEY = "projectsListFilters";

export interface ProjectsListFiltersSession {
  searchQuery: string;
  statusFilter: string[];
  imFilter: string[];
  pmFilter: string[];
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseStoredFilters(raw: string): ProjectsListFiltersSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  const searchQuery = typeof record.searchQuery === "string" ? record.searchQuery : "";
  if (!isStringArray(record.statusFilter)) return null;
  if (!isStringArray(record.imFilter)) return null;
  if (!isStringArray(record.pmFilter)) return null;

  return {
    searchQuery,
    statusFilter: record.statusFilter,
    imFilter: record.imFilter,
    pmFilter: record.pmFilter,
  };
}

export function readProjectsListFiltersSession(): ProjectsListFiltersSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PROJECTS_LIST_FILTERS_SESSION_KEY);
    if (!raw) return null;
    return parseStoredFilters(raw);
  } catch {
    return null;
  }
}

export function writeProjectsListFiltersSession(filters: ProjectsListFiltersSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PROJECTS_LIST_FILTERS_SESSION_KEY, JSON.stringify(filters));
  } catch {
    // sessionStorage may be blocked in privacy modes — fail silently
  }
}

export function clearProjectsListFiltersSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PROJECTS_LIST_FILTERS_SESSION_KEY);
  } catch {
    // ignore
  }
}
