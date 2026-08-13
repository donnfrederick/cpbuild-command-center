/**
 * BI API scope constants — shared between server-side auth (lib/bi-auth.ts)
 * and client components (admin UI). Kept separate from bi-auth.ts so client
 * bundles do not pull in DB/Node.js dependencies.
 */

export const BI_SCOPES = [
  "bi:projects",
  "bi:units",
  "bi:issues",
  "bi:observations",
  "bi:comments",
  "bi:inspections",
  "bi:subscopes",
  "bi:media",
  "bi:feedback",
  "bi:team",
  "bi:activity",
] as const;

export type BiScope = (typeof BI_SCOPES)[number];
