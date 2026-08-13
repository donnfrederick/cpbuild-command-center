/**
 * Shared type definitions for the Projects module (API / UI).
 * Display fields are merged from Unifier shells at read time — see `lib/project-unifier-merge.ts`.
 */

export type ProjectStatus = "Active" | "Completed" | "Planning" | "On Hold";

/** Maps internal enum-style keys to API display values (used with `mapUnifierStatus` results). */
export const statusFromDb = {
  Active: "Active",
  Completed: "Completed",
  Planning: "Planning",
  OnHold: "On Hold",
} as const;

export type SortDirection = "asc" | "desc";

export type ProjectSortField =
  | "projectName"
  | "siteLocation"
  | "status"
  | "startDate"
  | "unifierProjectNumber"
  | "installManagerName"
  | "projectManagerName";

export interface Project {
  id: string;
  projectName: string;
  siteLocation: string;
  /**
   * Unifier `CP_PROJECT_PHASEPD` — shown verbatim in the UI (may be empty if Unifier sends null).
   */
  status: string;
  /**
   * Derived from Unifier `UUU_SHELL_STATUS` — used for badge coloring, table filters, and portfolio AI inclusion.
   */
  lifecycleStatus: ProjectStatus;
  startDate: string | null;
  installManagerId: string | null;
  installManagerName: string | null;
  projectManagerId: string | null;
  projectManagerName: string;
  unifierPid: string | null;
  unifierProjectNumber: string | null;
  /** Distinct scope type names used across this project's rows (e.g. ["Ceramic Tile", "Countertop"]). */
  scopeTypes: string[];
  /** True when this is a production test/sandbox project (squad visibility in strict prod). */
  isTestProject: boolean;
  /** Set when duplicated from another project via Admin clone. */
  clonedFromProjectId: string | null;
  /** Display name of the source project (resolved from Unifier when available). */
  clonedFromProjectName: string | null;
  clonedAt: string | null;
  /** True when the current user has pinned this project on the Projects list. */
  isFavorite: boolean;
}

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "Active",
  "Completed",
  "Planning",
  "On Hold",
] as const;

export const SEARCH_DEBOUNCE_MS = 300;
