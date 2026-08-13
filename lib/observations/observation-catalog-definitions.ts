/**
 * Default observation type catalog rows.
 * Seeded by migration + bootstrap-observation-catalog (skipDuplicates).
 */

import { slugIssueCatalogCode } from "@/lib/issues/issue-catalog-definitions";

export interface ObservationTypeCatalogDefinition {
  code: string;
  displayName: string;
  sortOrder: number;
}

export const OBSERVATION_TYPE_CATALOG_DEFINITIONS: ObservationTypeCatalogDefinition[] = [
  { code: "QUALITY", displayName: "Quality", sortOrder: 10 },
  { code: "PROGRESS", displayName: "Progress", sortOrder: 20 },
  { code: "SAFETY", displayName: "Safety", sortOrder: 30 },
  { code: "OTHER", displayName: "Other", sortOrder: 40 },
];

export function slugObservationCatalogCode(displayName: string): string {
  return slugIssueCatalogCode(displayName);
}
