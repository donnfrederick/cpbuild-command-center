/**
 * Default issue type and responsible party catalog rows.
 * Seeded by migration + bootstrap-issue-catalog (skipDuplicates — never overwrites edits).
 */

export interface IssueTypeCatalogDefinition {
  code: string;
  displayName: string;
  sortOrder: number;
  requiresVisual: boolean;
}

export interface ResponsiblePartyCatalogDefinition {
  code: string;
  displayName: string;
  sortOrder: number;
}

export const ISSUE_TYPE_CATALOG_DEFINITIONS: IssueTypeCatalogDefinition[] = [
  { code: "SUBSTRATE_CONDITION", displayName: "Substrate Condition", sortOrder: 10, requiresVisual: false },
  { code: "DAMAGED_MATERIALS", displayName: "Damaged Materials", sortOrder: 20, requiresVisual: true },
  { code: "MISSING_MATERIALS", displayName: "Missing Materials", sortOrder: 30, requiresVisual: false },
  { code: "TRADE_DAMAGE_REPAIR", displayName: "Trade Damage Repair", sortOrder: 40, requiresVisual: true },
  { code: "OTHER", displayName: "Other", sortOrder: 50, requiresVisual: false },
  { code: "MATERIAL_IN_THE_WAY", displayName: "Material in the way", sortOrder: 60, requiresVisual: false },
  {
    code: "OTHER_TRADES_OBSTRUCTION",
    displayName: "Other trades stuff in the way",
    sortOrder: 70,
    requiresVisual: false,
  },
];

export const RESPONSIBLE_PARTY_CATALOG_DEFINITIONS: ResponsiblePartyCatalogDefinition[] = [
  { code: "CP_BUILD", displayName: "CP Build", sortOrder: 10 },
  { code: "ELECTRICIAN", displayName: "Electrician", sortOrder: 20 },
  { code: "PLUMBER", displayName: "Plumber", sortOrder: 30 },
  { code: "CARPENTER", displayName: "Carpenter", sortOrder: 40 },
  { code: "GENERAL_CONTRACTOR", displayName: "General Contractor", sortOrder: 50 },
  { code: "FRAMING", displayName: "Framing", sortOrder: 60 },
  { code: "DRYWALL", displayName: "Drywall", sortOrder: 70 },
  { code: "FLOORING", displayName: "Flooring", sortOrder: 80 },
  { code: "PAINTING", displayName: "Painting", sortOrder: 90 },
  { code: "HVAC", displayName: "HVAC", sortOrder: 100 },
  { code: "FIRE_PROTECTION", displayName: "Fire Protection", sortOrder: 110 },
  { code: "LOW_VOLTAGE", displayName: "Low Voltage", sortOrder: 120 },
];

/** Slug a display name into a stable catalog code (uppercase snake). */
export function slugIssueCatalogCode(displayName: string): string {
  const base = displayName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "CUSTOM";
}
