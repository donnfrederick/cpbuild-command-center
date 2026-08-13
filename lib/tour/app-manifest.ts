/**
 * Tour App Manifest — structured context for Gemini tour generation.
 *
 * This is the single source of truth about what's in the app:
 *   - Which pages exist and what they do
 *   - Which data-tour CSS selectors are available on each page
 *   - What mock API fixtures are available for tour-mode mutations
 *   - Which roles exist and what they can see
 *
 * Passed verbatim to the /api/tour/generate endpoint so Gemini produces
 * selectors and page URLs that actually exist in the running app.
 */

import type { MockFixture } from "./types";

// ── Pages ──────────────────────────────────────────────────────────────────

export interface ManifestPage {
  path: string;
  label: string;
  description: string;
  roles?: string[]; // if set, only these roles see this page
}

export const MANIFEST_PAGES: ManifestPage[] = [
  {
    path: "/",
    label: "Dashboard",
    description:
      "Main dashboard with live project stats, recent activity, and a summary of all active projects. The home screen for every user.",
  },
  {
    path: "/projects",
    label: "Projects",
    description:
      "Master list of all construction projects. Searchable and filterable by status (Active, Planning, On Hold, Completed). Admins and members can add new projects here.",
  },
  {
    path: "/projects/[id]",
    label: "Project Detail",
    description:
      "Individual project workspace showing project metadata, unit tracker table, documents, and install phases.",
  },
  {
    path: "/users",
    label: "Team Directory",
    description:
      "List of all team members with their roles. Admins can invite new members, change roles, and remove access.",
    roles: ["ADMIN"],
  },
  {
    path: "/settings",
    label: "Settings",
    description: "Account settings, offline preferences, and locale switcher.",
  },
  {
    path: "/feedback",
    label: "Feedback",
    description:
      "Submit bug reports or feature requests. Admins can view and manage all submitted feedback.",
  },
];

// ── Selectors ──────────────────────────────────────────────────────────────

export interface ManifestSelector {
  selector: string;
  label: string;
  page: string;
  description?: string;
}

export const MANIFEST_SELECTORS: ManifestSelector[] = [
  // Dashboard
  {
    selector: "[data-tour='dashboard-stats']",
    label: "Dashboard stats cards",
    page: "/",
    description: "Summary cards showing active projects, pending items, and activity counts",
  },
  {
    selector: "#main-content",
    label: "Main content area",
    page: "/",
    description: "The main scrollable content region",
  },

  // Projects page
  {
    selector: "[data-tour='projects-table']",
    label: "Projects table",
    page: "/projects",
    description: "Table listing all projects with status, PM, location, and dates",
  },
  {
    selector: "[data-tour='projects-search']",
    label: "Search and filter bar",
    page: "/projects",
    description: "Text search field and status filter dropdown",
  },
  {
    selector: "[data-tour='add-project-button']",
    label: "Add Project button",
    page: "/projects",
    description: "Opens the Create Project modal",
  },
  {
    selector: "[data-tour='projects-table'] tr:first-of-type",
    label: "First project row",
    page: "/projects",
    description: "Click to open the first project in the list",
  },

  // Users / Team
  {
    selector: "[data-tour='team-directory']",
    label: "Team directory list",
    page: "/users",
    description: "Cards showing each team member's name, role, and email",
  },
  {
    selector: "[data-tour='invite-button']",
    label: "Invite member button",
    page: "/users",
    description: "Opens the invite modal to send an email invitation",
  },

  // TopBar
  {
    selector: "[data-tour='notification-bell']",
    label: "Notification bell",
    page: "*",
    description: "Bell icon in the top bar — shows unread notification count",
  },
  {
    selector: "[data-tour='locale-switcher']",
    label: "Language switcher",
    page: "*",
    description: "EN/ES language toggle in the top bar",
  },

  // Form fields (for type actions)
  {
    selector: "#project-name-input",
    label: "Project name field (Create Project modal)",
    page: "/projects",
    description: "Text input for the new project name inside the Create Project modal",
  },
  {
    selector: "#project-location-input",
    label: "Site location field (Create Project modal)",
    page: "/projects",
    description: "Text input for the site location inside the Create Project modal",
  },
];

// ── Mock fixtures ──────────────────────────────────────────────────────────

/**
 * Site tour mock fixtures — fake API responses returned during the site
 * walkthrough tour so no real data is created or modified.
 */
export const SITE_TOUR_FIXTURES: MockFixture[] = [
  {
    match: { method: "POST", urlPattern: /\/api\/projects/ },
    response: {
      status: 201,
      body: {
        id: "tour-demo-proj-001",
        projectName: "Skyline Residences — Demo",
        siteLocation: "123 Demo Ave, San Francisco, CA",
        status: "Pre-Construction",
        lifecycleStatus: "Planning",
        projectManagerName: "Alex Rivera",
        installManagerName: "Jordan Kim",
        unifierPid: null,
        createdAt: new Date().toISOString(),
      },
      delay: 600,
    },
  },
  {
    match: { method: "PATCH", urlPattern: /\/api\/projects\// },
    response: {
      status: 200,
      body: { success: true },
      delay: 400,
    },
  },
  {
    match: { method: "POST", urlPattern: /\/api\/invites/ },
    response: {
      status: 201,
      body: { id: "tour-invite-001", email: "newteammember@demo.com" },
      delay: 500,
    },
  },
  {
    match: { method: "POST", urlPattern: /\/api\/feedback/ },
    response: {
      status: 201,
      body: { id: "tour-feedback-001", title: "Demo feedback" },
      delay: 400,
    },
  },
];

// ── Roles ──────────────────────────────────────────────────────────────────

export const MANIFEST_ROLES = [
  { code: "ADMIN", label: "Admin", description: "Full access — manages team, projects, settings, and can impersonate users" },
  { code: "MEMBER", label: "Member", description: "Can view projects and update unit statuses" },
  { code: "CONTROLS_MANAGER", label: "Controls Manager", description: "Read-only access to project data" },
] as const;

// ── Serialized manifest for Gemini prompts ─────────────────────────────────

/**
 * Returns the manifest as a formatted string for inclusion in Gemini prompts.
 * Structured to help the model understand available pages, selectors, and roles.
 */
export function serializeManifestForPrompt(): string {
  const pagesBlock = MANIFEST_PAGES.map(
    (p) =>
      `  ${p.path} — "${p.label}": ${p.description}${p.roles ? ` [visible to: ${p.roles.join(", ")}]` : ""}`
  ).join("\n");

  const selectorsBlock = MANIFEST_SELECTORS.map(
    (s) =>
      `  "${s.selector}" → ${s.label} (page: ${s.page})${s.description ? ` — ${s.description}` : ""}`
  ).join("\n");

  const rolesBlock = MANIFEST_ROLES.map(
    (r) => `  ${r.code}: ${r.description}`
  ).join("\n");

  return `## App pages\n${pagesBlock}\n\n## Available CSS selectors (data-tour attributes)\n${selectorsBlock}\n\n## User roles\n${rolesBlock}`;
}
