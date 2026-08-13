/**
 * Offline module registry.
 *
 * Each entry describes a data set the user can choose to have available
 * when they're on-site without connectivity.
 *
 * The "projects" category modules (projects, units, observations, issues) are
 * bundled — they are not shown as individual checkboxes. Enabling a project
 * via the per-project toggle caches all of them for that project.
 *
 * `available` gates whether the module appears in the UI at all.
 */

export interface OfflineModule {
  /** Stable identifier stored in OfflinePreference.modules[] */
  id: string;
  label: string;
  description: string;
  /** Rough storage estimate shown to the user */
  estimatedSize: string;
  /** Set false for modules whose tools haven't been built yet */
  available: boolean;
  /** Category for grouping in the UI */
  category: "core" | "projects";
}

export const OFFLINE_MODULES: OfflineModule[] = [
  // ── Core ──────────────────────────────────────────────────────────────
  {
    id: "my-profile",
    label: "My Profile",
    description: "Your account info and role — always cached automatically.",
    estimatedSize: "< 1 KB",
    available: true,
    category: "core",
  },
  {
    id: "team-directory",
    label: "Team Directory",
    description: "Names, emails, and roles for every team member.",
    estimatedSize: "~5 KB",
    available: true,
    category: "core",
  },

  // ── Projects bundle (triggered by per-project toggle, not individual checkboxes) ─
  {
    id: "projects",
    label: "Projects",
    description: "Active project list with status and key dates.",
    estimatedSize: "~25 KB",
    available: true,
    category: "projects",
  },
  {
    id: "units",
    label: "Units & Scopes",
    description: "Scope-of-work items and install statuses per unit.",
    estimatedSize: "~100 KB",
    available: true,
    category: "projects",
  },
  {
    id: "observations",
    label: "Observations",
    description: "Field observations logged against units.",
    estimatedSize: "~30 KB",
    available: true,
    category: "projects",
  },
  {
    id: "issues",
    label: "Issues",
    description: "Blocking and non-blocking issues per project.",
    estimatedSize: "~20 KB",
    available: true,
    category: "projects",
  },
  {
    id: "subcontractors",
    label: "Subcontractors",
    description: "Installer directory for scope assignment offline.",
    estimatedSize: "~15 KB",
    available: true,
    category: "projects",
  },
  {
    id: "published-forms",
    label: "Inspection Forms",
    description: "Published inspection form templates.",
    estimatedSize: "~50 KB",
    available: true,
    category: "projects",
  },
  {
    id: "inspection-submissions",
    label: "Inspection Submissions",
    description: "Clear and calibration inspection records per project.",
    estimatedSize: "~80 KB",
    available: true,
    category: "projects",
  },
  {
    id: "inspections-reports",
    label: "Inspections Log",
    description: "Inspection log report data for offline browsing.",
    estimatedSize: "~120 KB",
    available: true,
    category: "projects",
  },
  {
    id: "activity-pages",
    label: "Activity Log",
    description: "Recent project activity for offline browsing.",
    estimatedSize: "~60 KB",
    available: true,
    category: "projects",
  },
  {
    id: "entity-comments",
    label: "Issue & Observation Comments",
    description: "Comment threads on field notes for offline reading.",
    estimatedSize: "~40 KB",
    available: true,
    category: "projects",
  },
  {
    id: "sub-scopes",
    label: "Sub-scopes",
    description: "Sub-scope definitions for unit cards offline.",
    estimatedSize: "~20 KB",
    available: true,
    category: "projects",
  },
  {
    id: "custom-site-locations",
    label: "Custom Site Locations",
    description: "User-defined site areas for field notes offline.",
    estimatedSize: "~10 KB",
    available: true,
    category: "projects",
  },
];

export const OFFLINE_MODULE_MAP = Object.fromEntries(
  OFFLINE_MODULES.map((m) => [m.id, m])
) as Record<string, OfflineModule>;

/** Modules that are always included regardless of user preferences */
export const ALWAYS_CACHED_MODULES = ["my-profile"] as const;

/** Module IDs that belong to the per-project bundle (not shown as individual toggles) */
export const PROJECT_BUNDLE_MODULE_IDS = [
  "projects",
  "units",
  "observations",
  "issues",
  "subcontractors",
  "published-forms",
  "inspection-submissions",
  "inspections-reports",
  "activity-pages",
  "entity-comments",
  "sub-scopes",
  "custom-site-locations",
  "project-notes",
] as const;
